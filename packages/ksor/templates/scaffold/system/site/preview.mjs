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
  // Contain every request inside the export: a `..` that resolves outside it
  // is refused rather than served, even in a preview.
  const target = path.resolve(ROOT, `.${decoded}`);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;

  for (const candidate of [target, path.join(target, "index.html"), `${target}.html`]) {
    // `${target}.html` is the ONE candidate that can sit outside the check
    // above: for `/`, target IS the root and the sibling `out.html` would be
    // read. Containment is asserted per candidate rather than once, so the
    // shapes we try can never outrun the rule they are tried under.
    if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) continue;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

createServer((req, res) => {
  const file = resolve(req.url ?? "/");
  if (file === null) {
    const notFound = path.join(ROOT, "404.html");
    try {
      statSync(notFound);
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      createReadStream(notFound).pipe(res);
      return;
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("404\n");
      return;
    }
  }
  res.writeHead(200, {
    "content-type": TYPES.get(path.extname(file)) ?? "application/octet-stream",
  });
  createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`preview: serving ${path.relative(process.cwd(), ROOT)} on http://localhost:${PORT}`);
  console.log("  this is the STATIC EXPORT — the same bytes a host would serve.");
});
