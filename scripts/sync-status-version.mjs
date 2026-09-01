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
 * Rewrites exactly the published-package sentence and nothing else.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(
  readFileSync(path.join(repoRoot, "packages/ksor/package.json"), "utf8"),
).version;

const statusPath = path.join(repoRoot, "docs/status.md");
const before = readFileSync(statusPath, "utf8");
const SENTENCE = /(`@panaversity\/ksor`\s+\*\*)([0-9]+\.[0-9]+\.[0-9]+)(\*\*\s+on npm)/;

const found = SENTENCE.exec(before);
if (found === null) {
  // Loud, never silent: the assertion this feeds reads the same sentence, so a
  // rename here would leave the release blocked with no explanation.
  console.error(
    "sync-status-version: docs/status.md has no `@panaversity/ksor` **x.y.z** on npm sentence.\n" +
      "  why: docs/status.md is the authority on what is built, and the release gate reads that\n" +
      "       exact sentence to check it against packages/ksor/package.json\n" +
      "  fix: restore the sentence, or update this script and the assertion together",
  );
  process.exit(1);
}

if (found[2] === version) {
  console.log(`sync-status-version: docs/status.md already names ${version}`);
} else {
  writeFileSync(statusPath, before.replace(SENTENCE, `$1${version}$3`));
  console.log(`sync-status-version: docs/status.md ${found[2]} -> ${version}`);
}
