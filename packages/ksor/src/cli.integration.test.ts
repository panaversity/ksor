import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  it("serve takes `--instance <dir>`, the same as every other verb", () => {
    // `--instance` accepts a directory everywhere else — `build` documented it
    // and `schema`/`grant`/`ingest` were fixed to match. `serve` resolved its
    // own path and answered `EISDIR: illegal operation on a directory, read`:
    // a raw errno naming no rule, no reason and no fix, on the one flag a
    // person is most likely to type as `.` (found on a live walk, 2026-08-25).
    // It must reach the SAME refusal the other verbs reach — about the record,
    // not about the filesystem.
    const cwd = mkdtempSync(path.join(tmpdir(), "ksor-serve-dir-"));
    try {
      writeFileSync(
        path.join(cwd, "instance.md"),
        "---\nformat: 2\nname: dirflag\ntitle: Dir flag\ndescription: One sentence.\n---\n\nScope.\n",
      );
      const result = spawnSync(process.execPath, [distCli, "serve", "--instance", "."], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, KSOR_AUTH: "disabled-local" },
      });
      expect(result.stderr, "a raw errno reached the operator").not.toContain("EISDIR");
      // The record has no `database:`, which is what it should now be told.
      expect(result.stderr).toContain("database");
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
    // WHOLE files, not a slice between two landmarks: this used to bracket
    // `const namedActor` and `if (values.export`, both of which have since been
    // removed, so `indexOf` returned -1 twice and the assertion ran against an
    // empty string — a test that could no longer fail. Its pattern could not
    // fail either: `USERNAME?` is `USERNAM` plus an optional `E`, so the very
    // variable decision 21 names first, `$USER`, was the one it did not match
    // (both found 2026-08-25).
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "content");
    for (const rel of ["src/commands.ts", "src/takedown-verb.ts"]) {
      expect(
        readFileSync(path.join(dir, rel), "utf8"),
        `${rel}: an actor guessed from the shell attributes nothing`,
      ).not.toMatch(/process\.env\[["'](?:USER|USERNAME|LOGNAME)["']\]/);
    }
  });
});

/**
 * `ksor takedown`'s ARGUMENTS, through the built binary — both defects here
 * were found by typing the verb the way its own `--help` documents it, and
 * neither was reachable from the pure planner alone (2026-08-25 walk).
 *
 * A level-0 record, so the whole act is the ledger entry and no database is
 * involved: the argument paths are what is under test, not the row.
 */
