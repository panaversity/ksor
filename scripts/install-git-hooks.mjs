#!/usr/bin/env node
// Installs the pre-commit hook (runs via `pnpm prepare`). The hook CHECKS the
// formatting of staged source files — check-mode only, because rewriting and
// re-staging files would silently commit unstaged hunks and destroy partial
// staging. Skipped in CI and in non-git checkouts (e.g. published tarballs).

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
# of staged source files — the same check CI's lint job runs (pnpm fmt:ci).
# NUL-separated so filenames with spaces survive; check-only so partial
# staging is never destroyed.
git diff --cached --name-only --diff-filter=ACMR -z \\
  | tr '\\0' '\\n' \\
  | grep -E '\\.(ts|mts|js|mjs)$' > /dev/null || exit 0
if ! pnpm fmt:ci > /dev/null 2>&1; then
  echo "pre-commit: formatting check failed — run: pnpm fmt, then re-stage" >&2
  exit 1
fi
`;

mkdirSync(hooksDir, { recursive: true });
const hookPath = path.join(hooksDir, "pre-commit");
writeFileSync(hookPath, hook);
chmodSync(hookPath, 0o755);
