import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Where a release note lives, and whether it is still under review. */
export interface ReleaseNote {
  readonly text: string;
  /**
   * True while the changeset file still exists — i.e. this note is going out
   * in the NEXT release and is the thing a reviewer can still change.
   */
  readonly pending: boolean;
}

/**
 * The text of a release note, wherever it currently lives.
 *
 * A changeset is TRANSIENT: `changeset version` folds every pending one into
 * `packages/ksor/CHANGELOG.md` and deletes it. A test that reads
 * `.changeset/<slug>.md` directly is therefore green on every feature PR and
 * throws ENOENT in the release job — which is what happened on the 0.0.41
 * Version PR.
 *
 * The first fix for that returned the NEWEST changelog section, and it was
 * wrong in a way that mattered more than the bug it replaced. A note consumed
 * in 0.0.41 lives in the 0.0.41 section FOREVER; by 0.0.42 the newest section
 * is a different release, so presence assertions failed, and — worse — a
 * fenced-block scan went VACUOUS, passing because the section it was handed
 * contained no code blocks at all. A test that cannot fail is the defect this
 * repo post-mortems most often, and that fix introduced one.
 *
 * So: the pending changeset while it is pending, and otherwise the WHOLE
 * changelog, which is where the note actually is. Callers that assert the
 * PRESENCE of prose can use the text as-is — finding it anywhere in the
 * changelog proves it shipped. Callers that scan STRUCTURE (fenced blocks,
 * "every block must…") must gate on `pending`, because that rule is about a
 * note still under review, and applying it to the whole published history
 * asserts today's rules against prose written before they existed.
 */
export function releaseNote(repoRoot: string, changesetRel: string): ReleaseNote {
  const pending = path.join(repoRoot, changesetRel);
  if (existsSync(pending)) return { text: readFileSync(pending, "utf8"), pending: true };

  const changelog = path.join(repoRoot, "packages", "ksor", "CHANGELOG.md");
  if (!existsSync(changelog)) {
    throw new Error(
      `${changesetRel} is consumed and ${changelog} does not exist — ` +
        `the note cannot be checked in either place`,
    );
  }
  return { text: readFileSync(changelog, "utf8"), pending: false };
}
