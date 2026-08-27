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
import os, { tmpdir } from "node:os";
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
    // Restore the mode-000 fixture. NOT because `unlink` needs it — that wants
    // write+execute on the PARENT directory and ignores the file's own mode —
    // but so a developer poking at a leftover tmpdir is not blocked by it.
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
  /** The tmp root, so a test can remove a file out from under the server. */
  readonly root: string;
  /** Everything the child has written to stderr so far. */
  readonly errText: () => string;
}

/** A preview server over an export built to order. `index` false omits `out/index.html`. */
async function preview(opts: {
  index: boolean;
  locked?: boolean;
  vanishing?: boolean;
}): Promise<Fixture> {
  const root = mkdtempSync(path.join(tmpdir(), "ksor-preview-"));
  roots.push(root);
  // `preview.mjs` resolves its ROOT as `out/` beside ITSELF, so the copy and the
  // export have to sit together exactly as they do in a scaffold.
  copyFileSync(PREVIEW, path.join(root, "preview.mjs"));
  const out = path.join(root, "out");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "marker.txt"), "inside-the-export\n");
  if (opts.index) writeFileSync(path.join(out, "index.html"), "<!doctype html><title>ok</title>\n");
  if (opts.vanishing === true) writeFileSync(path.join(out, "vanishes.txt"), "gone soon\n");
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
  return { base: `http://127.0.0.1:${port}`, child, root, errText: () => errText };
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

  // Root holds CAP_DAC_OVERRIDE, so `open()` on a mode-000 file succeeds and no
  // EACCES is raised — the fixture would not apply and the suite would go red
  // for a reason that reads as "the fix is broken". CI runs as `runner`, not
  // root; this is for a developer inside a root dev container.
  it.skipIf(process.getuid?.() === 0)(
    "survives a file it cannot READ, and says why",
    async () => {
      // The other half of the same crash: `pipe()` never listens on the source,
      // so `EACCES` on open was an uncaught exception. Reproduced before the fix.
      const { base, errText } = await preview({ index: true, locked: true });
      // 500, NOT 200-with-an-empty-body: the head is written on the stream's
      // 'open', so a file that never opens can still answer honestly. Writing it
      // first produced a complete, valid, EMPTY 200 — the same silent lie one
      // layer down.
      expect(await status(base, "/locked.txt"), "an unreadable file answers 500").toBe(500);
      expect(await status(base, "/"), "the server is still answering after it").toBe(200);
      expect(
        errText(),
        "a truncated response must explain itself rather than arrive silently",
      ).toContain("could not read");
    },
    60_000,
  );

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

/**
 * The three refusals and the bind — advertised in the changeset, and until now
 * asserted nowhere. Each spawns the shipped file directly rather than through
 * `preview()`, because what is under test is that it never reaches "serving".
 */
