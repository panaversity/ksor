/**
 * `pnpm preview` must survive what it cannot parse and what it cannot read, and
 * must not serve outside the export.
 *
 * Two crashes of one shape. `decodeURIComponent` throws `URIError` on a
 * malformed escape; `createReadStream(...).pipe(res)` attaches an error
 * listener to the DESTINATION and never to the source. Either throw reaches a
 * `node:http` request listener with nobody watching, which is an uncaught
 * exception — the process exits and the adopter gets a dead port and a stack
 * trace instead of a page. The first is `/%`; the second is a mode-000 file in
 * the export, or the ordinary loop of rebuilding while the preview runs.
 *
 * Integration tier because it spawns the real shipped file against a real
 * directory: the point is what `preview.mjs` DOES. It runs against the template
 * rather than a built scaffold, so it costs directories and processes rather
 * than an install and a Next build.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW = path.join(here, "..", "templates", "scaffold", "system", "site", "preview.mjs");

const started: ChildProcess[] = [];
const roots: string[] = [];

afterAll(() => {
  for (const child of started.splice(0)) child.kill();
  for (const root of roots.splice(0)) {
    // A mode-000 fixture file cannot be removed until it is readable again.
    try {
      chmodSync(path.join(root, "out", "locked.txt"), 0o644);
    } catch {
      // Not every fixture writes one.
    }
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * A free port, taken by binding one and releasing it.
 *
 * NOT a guess in a range: both other static servers in this repo carry a
 * recorded review finding against fixed ports leaking `EADDRINUSE` on a busy
 * machine (2026-08-18), and a `39000 + random` draw is the same defect with
 * better odds. `listen(0)` is unavailable because the port has to be handed to
 * a CHILD, so this narrows the window to the microseconds between close and
 * spawn instead of leaving it to a 1-in-900 collision.
 */
async function freePort(): Promise<number> {
  const probe = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") reject(new Error("no port"));
      else resolve(address.port);
    });
  });
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

interface Fixture {
  readonly base: string;
  readonly child: ChildProcess;
}

/** A preview server over an export built to order. `index` false omits `out/index.html`. */
async function preview(opts: { index: boolean; locked?: boolean }): Promise<Fixture> {
  const root = mkdtempSync(path.join(tmpdir(), "ksor-preview-"));
  roots.push(root);
  // `preview.mjs` resolves its ROOT as `out/` beside ITSELF, so the copy and the
  // export have to sit together exactly as they do in a scaffold.
  copyFileSync(PREVIEW, path.join(root, "preview.mjs"));
  const out = path.join(root, "out");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "marker.txt"), "inside-the-export\n");
  if (opts.index) writeFileSync(path.join(out, "index.html"), "<!doctype html><title>ok</title>\n");
  if (opts.locked === true) {
    writeFileSync(path.join(out, "locked.txt"), "unreadable\n");
    chmodSync(path.join(out, "locked.txt"), 0o000);
  }
  // The sibling of the export root that `${target}.html` resolves to for `/`.
  writeFileSync(path.join(root, "out.html"), "<!doctype html><title>ESCAPED</title>\n");

  const port = await freePort();
  const child = spawn(process.execPath, [path.join(root, "preview.mjs")], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  started.push(child);
  // stderr is drained rather than left to fill its pipe, and kept so a test can
  // assert the server EXPLAINED itself rather than merely surviving.
  let errText = "";
  child.stderr?.on("data", (b: Buffer) => (errText += b.toString()));
  Object.defineProperty(child, "errText", { get: () => errText });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`preview did not start: ${errText}`)), 15_000);
    child.stdout?.on("data", (b: Buffer) => {
      if (b.toString().includes("serving")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`preview exited before it served (${String(code)}): ${errText}`));
    });
  });
  return { base: `http://127.0.0.1:${port}`, child };
}

/** The status, or null when the connection failed — which is what a dead server looks like. */
async function status(base: string, pathname: string): Promise<number | null> {
  try {
    return (await fetch(`${base}${pathname}`)).status;
  } catch {
    return null;
  }
}

