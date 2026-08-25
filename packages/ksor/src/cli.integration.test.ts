import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  it("a bare invocation shows the usage and exits 0 — being asked what you are is not an error", () => {
    // It used to answer "the name is reserved; this is not a release" from a
    // shipped package with nine working verbs, at the moment a human or an
    // agent is deciding whether to use it (review 2026-08-20).
    const result = runCli([]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).not.toContain("the name is reserved");
    expect(result.stdout, "the vocabulary is what a discovering caller needs").toContain(
      "ksor <verb>",
    );
    expect(result.stdout).toContain("takedown");
    expect(result.stdout).toContain("github.com/panaversity/ksor");
  });

  it("a verb's --help reaches THAT verb, not the generic usage", () => {
    const result = runCli(["ingest", "--help"]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    // `--knowledge` is gone: the record root beside instance.md supplies it
    // (record spec §1), so the verb's own flags are what is left.
    expect(result.stdout, "the verb's own flags").toContain("--instance");
    expect(result.stdout, "the verb's own flags").toContain("--flip");
    expect(result.stdout, "the record root supplies it now").not.toContain("--knowledge");
    // …and passing it refuses rather than being quietly tolerated: a flag that
    // works while absent from `--help` is a trap. `ksor migrate` strips it from
    // the scripts the pre-profile scaffold shipped.
    const retired = runCli(["ingest", "--instance", "instance.md", "--knowledge", "knowledge"]);
    expect(retired.status, `${retired.stdout}${retired.stderr}`).toBe(1);
  });

  it("a mistyped flag is REFUSED (exit 1), not reported as a broken environment", () => {
    const result = runCli(["ingest", "--knowledg", "x"]);
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toContain("error: bad-args");
    expect(result.stderr, "the remedy, not just the fault").toContain("--help");
  });

  it("names the verb it refuses to fake", () => {
    const result = runCli(["dev"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("ksor dev: designed but not implemented");
  });

  it("refuses an unknown verb with exit 1 and a stable error slug", () => {
    const result = runCli(["frobnicate"]);
    expect(result.status).toBe(1);
    expect(result.stderr.split("\n")[0]).toBe("error: unknown-verb");
    expect(result.stderr).toContain("init, dev, build, migrate, serve");
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
    const ingest = runCli(["ingest"]);
    expect(ingest.status, ingest.stdout).toBe(1);
    expect(`${ingest.stdout}${ingest.stderr}`).toContain("--instance");

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

/**
 * `ksor takedown --export` is the ONE takedown mode that runs inside
 * `pnpm build`, so its failure modes decide whether a withdrawn document gets
 * published. The scaffold used to wrap it in `|| true`, which turned a real
 * database outage into a silent empty manifest; removing that wrapper then
 * broke `pnpm build` on a level-0 record, because "declares no database" is a
 * legitimate state that refuses during PARSING. Both were found live (rounds 3
 * and 4 of the #43 review), so all four shapes are pinned here.
 */
describe("a governance act must NAME who performed it", () => {
  // `--actor` used to fall back to $USER / $USERNAME / "operator", so a ledger
  // row in CI read `runner` and in a container `root` — a self-asserted string
  // wearing a schema, which looks like a person and attributes nothing. The
  // column is NOT NULL with the comment "NO default: unset errors loudly", and
  // the fallback is exactly what stopped it erroring (review, 2026-08-21).
  const instanceIn = (dir: string): string => {
    const file = path.join(dir, "instance.md");
    writeFileSync(
      file,
      "---\nformat: 1\nname: actor-test\ndatabase:\n  dsn_env: KSOR_ACTOR_TEST_DSN\n---\n\n# Record\n",
      "utf8",
    );
    return file;
  };

  it("refuses a denial with no --actor, before touching the database", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ksor-actor-"));
    try {
      const result = spawnSync(
        process.execPath,
        [distCli, "takedown", "--instance", instanceIn(dir), "knowledge/x", "--reason", "legal"],
        // No DSN at all: the refusal must come from the MISSING ACTOR, which
        // proves it is checked before anything is opened.
        { encoding: "utf8", env: { ...process.env, KSOR_ACTOR_TEST_DSN: "" } },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("must name who performed it");
      expect(result.stderr, "the remedy names the flag").toContain("--actor");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a revocation the same way", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ksor-actor-"));
    try {
      const result = spawnSync(
        process.execPath,
        [distCli, "takedown", "--instance", instanceIn(dir), "--revoke", "knowledge/x"],
        { encoding: "utf8", env: { ...process.env, KSOR_ACTOR_TEST_DSN: "" } },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("must name who performed it");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never infers one from the environment", () => {
    const src = readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "content",
        "src",
        "commands.ts",
      ),
      "utf8",
    );
    const block = src.slice(src.indexOf("const namedActor"), src.indexOf("if (values.export"));
    expect(block, "an actor guessed from the shell attributes nothing").not.toMatch(
      /process\.env\["USERNAME?"\]/,
    );
  });
});
