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
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  // `Number("abc")` is NaN, and `listen(NaN)` binds an arbitrary free port
  // while the log prints `http://localhost:NaN` — a server you cannot find.
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
 * Stream a file, and survive it failing to open.
 *
 * `pipe()` attaches an 'error' listener to the DESTINATION, never to the
 * source — so an error on the read stream has no listener and becomes an
 * uncaught exception, which is the same way a malformed URL used to end this
 * process. `statSync().isFile()` above does not make the later `open()` safe:
 * the file can go between the two, and it does, in the ordinary loop this
 * command exists for — the adopter leaves `preview` running and rebuilds in
 * another pane, the export is torn down and rewritten, and an asset the open
 * page re-requests is gone (`ENOENT`). A mode-000 file anywhere in the export
 * is the same crash with no timing at all (`EACCES`, reproduced).
 */
function send(res, file, status, type) {
  const stream = createReadStream(file);
  stream.on("error", (error) => {
    // The headers are already out, so there is no status left to send: end the
    // body and keep serving. A preview that dies mid-asset is worse than one
    // that serves a short page — but a silently truncated page is its own kind
    // of lie, so the reason goes to the console where the adopter is watching.
    console.error(`preview: could not read ${path.relative(ROOT, file)} — ${error.message}`);
    res.end();
  });
  res.writeHead(status, { "content-type": type });
  stream.pipe(res);
}

createServer((req, res) => {
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
})
  .on("error", (error) => {
    // Errors are documentation. Without this an occupied port is a raw
    // `EADDRINUSE` stack trace — and the port most likely to be occupied is
    // 3000, which `dev` also defaults to, so "I ran preview after dev" is the
    // common case rather than an edge one.
    if (error.code === "EADDRINUSE") {
      console.error(`preview: port ${PORT} is already in use — set PORT to a free one.`);
      console.error("  `dev` uses 3000 too, so stop it first or run `PORT=3001 preview`.");
    } else {
      console.error(`preview: could not listen on ${PORT} — ${error.message}`);
    }
    process.exit(3);
  })
  // Loopback explicitly. The line below has always said `localhost`, and an
  // omitted host binds every interface — so the export, and any draft in it,
  // was reachable from the whole network while the log promised otherwise.
  // This is a preview; it binds where it says it binds.
  .listen(PORT, "127.0.0.1", () => {
    console.log(
      `preview: serving ${path.relative(process.cwd(), ROOT)} on http://localhost:${PORT}`,
    );
    console.log("  this is the STATIC EXPORT — the same bytes a host would serve.");
  });
