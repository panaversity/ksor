import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The text of a release note, wherever it currently lives.
 *
 * A changeset is a TRANSIENT file. `changeset version` folds every pending one
 * into `packages/ksor/CHANGELOG.md` and DELETES it, so a test that reads
 * `.changeset/<slug>.md` directly passes on every feature PR and then throws
 * ENOENT in the release job — the one run where nothing is allowed to be red,
 * and the one run whose failure costs a red release rather than a red PR.
 *
 * That is not hypothetical: it happened on the 0.0.41 Version PR (2026-08-26),
 * where four assertions across two suites died on a file the release had just
 * consumed by design. The assertions were RIGHT — this prose is what an
 * upgrading adopter reads first, and it must say what it says. Only the place
 * they looked was wrong.
 *
 * So: the pending changeset if it is still pending, and otherwise the NEWEST
 * section of the changelog it was folded into. Scoped to the newest section
 * deliberately — the whole changelog carries every release ever made, and a
 * rule this project adopted at 0.0.41 must not be asserted against prose
 * written at 0.0.7.
 */
export function releaseNote(repoRoot: string, changesetRel: string): string {
  const pending = path.join(repoRoot, changesetRel);
  if (existsSync(pending)) return readFileSync(pending, "utf8");

  const changelog = path.join(repoRoot, "packages", "ksor", "CHANGELOG.md");
  const text = readFileSync(changelog, "utf8");
  // `## <version>` delimits a release; the first is the one just cut.
  const from = text.indexOf("\n## ");
  if (from === -1) {
    throw new Error(
      `${changesetRel} is consumed and ${changelog} declares no release section — ` +
        `the note cannot be checked in either place`,
    );
  }
  const next = text.indexOf("\n## ", from + 1);
  return next === -1 ? text.slice(from) : text.slice(from, next);
}
