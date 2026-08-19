import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Integration tests exercise the BUILT artifact — the same file the published
// bin points at — not the TypeScript source. Run `pnpm build` first.
const distCli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, [distCli, ...args], {
    encoding: "utf8",
  });
}

describe("ksor CLI (built artifact)", () => {
  it("has a built artifact to test", () => {
    expect(
      existsSync(distCli),
      `${distCli} is missing — run \`pnpm build\` first; integration tests exercise the built artifact, not src/`,
    ).toBe(true);
  });

  it("answers honestly with exit 2 and the reservation notice", () => {
    const result = runCli([]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("the name is reserved");
    expect(result.stdout).toContain("github.com/panaversity/ksor");
  });

  it("names the verb it refuses to fake", () => {
    const result = runCli(["build"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("ksor build: designed but not implemented");
  });

  it("refuses an unknown verb with exit 1 and a stable error slug", () => {
    const result = runCli(["frobnicate"]);
    expect(result.status).toBe(1);
    expect(result.stderr.split("\n")[0]).toBe("error: unknown-verb");
    expect(result.stderr).toContain("init, dev, build, serve");
  });

  it("answers --help and -h with usage and exit 0 — help is not an unimplemented verb", () => {
    for (const flag of ["--help", "-h"]) {
      const result = runCli([flag]);
      expect(result.status, `${flag} exit code`).toBe(0);
      expect(result.stdout).toContain("Usage: ksor <verb>");
      expect(result.stdout).toContain("init and serve are implemented");
    }
  });

  it("serve exits 3 with a remedy when the kernel gateway is not installed", () => {
    // A temp cwd with no node_modules: the CLI is zero-dep and SPAWNS the
    // kernel gateway, so an uninstalled kernel is an environment failure (3),
    // not a refusal or "unimplemented". The remedy names the package to add.
    const cwd = mkdtempSync(path.join(tmpdir(), "ksor-serve-"));
    // Clear NODE_PATH: the test runner (pnpm/vitest) sets it to the workspace
    // node_modules, which WOULD resolve the workspace kernel from any cwd — a
    // test-env artifact. A real adopter's empty project has no such NODE_PATH.
    const env = { ...process.env };
    delete env["NODE_PATH"];
    try {
      const result = spawnSync(process.execPath, [distCli, "serve"], {
        cwd,
        encoding: "utf8",
        env,
      });
      expect(result.status, result.stderr).toBe(3);
      expect(result.stderr.split("\n")[0]).toBe("error: serve-not-installed");
      expect(result.stderr).toContain("pnpm add @panaversity/ksor-content-gateway");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("answers --version with the version and exit 0", () => {
    const result = runCli(["--version"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });
});
