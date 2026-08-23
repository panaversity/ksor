/**
 * A question's identity: a hash of the text the reader actually sees.
 *
 * The stem AND the options, because reordering options changes which one is
 * correct — a reader's saved answer to the old ordering would be recorded
 * against the new one and silently become right or wrong. `explanation` and
 * `source` are NOT hashed: they teach ABOUT the question rather than being it,
 * so improving an explanation must not discard what the reader answered.
 *
 * Split from `quiz.ts` for the same reason as `quiz-round.ts` — that file
 * carries zod and so cannot enter the unit tier.
 */
import { textHash } from "./text-hash.js";

export function questionHash(question: {
  readonly question: string;
  readonly options: readonly string[];
}): string {
  return textHash([question.question, ...question.options]);
}