/**
 * A request written onto the socket verbatim.
 *
 * `fetch()` parses through the WHATWG URL parser, which pops `..` segments
 * BEFORE serialising — so `fetch("…/../../etc/passwd")` puts `GET /etc/passwd`
 * on the wire and tests nothing about traversal. Only a raw socket can ask the
 * question the server is supposed to refuse.
 */
function rawGet(base: string, target: string): Promise<string> {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(port), hostname, () => {
      socket.write(`GET ${target} HTTP/1.1\r\nHost: ${hostname}\r\nConnection: close\r\n\r\n`);
    });
    let body = "";
    socket.setTimeout(10_000, () => {
      socket.destroy();
      reject(new Error("raw request timed out"));
    });
    socket.on("data", (b: Buffer) => (body += b.toString()));
    socket.on("end", () => resolve(body));
    socket.on("error", reject);
  });
}

describe("the preview server survives what a browser and a scanner send it", () => {
  it("serves the export, and keeps serving after every hostile URL", async () => {
    const { base } = await preview({ index: true });
    expect(await status(base, "/"), "the export's own index").toBe(200);
    // Each of these was, or could have been, the last request it answered.
    for (const [bad, why] of [
      ["/%", "a bare percent — the shortest malformed escape there is"],
      ["/%zz", "a percent followed by non-hex"],
      ["/%E0%A4", "a truncated multi-byte sequence"],
    ] as const) {
      expect(await status(base, bad), `${bad} (${why}) must not be fatal`).toBe(404);
      expect(await status(base, "/"), `still answering after ${bad}`).toBe(200);
    }
  }, 60_000);

  it("survives a file it cannot READ, and says why", async () => {
    // The other half of the same crash: `pipe()` never listens on the source,
    // so `EACCES` on open was an uncaught exception. Reproduced before the fix.
    const { base, child } = await preview({ index: true, locked: true });
    expect(
      await status(base, "/locked.txt"),
      "an unreadable file must not be fatal",
    ).not.toBeNull();
    expect(await status(base, "/"), "the server is still answering after it").toBe(200);
    expect(
      (child as unknown as { errText: string }).errText,
      "a truncated response must explain itself rather than arrive silently",
    ).toContain("could not read");
  }, 60_000);

  it("refuses a percent-encoded traversal, written raw onto the socket", async () => {
    const { base } = await preview({ index: true });
    // `%2e%2e%2f` survives the URL parser as one opaque segment, so this is the
    // case that actually exercises decode-then-resolve.
    expect(await status(base, "/%2e%2e%2f%2e%2e%2fetc%2fpasswd")).toBe(404);
    // ...and the raw form, which `fetch` would have normalised away entirely.
    const raw = await rawGet(base, "/../../etc/passwd");
    expect(raw.split("\r\n")[0], `raw traversal: ${JSON.stringify(raw.slice(0, 120))}`).toContain(
      "404",
    );
  }, 60_000);

  it("does not serve the sibling `out.html` when the export has no index", async () => {
    // THE CONTAINMENT CASE, and it needs an export with no `index.html`.
    // With one, candidate 2 wins and `${target}.html` — the only candidate that
    // resolves outside the export, and the only reason the per-candidate check
    // exists — is never evaluated. The first version of this test asserted the
    // rule against a fixture that could not reach it, and passed with the check
    // deleted.
    const { base } = await preview({ index: false });
    const response = await fetch(`${base}/`);
    const body = await response.text();
    expect(body, "served the file BESIDE the export instead of refusing").not.toContain("ESCAPED");
    expect(response.status, `served ${JSON.stringify(body.slice(0, 80))}`).toBe(404);
    // The export itself is still reachable, so "refused" cannot be confused
    // with "broken".
    expect(await status(base, "/marker.txt"), "the export is still served").toBe(200);
  }, 60_000);
});