describe("ksor takedown — the arguments an adopter actually types", () => {
  /** A record at `<tmp>/rec`, so the PARENT is ours to assert nothing leaked into. */
  function record(): { readonly parent: string; readonly root: string } {
    const parent = mkdtempSync(path.join(tmpdir(), "ksor-takedown-args-"));
    const root = path.join(parent, "rec");
    mkdirSync(path.join(root, ".ksor"), { recursive: true });
    mkdirSync(path.join(root, "knowledge", "policies"), { recursive: true });
    writeFileSync(
      path.join(root, "instance.md"),
      '---\nformat: 2\nname: args-test\ntitle: Args Test\ndescription: "A record that exists to be typed at."\n---\n\nA record that exists to be typed at.\n',
      "utf8",
    );
    writeFileSync(
      path.join(root, ".ksor", "governance.yaml"),
      'version: "0.1"\napproval_authorities:\n  - actors: [human:ciso]\ntakedown_authorities:\n  actors: [human:ciso]\n',
      "utf8",
    );
    writeFileSync(path.join(root, "knowledge", "policies", "x.md"), "# X\n", "utf8");
    return { parent, root };
  }

  const deny = (root: string, ...rest: readonly string[]) =>
    runCli(["takedown", "--instance", root, "--actor", "human:ciso", "--reason", "legal", ...rest]);

  /**
   * `--instance .` is what `build --help` documents for the same flag name and
   * what every other verb accepts. takedown took the argument verbatim and read
   * the record root as `dirname(resolve("."))` — the record's PARENT — so it
   * reported `ksor-policy-missing` about a record whose `.ksor/governance.yaml`
   * was right there, and its printed fix would have had the adopter overwrite
   * their real `approval_authorities` and `takedown_authorities`. A false
   * report whose remedy destroys governance.
   */
  it("accepts a DIRECTORY for --instance, like every other verb", () => {
    const { parent, root } = record();
    try {
      const r = deny(root, "knowledge/policies/x");
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stderr, "the policy is right there").not.toContain("ksor-policy-missing");
      expect(
        existsSync(path.join(root, ".ksor", "takedowns.yaml")),
        "the entry lands in the record's own .ksor/, not a directory above it",
      ).toBe(true);
      expect(readFileSync(path.join(root, ".ksor", "takedowns.yaml"), "utf8")).toContain(
        "knowledge/policies/x",
      );
      expect(existsSync(path.join(parent, ".ksor")), "nothing was written above the record").toBe(
        false,
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  /**
   * The same root cause reached `--list` by a different route: `parseInstance`
   * on the DIRECTORY throws EISDIR rather than `NoDatabaseDeclared`, so the
   * level-0 branch — answer from the committed ledger — was never taken, and a
   * record with no database was told to stand up Postgres.
   */
  it("--list on a level-0 record answers from the ledger, given a directory", () => {
    const { parent, root } = record();
    try {
      const r = runCli(["takedown", "--instance", root, "--list"]);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stderr, "a level-0 record is not missing an environment").not.toContain("dsn_env");
      expect(r.stdout).toContain("nothing is denied in this corpus");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  /**
   * The record root. It used to reach `join(root, null)` and exit **3** with a
   * raw `TypeError: The "path" argument must be of type string` — the
   * ENVIRONMENT code, for an argument the operator typed — and the anchored
   * spelling was worse: exit 0, with an entry written that the next
   * `ksor build` refuses for as long as the append-only ledger exists.
   */
  it.each([
    ["subtree", "knowledge/"],
    ["subtree", "knowledge/#section"],
    ["node", "knowledge/"],
  ])("refuses the record root at %s scope (`%s`) — nothing written", (scope, id) => {
    const { parent, root } = record();
    try {
      const r = scope === "subtree" ? deny(root, "--scope", "subtree", id) : deny(root, id);
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stderr.split("\n")[0], "slug-first on stderr").toMatch(
        /^ksor-takedown-record-root:/,
      );
      expect(r.stderr, "the remedy is the form that works").toContain(
        "--scope subtree knowledge/<section>",
      );
      expect(
        existsSync(path.join(root, ".ksor", "takedowns.yaml")),
        "a refused act writes no entry — the ledger is append-only",
      ).toBe(false);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  /**
   * The shell's trailing slash, recorded verbatim. This is the quietest of the
   * four: `knowledge/policies/x/` matched no concept, so both surfaces denied
   * nothing — and `expected: removed` AGREED with "no such concept", so the
   * checker stayed green and no surface ever said the hold was fake. The verb
   * said `denied`, and that was the only thing anyone would ever see.
   */
  it("records the id the record uses, not the one the shell completed", () => {
    const { parent, root } = record();
    try {
      const r = deny(root, "knowledge/policies/x/");
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const ledger = readFileSync(path.join(root, ".ksor", "takedowns.yaml"), "utf8");
      expect(ledger, "the trailing slash is not part of the id").toContain(
        'stable_id: "knowledge/policies/x"',
      );
      expect(
        ledger,
        "and `expected` therefore reports what is actually there — the document IS present",
      ).toContain("expected: present");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("still denies a top-level section — the refusal is the root, not the depth", () => {
    const { parent, root } = record();
    try {
      const r = deny(root, "--scope", "subtree", "knowledge/policies");
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(readFileSync(path.join(root, ".ksor", "takedowns.yaml"), "utf8")).toContain(
        "knowledge/policies#section",
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
