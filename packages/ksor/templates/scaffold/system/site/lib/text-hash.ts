/**
 * A stable identity for a piece of authored text.
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
 * A LEAF: no imports, and unit-tested as one.
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