describe("the preview server refuses a bad environment, and says which", () => {
  /** Spawn the shipped preview against a throwaway export and collect its ending. */
  async function spawnPreview(env: Record<string, string>): Promise<{
    code: number | null;
    err: string;
  }> {
    const root = mkdtempSync(path.join(tmpdir(), "ksor-preview-env-"));
    roots.push(root);
    copyFileSync(PREVIEW, path.join(root, "preview.mjs"));
    mkdirSync(path.join(root, "out"), { recursive: true });
    writeFileSync(path.join(root, "out", "index.html"), "<!doctype html>\n");
    const child = spawn(process.execPath, [path.join(root, "preview.mjs")], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    started.push(child);
    let err = "";
    child.stderr?.on("data", (b: Buffer) => (err += b.toString()));
    const code = await new Promise<number | null>((resolve) => child.on("exit", resolve));
    return { code, err };
  }

  // `Number("")` and `Number(" ")` are 0, and `Number("abc")` is NaN. All three
  // used to reach `listen()`, bind an arbitrary port, and print a URL that
  // cannot connect — which is the defect the guard exists for, so the guard has
  // to cover them and not just the obvious one.
  it.each(["abc", "", " ", "0", "70000", "-1"])(
    "refuses PORT=%j with exit 3 and names the value",
    async (port) => {
      const { code, err } = await spawnPreview({ PORT: port });
      expect(code, `PORT=${JSON.stringify(port)}: ${err}`).toBe(3);
      expect(err, "the refusal quotes what it was given").toContain("PORT must be a port number");
    },
    30_000,
  );

  /** Start the shipped preview and return the line it printed when it came up. */
  async function spawnPreviewServing(env: Record<string, string>): Promise<{ log: string }> {
    const root = mkdtempSync(path.join(tmpdir(), "ksor-preview-host-"));
    roots.push(root);
    copyFileSync(PREVIEW, path.join(root, "preview.mjs"));
    mkdirSync(path.join(root, "out"), { recursive: true });
    writeFileSync(path.join(root, "out", "index.html"), "<!doctype html>\n");
    const port = await freePort();
    const child = spawn(process.execPath, [path.join(root, "preview.mjs")], {
      cwd: root,
      env: { ...process.env, KSOR_PREVIEW_HOST: "", PORT: String(port), ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    started.push(child);
    const log = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("preview did not start")), 15_000);
      child.stdout?.on("data", (b: Buffer) => {
        const line = b.toString();
        if (line.includes("serving")) {
          clearTimeout(timer);
          resolve(line);
        }
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`preview exited before it served: ${String(code)}`));
      });
    });
    return { log };
  }

  it("refuses an occupied port with exit 3, and names the dev collision", async () => {
    const holder = createServer();
    const port = await new Promise<number>((resolve) =>
      holder.listen(0, "127.0.0.1", () => {
        const a = holder.address();
        resolve(typeof a === "object" && a !== null ? a.port : 0);
      }),
    );
    try {
      const { code, err } = await spawnPreview({ PORT: String(port) });
      expect(code, err).toBe(3);
      expect(err, "an occupied port must not be a raw EADDRINUSE trace").toContain(
        "already in use",
      );
      expect(err, "and it names why 3000 is the one you hit").toContain("dev");
    } finally {
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  }, 30_000);

  it("binds loopback by default", async () => {
    // A behaviour change to a shipped file: it was every interface while the
    // log said `localhost`. Asserted from a non-internal address so "refused"
    // cannot be confused with "not running".
    const external = Object.values(os.networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .find((entry) => entry.family === "IPv4" && !entry.internal);
    const { base } = await preview({ index: true });
    expect(await status(base, "/"), "loopback still serves").toBe(200);
    if (external === undefined) {
      // A silent `return` here would be a green tick asserting nothing, so say
      // what happened instead: this machine has no non-internal IPv4 to try.
      expect(true, "skipped: no external IPv4 on this machine").toBe(true);
      return;
    }
    const port = new URL(base).port;
    // Timed: with the fix reverted AND a packet-dropping firewall in front, an
    // untimed fetch hangs to the suite timeout and reports as a timeout rather
    // than as the defect.
    const reachable = await fetch(`http://${external.address}:${port}/`, {
      signal: AbortSignal.timeout(5_000),
    })
      .then(() => true)
      .catch(() => false);
    expect(reachable, `${external.address}:${port} must NOT answer — the log says localhost`).toBe(
      false,
    );
  }, 60_000);

  it("KSOR_PREVIEW_HOST is the way out, and a BLANK one is not", async () => {
    // The escape hatch exists because loopback breaks `docker run -p`, a cloud
    // dev box, and the built site on a phone. A blank value must not take it:
    // `listen(port, "")` binds every interface, which is the same shape `PORT`
    // is guarded against and the same way to reach it.
    const wide = await spawnPreviewServing({ KSOR_PREVIEW_HOST: "0.0.0.0" });
    expect(wide.log, "an explicit host is honoured AND printed").toContain("http://0.0.0.0:");
    const blank = await spawnPreviewServing({ KSOR_PREVIEW_HOST: "  " });
    expect(blank.log, "a blank host falls back to loopback rather than widening").toContain(
      "http://localhost:",
    );
  }, 60_000);

  it("refuses a host nothing here can bind, naming the variable", async () => {
    // 203.0.113.0/24 is TEST-NET-3 — reserved for documentation, never local.
    const { code, err } = await spawnPreview({ KSOR_PREVIEW_HOST: "203.0.113.1" });
    expect(code, err).toBe(3);
    expect(err, "the refusal names the knob to turn").toContain("KSOR_PREVIEW_HOST");
  }, 30_000);

  it("answers 404 for a file that VANISHED and 500 for one it cannot read", async () => {
    // The two open failures are different facts and had one message. ENOENT is
    // the ordinary case — the export was rebuilt under an open page — and "500,
    // the file is there" states the opposite of what happened.
    const { base, root } = await preview({ index: true, locked: true, vanishing: true });
    rmSync(path.join(root, "out", "vanishes.txt"), { force: true });
    expect(await status(base, "/vanishes.txt"), "a resource that has gone is 404").toBe(404);
    expect(await status(base, "/locked.txt"), "a file that is there and unreadable is 500").toBe(
      500,
    );
  }, 60_000);
});
