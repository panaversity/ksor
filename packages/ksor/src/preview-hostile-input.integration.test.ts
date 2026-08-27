/**
 * `pnpm preview` must survive a URL it cannot parse, and must not serve outside
 * the export.
 *
 * One request to `/%` used to kill it. `decodeURIComponent` throws `URIError` on
 * a malformed escape, and a throw from a `node:http` request listener is an
 * uncaught exception — so the process exited and the adopter got a dead port and
 * a stack trace instead of a page. It is the command the scaffold offers as "and
 * now how do I look at it", so the first hostile URL a browser extension or a
 * scanner sends ends the session.
 *
 * Integration tier because it spawns the real shipped file against a real
 * directory: the point is what `preview.mjs` DOES, not what a copy of its logic
 * would do. Run against the template rather than a built scaffold, so this costs
 * a directory and a process rather than an install and a Next build.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, copyFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW = path.join(here, "..", "templates", "scaffold", "system", "site", "preview.mjs");

let root: string;
let child: ReturnType<typeof spawn>;
let base: string;

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "ksor-preview-"));
  // `preview.mjs` resolves its ROOT as `out/` beside ITSELF, so the copy and the
  // export have to sit together exactly as they do in a scaffold.
  copyFileSync(PREVIEW, path.join(root, "preview.mjs"));
  const out = path.join(root, "out");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "index.html"), "<!doctype html><title>ok</title>\n");
  // A sibling of the export root, which `${target}.html` for `/` would reach if
  // containment were checked once on the target instead of per candidate.
  writeFileSync(path.join(root, "out.html"), "<!doctype html><title>ESCAPED</title>\n");

  // Port 0 is not offered, so pick one high and unlikely and let the failure be
  // loud if it is taken — a silent fallback would test nothing.
  const port = 39000 + Math.floor(process.hrtime()[1] % 900);
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(root, "preview.mjs")], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("preview did not start")), 15_000);
    child.stdout?.on("data", (b: Buffer) => {
      if (b.toString().includes("serving")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`preview exited before it served: ${String(code)}`));
    });
  });
}, 30_000);

afterAll(() => {
  child?.kill();
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

/** The status, or null when the connection failed — which is what a dead server looks like. */
async function status(pathname: string): Promise<number | null> {
  try {
    return (await fetch(`${base}${pathname}`)).status;
  } catch {
    return null;
  }
}

describe("the preview server survives what a browser and a scanner send it", () => {
  it("serves the export", async () => {
    expect(await status("/"), "the export's own index").toBe(200);
  });

  // Each of these used to be, or could have been, the last request it answered.
  it.each([
    ["/%", "a bare percent — the shortest malformed escape there is"],
    ["/%zz", "a percent followed by non-hex"],
    ["/%E0%A4", "a truncated multi-byte sequence"],
  ])("answers %s (%s) and stays up", async (bad) => {
    expect(await status(bad), `${bad} must not be fatal`).toBe(404);
    expect(await status("/"), "the server is still answering after it").toBe(200);
  });

  it.each([
    ["/../../etc/passwd", "raw traversal"],
    ["/%2e%2e%2f%2e%2e%2fetc%2fpasswd", "percent-encoded traversal, which decoding re-enables"],
  ])("refuses %s (%s)", async (escape) => {
    expect(await status(escape), `${escape} escapes the export`).toBe(404);
  });

  it("does not serve the sibling `out.html` for `/`", async () => {
    // `${target}.html` is the one candidate that lands outside the export, and
    // only for the root request — where target IS the root. A containment check
    // run once on the target waves it through; run per candidate, it does not.
    const body = await (await fetch(`${base}/`)).text();
    expect(body, "served the file beside the export instead of the one inside it").not.toContain(
      "ESCAPED",
    );
  });
});
