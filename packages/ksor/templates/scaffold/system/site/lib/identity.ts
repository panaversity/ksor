/**
 * Identity for authored text: the hash, and what a question hashes.
 *
 * FNV-1a, 32-bit, hand-rolled — the site has no crypto import at build time and
 * this has to produce the same value in the browser, where the saved progress
 * it keys actually lives. A collision costs one card's or one question's saved
 * state, never correctness, so 32 bits is the right size of hammer.
 *
 * Extracted so the deck and the quiz share ONE implementation. Two hand-rolled
 * copies of a hash is the kind of duplication that stays identical right up
 * until someone fixes a separator in one of them.
 *
 * A LEAF, and it has to stay one. This repo can only unit-test a scaffold
 * module with no relative imports: `tsc` under node16 resolution demands a
 * `.js` specifier, and Next's bundler in the scaffold cannot resolve that back
 * to a `.ts` file — so a scaffold module that imports a sibling either fails
 * the typecheck or fails the site build. `questionHash` therefore lives here
 * beside the hash it calls rather than in a file of its own.
 */

/**
 * The separator between parts, written as an escape rather than embedded: a raw
 * NUL in the source makes git treat the file as binary.
 *
 * A separator is load-bearing. Without one, `["ab", "c"]` and `["a", "bc"]`
 * hash identically, and NUL is the one character authored text cannot contain.
 */
const SEPARATOR = "\u0000";

/** Hash these parts as one identity. */
export function textHash(parts: readonly string[]): string {
  const text = parts.join(SEPARATOR);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * A question's identity: a hash of the text the reader actually sees.
 *
 * The stem AND the options, deliberately including their ORDER — reordering
 * changes which index is correct, so a saved answer would otherwise be
 * re-scored against a different question and silently become right or wrong.
 * `explanation` and `source` are excluded: they teach ABOUT the question
 * rather than being it, so improving an explanation costs the reader nothing.
 */
export function questionHash(question: {
  readonly question: string;
  readonly options: readonly string[];
}): string {
  return textHash([question.question, ...question.options]);
}
