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
  copyFileSync(
    path.join(scriptsDir, "lib", "frontmatter.mjs"),
    path.join(root, "scripts", "lib", "frontmatter.mjs"),
  );

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

describe("guard-invariants — rule 2 symlink comparison", () => {
  it("accepts a symlink whose stored target uses backslashes", () => {
    const at = harness();
    const result = runGuard(at);
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
