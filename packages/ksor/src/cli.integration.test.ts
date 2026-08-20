import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Integration tests exercise the BUILT artifact — the same file the published
// bin points at — not the TypeScript source. Run `pnpm build` first.
//
// Spawning the bundled binary costs ~0.35s each time (much more on Windows),
// and these tests spawn it repeatedly — the tier's testTimeout in
// vitest.integration.config.ts is raised for exactly that reason.
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
      expect(result.stdout).toContain("ingest");
    }
  });

  it("serve runs the bundled gateway in-process; a missing instance.md is exit 3", () => {
    // The kernel is bundled into the CLI, so serve runs the gateway in-process
    // (no spawn, no install). With no instance.md in cwd the gateway's own
    // compose fails closed — an environment error (3), not a crash.
    const cwd = mkdtempSync(path.join(tmpdir(), "ksor-serve-"));
    try {
      const result = spawnSync(process.execPath, [distCli, "serve"], { cwd, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(3);
      expect(result.stderr).toContain("instance.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("answers --version with the version and exit 0", () => {
    const result = runCli(["--version"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  // The corpus verbs are DELEGATED to the bundled content CLI (cli.ts dispatch).
  // Without these, dropping a verb from that dispatch silently demotes it to
  // "designed but not implemented" (exit 2) and the scaffold's `pnpm ingest` /
  // `pnpm schema` break with no red test (review finding, 2026-08-20).
  it("routes every corpus verb to the bundled kernel — never exit 2", () => {
    for (const verb of ["ingest", "schema", "grant", "calibrate", "gc"]) {
      const result = runCli([verb]);
      expect(result.status, `ksor ${verb} exit (stdout: ${result.stdout})`).not.toBe(2);
      expect(
        `${result.stdout}${result.stderr}`,
        `ksor ${verb} must not report itself unimplemented`,
      ).not.toContain("designed but not implemented");
    }
  });

  it("names the missing flag when a corpus verb is under-specified (exit 1)", () => {
    // The exact flags the scaffold's package.json scripts pass — a rename in
    // the content CLI's parser must fail HERE, not in an adopter's project.
    const ingest = runCli(["ingest", "--instance", "instance.md"]);
    expect(ingest.status, ingest.stdout).toBe(1);
    expect(`${ingest.stdout}${ingest.stderr}`).toContain("--knowledge");

    for (const verb of ["calibrate", "gc", "grant"]) {
      const result = runCli([verb]);
      expect(result.status, `${verb}: ${result.stdout}`).toBe(1);
      expect(`${result.stdout}${result.stderr}`, `${verb} names --instance`).toContain(
        "--instance",
      );
    }
  });

  it("renders the DDL from the bundled schema.sql — proving it resolves at runtime", () => {
    // `schema/schema.sql` is build-copied beside dist/ and resolved via
    // import.meta.url; it is gitignored, so only the build + `files` manifest
    // put it there. Rendering real DDL is the proof it is reachable from the
    // shipped layout (review finding, 2026-08-20: previously manual-only).
    const result = runCli(["schema", "--dim", "8"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout, "rendered DDL").toContain("CREATE TABLE");
    expect(result.stdout, "the dimension reaches the rendered vector column").toContain(
      "VECTOR(8)",
    );
  });
});
