/**
 * End-to-end: a real authorization through the REAL `ksor connect` CLI, against
 * a local stand-in for the consent screen.
 *
 * Nothing here fakes consent. The fake server is the CONSENT SCREEN, standing in
 * for a browser; the flow under test is the project's own — `ksor connect
 * orcarouter`, spawned as a subprocess, exactly as a user runs it. What the
 * subprocess is handed is a browser that plays itself: it fetches the authorize
 * URL the CLI printed, which makes the fake screen deliver the callback to the
 * CLI's own loopback listener, which exchanges it and stores the key.
 *
 * That is the shape the spec asks for and the shape a unit test cannot reach:
 * the challenge, the state, the exchange body, the persistence and the printed
 * URL are all observed from OUTSIDE the process that produced them.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { browserAgainst, FAKE_ISSUED_KEY, startFakeAuthOrigin } from "./fake-auth-origin.js";

// src/lib/orcarouter/ → the package root's dist. Three levels up, not two: a
// wrong path here does not fail loudly, it spawns a module Node cannot find and
// every assertion then reads as a client bug.
const CLI = fileURLToPath(new URL("../../../dist/cli.mjs", import.meta.url));

interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run the built CLI in a scratch directory, with a browser played by the test. */
async function runConnect(
  args: readonly string[],
  env: Record<string, string>,
  opts: { onUrl?: (url: string) => void; timeoutMs?: number } = {},
): Promise<Run> {
  return await new Promise<Run>((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, "connect", "orcarouter", ...args], {
      cwd: env["KSOR_SCRATCH_DIR"] ?? process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let seenUrl = false;
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      // The CLI prints the authorize URL before it blocks; the browser is
      // played as soon as it appears.
      const match = /(http:\/\/127\.0\.0\.1:\d+\/auth\?\S+)/.exec(stdout);
      if (match !== null && !seenUrl) {
        seenUrl = true;
        opts.onUrl?.(match[1]!);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timed out; stdout=${stdout}\nstderr=${stderr}`));
    }, opts.timeoutMs ?? 30_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

let dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

function scratch(): { dir: string; env: Record<string, string> } {
  const dir = mkdtempSync(path.join(tmpdir(), "ksor-orca-e2e-"));
  dirs.push(dir);
  return {
    dir,
    env: {
      KSOR_SCRATCH_DIR: dir,
      ORCAROUTER_CREDENTIALS_FILE: path.join(dir, ".env"),
      // HERMETIC. A real environment variable wins over the file everywhere in
      // ksor — that is the contract these cases exercise — so a suite that
      // inherited an ORCAROUTER_API_KEY from the machine it runs on would
      // silently test the WRONG credential, and would carry a real key into a
      // test process. Blank is "unset": a case that wants one sets it.
      ORCAROUTER_API_KEY: "",
    },
  };
}

describe("ksor connect orcarouter — through the real CLI", () => {
  it("authorizes in a browser and stores the key it mints", async () => {
    const fake = await startFakeAuthOrigin();
    const { env } = scratch();
    try {
      const run = await runConnect(
        [],
        { ...env, ORCA_AUTH_BASE_URL: fake.origin },
        {
          onUrl: (url) => browserAgainst(fake)(url),
        },
      );

      expect(run.code, run.stderr).toBe(0);
      // The whole flow is observable from outside the process:
      //   1. the consent screen was asked, with S256 and a real callback_url
      const authorize = fake.authorizeUrls[0];
      expect(authorize?.pathname).toBe("/auth");
      expect(authorize?.searchParams.get("code_challenge_method")).toBe("S256");
      expect(authorize?.searchParams.get("callback_url")).toMatch(
        /^http:\/\/127\.0\.0\.1:\d+\/cb$/,
      );
      expect(authorize?.searchParams.get("app_name")).toBe("ksor");
      //   2. the exchange went to /api/v1/auth/keys on the AUTH origin
      expect(fake.requests.length).toBe(1);
      expect(fake.requests[0]?.path).toBe("/api/v1/auth/keys");
      expect(fake.requests[0]?.path).not.toBe("/v1/auth/keys");
      //   3. the verifier is in the exchange body and NOT on the authorize URL
      const verifier = String(fake.requests[0]?.body["code_verifier"] ?? "");
      expect(verifier).not.toBe("");
      expect(authorize?.toString() ?? "").not.toContain(verifier);
      expect(fake.requests[0]?.body["code_challenge_method"]).toBe("S256");
      //   4. the key reached the record's .env, and the verifier did not
      const stored = readFileSync(path.join(env["KSOR_SCRATCH_DIR"]!, ".env"), "utf8");
      expect(stored).toContain(FAKE_ISSUED_KEY);
      expect(stored).not.toContain(verifier);
      //   5. and nothing printed the key or the verifier
      expect(run.stdout).not.toContain(FAKE_ISSUED_KEY);
      expect(run.stdout).not.toContain(verifier);
      expect(run.stderr).not.toContain(verifier);
    } finally {
      await fake.close();
    }
  });

  it("--status shows the credential MASKED, never in full", async () => {
    const fake = await startFakeAuthOrigin();
    const { env } = scratch();
    try {
      await runConnect(
        [],
        { ...env, ORCA_AUTH_BASE_URL: fake.origin },
        {
          onUrl: (url) => browserAgainst(fake)(url),
        },
      );
      const run = await runConnect(["--status"], { ...env, ORCA_AUTH_BASE_URL: fake.origin });
      expect(run.code).toBe(0);
      expect(run.stdout).toContain("sk-orca-");
      expect(run.stdout).not.toContain(FAKE_ISSUED_KEY);
      // The mask discloses the LENGTH and nothing else — the head it keeps is
      // the `sk-orca-` prefix, and no segment of the body survives.
      expect(run.stdout).toMatch(new RegExp(`\\(${FAKE_ISSUED_KEY.length}\\)`));
      expect(run.stdout).not.toMatch(/minted-by-the-fake/);
    } finally {
      await fake.close();
    }
  });

  it("--clear removes it, and --status then says so", async () => {
    const fake = await startFakeAuthOrigin();
    const { env, dir } = scratch();
    try {
      await runConnect(
        [],
        { ...env, ORCA_AUTH_BASE_URL: fake.origin },
        {
          onUrl: (url) => browserAgainst(fake)(url),
        },
      );
      expect(existsSync(path.join(dir, ".env"))).toBe(true);

      const cleared = await runConnect(["--clear"], env);
      expect(cleared.code).toBe(0);
      expect(readFileSync(path.join(dir, ".env"), "utf8")).not.toContain(FAKE_ISSUED_KEY);

      const status = await runConnect(["--status"], env);
      expect(status.stdout).toContain("no OrcaRouter credential");
    } finally {
      await fake.close();
    }
  });

  it("--key stores a pasted key WITHOUT starting an authorization", async () => {
    const fake = await startFakeAuthOrigin();
    const { env } = scratch();
    try {
      const pasted = "sk-orca-pasted-by-the-user-0001";
      const run = await runConnect(["--key"], {
        ...env,
        ORCA_AUTH_BASE_URL: fake.origin,
        ORCAROUTER_API_KEY: pasted,
      });
      // The second entry reaches the same store without a browser at all.
      expect(run.code, run.stderr).toBe(0);
      expect(readFileSync(path.join(env["KSOR_SCRATCH_DIR"]!, ".env"), "utf8")).toContain(pasted);
      // No consent screen was ever contacted — that is the whole point of
      // keeping the two entries separate.
      expect(fake.authorizeUrls).toEqual([]);
      expect(fake.requests).toEqual([]);
    } finally {
      await fake.close();
    }
  });

  it("a denial ends cleanly, with a sentence and no stored key", async () => {
    const fake = await startFakeAuthOrigin({ outcome: "deny" });
    const { env, dir } = scratch();
    try {
      const run = await runConnect(
        [],
        { ...env, ORCA_AUTH_BASE_URL: fake.origin },
        {
          onUrl: (url) => browserAgainst(fake)(url),
        },
      );
      // It does not hang, it does not crash on a missing field, and it says so.
      expect(run.code).toBe(1);
      expect(run.stderr).toMatch(/declined|refused/i);
      expect(existsSync(path.join(dir, ".env"))).toBe(false);
    } finally {
      await fake.close();
    }
  });

  it("the out-of-band door prints the URL and exchanges a pasted code", async () => {
    const fake = await startFakeAuthOrigin();
    const { env } = scratch();
    try {
      const child = spawn(
        process.execPath,
        [CLI, "connect", "orcarouter", "--oob", "--no-browser"],
        {
          cwd: env["KSOR_SCRATCH_DIR"]!,
          env: { ...process.env, ...env, ORCA_AUTH_BASE_URL: fake.origin },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let stdout = "";
      child.stdout.on("data", (c: Buffer) => {
        stdout += c.toString();
      });
      let stderr = "";
      child.stderr.on("data", (c: Buffer) => {
        stderr += c.toString();
      });

      // Wait for the authorize URL, then play the browser at it so the fake
      // consent screen mints a code — which is what a human would read off the
      // screen and type in.
      const url = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no URL; ${stdout}`)), 20_000);
        const poll = setInterval(() => {
          const match = /(http:\/\/127\.0\.0\.1:\d+\/auth\?\S+)/.exec(stdout);
          if (match !== null) {
            clearInterval(poll);
            clearTimeout(timer);
            resolve(match[1]!);
          }
        }, 100);
      });
      expect(new URL(url).searchParams.get("callback_url")).toBe("oob");
      expect(new URL(url).searchParams.get("code_challenge_method")).toBe("S256");
      await fetch(url);
      child.stdin.write(`${fake.lastCode()}\n`);

      const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
      expect(code, stderr).toBe(0);
      expect(fake.requests[0]?.path).toBe("/api/v1/auth/keys");
      expect(readFileSync(path.join(env["KSOR_SCRATCH_DIR"]!, ".env"), "utf8")).toContain(
        FAKE_ISSUED_KEY,
      );
    } finally {
      await fake.close();
    }
  }, 60_000);
});
