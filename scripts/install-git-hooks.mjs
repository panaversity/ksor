#!/usr/bin/env node
// Installs the pre-commit hook (runs via `pnpm prepare`). The hook CHECKS the
// formatting of the STAGED FILES' paths only — never repo-wide, so an
// unformatted unrelated file cannot block a clean commit, and check-mode only,
// so partial staging is never destroyed. Known limit, accepted: it reads the
// worktree copy of each staged path, so the rare staged-dirty/worktree-clean
// split slips through locally — CI's fmt:ci catches it.
// Skipped in CI and in non-git checkouts (e.g. published tarballs).

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.env.CI || !existsSync(path.join(repoRoot, ".git"))) {
  process.exit(0);
}

// `git rev-parse --git-path hooks` resolves correctly in linked worktrees,
// where .git is a file and .git/hooks does not exist as a path.
let hooksDir;
try {
  hooksDir = path.resolve(
    repoRoot,
    execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim(),
  );
} catch {
  process.exit(0);
}

const hook = `#!/bin/sh
# Installed by scripts/install-git-hooks.mjs (pnpm prepare). Checks formatting
# of the staged source files (worktree copies, by path — NUL-separated so
# filenames with spaces survive; check-only so partial staging is never
# destroyed). CI runs the same formatter repo-wide.
# Fast exit when no source files are staged (BSD xargs would also skip on
# empty input, but GNU xargs would not — this check keeps the hook portable).
git diff --cached --name-only --diff-filter=ACMR \\
  | grep -qE '\\.(ts|mts|js|mjs)$' || exit 0
if git diff --cached --name-only --diff-filter=ACMR -z \\
  | grep -zE '\\.(ts|mts|js|mjs)$' \\
  | xargs -0 pnpm exec oxfmt --check -- > /dev/null 2>&1; then
  exit 0
fi
echo "pre-commit: staged files fail the format check — run: pnpm fmt, restage, retry" >&2
exit 1
`;

mkdirSync(hooksDir, { recursive: true });
const hookPath = path.join(hooksDir, "pre-commit");
writeFileSync(hookPath, hook);
chmodSync(hookPath, 0o755);
