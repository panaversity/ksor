/**
 * Serve the STATIC EXPORT, so the build has somewhere to land.
 *
 * The site is `output: "export"` — there is no server to start, which is what
 * makes the record hostable anywhere. But it also means the `start` script
 * every other project has does not exist here, and running one is the first
 * instinct after a build; the package manager then reports a missing script,
 * which explains nothing about why there is nothing to start.
 *
 * So this is the answer to "and now how do I look at it". It is node:http and
 * nothing else — no dependency to install and no network fetch, so it works
 * offline and behind a firewall, for the same reason the build itself
 * downloads nothing.
 *
 * Names no package manager on purpose: this file ships in the npm and bun
 * scaffolds too, and those must not carry another manager's vocabulary
 * (asserted by `init-manager.integration.test.ts`).
 *
 * It is a PREVIEW, not a deployment: single process, no compression, no
 * caching headers. Put the directory behind a real web server or a static
 * host for anything else.
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "out");
const PORT = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  // `Number("abc")` is NaN and `listen(NaN)` binds an arbitrary free port while
  // the log prints `http://localhost:NaN` — a server you cannot find. So do
  // `Number("")` and `Number(" ")`, which are 0: an unset `PORT=` in a shell or
  // a compose file is the common way to reach this, and `listen(0)` has exactly
  // the same ending. Hence 1, not 0.
  console.error(`preview: PORT must be a port number, got ${JSON.stringify(process.env.PORT)}`);
  process.exit(3);
}

const TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"],
]);

try {
  statSync(ROOT);
} catch {
  console.error(`preview: ${ROOT} does not exist — run the build first.`);
  process.exit(3);
}

/** The file a request resolves to, or null when it escapes the export. */
function resolve(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    // `decodeURIComponent` THROWS on a malformed escape — `/%`, `/%zz`, a
    // truncated multi-byte sequence. Thrown from a request listener that is an
    // uncaught exception, and the whole preview server exits: one `curl
    // http://localhost:3000/%` took it down mid-review, leaving the adopter
    // with a dead port and a stack trace instead of a page. A request we
    // cannot parse is a request that resolves to nothing.
    return null;
  }
  // Contain every request inside the export: a `..` that resolves outside it —
  // raw or percent-encoded — is refused rather than served, even in a preview.
  // The check is LEXICAL, so it bounds paths and not the filesystem: a symlink
  // INSIDE `out/` still leads wherever it points, because `statSync` follows it
  // and these are strings. A Next export authors no symlinks, so that is a
  // stated limit rather than a known hole; `realpathSync` on the winner is what
  // would close it if an export ever carries one.
  const target = path.resolve(ROOT, `.${decoded}`);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;

  for (const candidate of [target, path.join(target, "index.html"), `${target}.html`]) {
    // `${target}.html` is the one candidate that can sit outside the check
    // above: whenever the target IS the root — `/`, `/.`, `/x/..` — it names
    // the sibling `out.html`. Reachable only when the export has no
    // `index.html` (candidate 2 wins otherwise), which is why the test builds
    // an export without one. Containment is asserted per candidate rather than
    // once, so the shapes we try can never outrun the rule they are tried under.
    if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) continue;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

/**
 * Stream a file, and answer honestly when it cannot be read.
 *
 * `pipe()` attaches an 'error' listener to the DESTINATION, never to the
 * source — so an error on the read stream has no listener and becomes an
 * uncaught exception, which is how a malformed URL used to end this process.
 * `statSync().isFile()` in `resolve()` does not make the later `open()` safe:
 * the file can go between the two, and it does, in the ordinary loop this
 * command exists for — the adopter leaves `preview` running and rebuilds in
 * another pane, the export is torn down and rewritten, and an asset the open
 * page re-requests is gone (`ENOENT`). A mode-000 file anywhere in the export
 * is the same crash with no timing at all (`EACCES`, reproduced).
 *
 * The head is written on 'open', NOT before it. Writing it first meant an
 * unreadable file answered `200` with an empty body and a valid terminating
 * chunk — a complete, successful response carrying nothing, which a browser
 * renders as a blank page and `fetch().text()` reports as `""`. That is the
 * same silent lie this file exists to stop telling, moved one layer down.
 * Once the head IS out there is no status left to send, so a failure part way
 * through destroys the socket instead of ending it cleanly: a truncated
 * response is what the client must see, because it is what happened.
 */
function send(res, file, status, type) {
  const stream = createReadStream(file);
  let headSent = false;
  stream.on("open", () => {
    headSent = true;
    res.writeHead(status, { "content-type": type });
    stream.pipe(res);
  });
  stream.on("error", (error) => {
    console.error(`preview: could not read ${path.relative(ROOT, file)} — ${error.message}`);
    if (headSent) {
      res.destroy();
      return;
    }
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("500 — the file is there and could not be read; see the preview log\n");
  });
  // A client that navigates away leaves the source with no consumer: `pipe()`
  // unpipes on the destination's close but never destroys the readable, so
  // 'end' never fires, `autoClose` never runs, and the fd leaks — one per
  // cancelled image load.
  res.on("close", () => stream.destroy());
}

const server = createServer((req, res) => {
  const file = resolve(req.url ?? "/");
  if (file === null) {
    const notFound = path.join(ROOT, "404.html");
    try {
      statSync(notFound);
      send(res, notFound, 404, "text/html; charset=utf-8");
      return;
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("404\n");
      return;
    }
  }
  send(res, file, 200, TYPES.get(path.extname(file)) ?? "application/octet-stream");
});

// Loopback by default, and NOT hardcoded. An omitted host binds every
// interface while the log below has always said `localhost`, so it now binds
// where it says it binds. But that breaks the cases where reaching it from
// elsewhere is the point — `docker run -p`, a cloud dev box addressed by IP,
// or opening the built site on a phone on the same wifi — and those fail as a
// refused connection, which reaches no process and so can document nothing.
// `HOST` is the escape hatch, `PORT` was already one, and the log prints
// whichever was used.
const HOST = process.env.HOST ?? "127.0.0.1";

let listening = false;
server.on("error", (error) => {
  // Errors are documentation. Without this an occupied port is a raw
  // `EADDRINUSE` stack trace — and the port most likely to be occupied is
  // 3000, which `dev` also defaults to, so "I ran preview after dev" is the
  // common case rather than an edge one.
  if (!listening) {
    if (error.code === "EADDRINUSE") {
      console.error(`preview: port ${PORT} is already in use — set PORT to a free one.`);
      console.error("  `dev` uses 3000 too, so stop it first or run `PORT=3001 preview`.");
    } else if (error.code === "EADDRNOTAVAIL") {
      console.error(`preview: nothing here can bind ${HOST} — check HOST.`);
    } else {
      console.error(`preview: could not listen on ${HOST}:${PORT} — ${error.message}`);
    }
    process.exit(3);
  }
  // AFTER it is up, an error is an accept-path condition (EMFILE and friends),
  // and exiting on it would be the very thing this file exists to stop: one
  // transient ending the session.
  console.error(`preview: ${error.message} — still serving.`);
});

server.listen(PORT, HOST, () => {
  listening = true;
  const shown = HOST === "127.0.0.1" ? "localhost" : HOST;
  console.log(`preview: serving ${path.relative(process.cwd(), ROOT)} on http://${shown}:${PORT}`);
  console.log("  this is the STATIC EXPORT — the same bytes a host would serve.");
});
