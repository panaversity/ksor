/**
 * `guard-invariants` enforces mechanical repository rules. This test covers
 * rule 2's symlink comparison specifically: `isSymlinkTo` must accept a
 * symlink target regardless of which path-separator style it was recorded
 * with. Windows' `readlinkSync` returns backslash-separated targets even for
 * a correctly-created symlink, which a naive string-equality check against a
 * forward-slash literal always fails — the symlink is real, but the rule
 * reports it as missing.
 *
 * The fixture uses `symlinkSync` with an explicit backslash-style target
 * string. POSIX symlinks store the target as an opaque string with no
 * separator interpretation, so this reproduces the Windows-observed value on
 * any host OS, making the regression checkable in CI (Linux) too.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const script = path.join(scriptsDir, "guard-invariants.mjs");

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * A minimal repository skeleton with just enough for guard's rules 1, 2, 5
 * and 6 to run without throwing: a CLAUDE.md symlink, one .agents/.claude
 * skill pair, and an empty packages/ksor package.json.
 */
function harness(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ksor-guard-"));
  roots.push(root);

  mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
  copyFileSync(script, path.join(root, "scripts", "guard-invariants.mjs"));
  // Every module the guard imports, or it dies on resolution before a single
  // rule runs — which is how this harness noticed rule 12's new import.
  for (const lib of ["frontmatter.mjs", "db-scratch.ts"]) {
    copyFileSync(path.join(scriptsDir, "lib", lib), path.join(root, "scripts", "lib", lib));
  }

  writeFileSync(path.join(root, "AGENTS.md"), "# Agents\n");
  symlinkSync("AGENTS.md", path.join(root, "CLAUDE.md"));

  mkdirSync(path.join(root, ".agents", "skills", "sample-skill"), { recursive: true });
  writeFileSync(
    path.join(root, ".agents", "skills", "sample-skill", "SKILL.md"),
    "---\nname: sample-skill\ndescription: fixture\n---\n\nbody\n",
  );
  mkdirSync(path.join(root, ".claude", "skills"), { recursive: true });
  // The Windows-shaped target: backslashes, stored verbatim by POSIX symlink().
  symlinkSync(
    "..\\..\\.agents\\skills\\sample-skill",
    path.join(root, ".claude", "skills", "sample-skill"),
  );

  mkdirSync(path.join(root, "packages", "ksor"), { recursive: true });
  writeFileSync(
    path.join(root, "packages", "ksor", "package.json"),
    JSON.stringify({ name: "@panaversity/ksor", dependencies: {} }),
  );

  return path.join(root, "scripts", "guard-invariants.mjs");
}

function runGuard(at: string) {
  return spawnSync(process.execPath, [at], { encoding: "utf8" });
}

/** A db-tier suite in the harness that names its scratch database with `expression`. */
function dbSuiteNaming(at: string, expression: string): void {
  const dir = path.join(path.dirname(at), "..", "packages", "content", "src");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "sample.db.test.ts"),
    `import { randomBytes } from "node:crypto";\nconst dbName = ${expression};\n`,
  );
}

describe("guard-invariants — rule 12 evaluates the suite's own literal", () => {
  const STAMP = "${Date.now().toString(36)}";

  it("accepts the shape the tier uses, in both forms", () => {
    const at = harness();
    dbSuiteNaming(
      at,
      "`ksor_sample_" +
        STAMP +
        '_${randomBytes(3).toString("hex")}`;\n' +
        'const other = ["ksor", "sample", Date.now().toString(36), randomBytes(3).toString("hex")].join("_")',
    );
    const result = runGuard(at);
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("refuses randomBytes(2): both halves are present and the reaper would still never drop it", () => {
    // The mutation the text check could not see: `randomBytes(` is there, the
    // stamp is there, and the name mints four hex characters where the grammar
    // wants six. Before the guard evaluated the suite's own expression this
    // passed, and the round trip it ran instead was on a literal it invented.
    const at = harness();
    dbSuiteNaming(at, "`ksor_sample_" + STAMP + '_${randomBytes(2).toString("hex")}`');
    const result = runGuard(at);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("rule 12");
    expect(result.stderr).toContain("packages/content/src/sample.db.test.ts");
    // The refusal shows the NAME it evaluated to, so the reader sees what the
    // reaper would have been handed rather than being told to guess.
    expect(result.stderr).toMatch(/evaluates to ksor_sample_[0-9a-z]+_0123\b/);
  });

  it("refuses a join builder that carries the stamp but not the random field", () => {
    const at = harness();
    dbSuiteNaming(at, '["ksor", "sample", Date.now().toString(36)].join("_")');
    const result = runGuard(at);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("the random suffix");
  });
});

describe("guard-invariants — rule 2 symlink comparison", () => {
  it("accepts a symlink whose stored target uses backslashes", () => {
    const at = harness();
    const result = runGuard(at);
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
