#!/usr/bin/env node
/**
 * Point `docs/status.md` at the version the Version PR is about to publish.
 *
 * Authority rule 3 makes that file "the only authority on what is actually
 * built", and it went ELEVEN releases stale before anyone noticed. A
 * docs-truth assertion now holds it equal to `packages/ksor/package.json` —
 * and that assertion, on its own, would block every release: `changeset
 * version` bumps the manifest and touches no document, so the release gate saw
 * a mismatch it had no way to close (found live, on the release it blocked).
 *
 * The fix is not to weaken the assertion. A document that has to be updated by
 * remembering is a document that goes stale; this runs INSIDE `changeset
 * version`, so the bump and the sentence move in one commit, in the Version PR
 * a human still reviews.
 *
 * Rewrites exactly the published-package sentence and nothing else, and only
 * for a RELEASE: a snapshot or prerelease version is refused by name, because
 * the sentence names what a plain `npm install` resolves and a snapshot never
 * is that (`scripts/lib/status-version.ts`).
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { syncStatusVersion } from "./lib/status-version.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(
  readFileSync(path.join(repoRoot, "packages/ksor/package.json"), "utf8"),
).version;

const statusPath = path.join(repoRoot, "docs/status.md");
const result = syncStatusVersion(readFileSync(statusPath, "utf8"), version);

if (result.kind === "refused") {
  // The slug is the first stderr line (product principle 4), so a release
  // log can be grepped for it; the why and the fix follow.
  console.error(result.message);
  process.exit(1);
} else if (result.kind === "unchanged") {
  console.log(`sync-status-version: docs/status.md already names ${result.version}`);
} else {
  writeFileSync(statusPath, result.text);
  console.log(`sync-status-version: docs/status.md ${result.from} -> ${result.to}`);
}
