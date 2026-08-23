/**
 * How many questions one round of a quiz asks, and which ones.
 *
 * Split from `quiz.ts` because that file carries zod, and a zod-carrying module
 * cannot be pulled into this repo's unit tier — `isolatedDeclarations` cannot
 * infer a schema's type and the annotations it would need are unwritable by
 * hand. The same split already happened once, when `progressPercent` moved out
 * of `deck.ts` into `srs.ts`. Rounds are pure arithmetic and belong on this
 * side of that line anyway.
 *
 * A LEAF: no imports.
 */

/**
 * Default round size.
 *
 * The predecessor shows 15-20 from a bank of 50 — about a third, so three
 * retakes are mostly new questions. Ten keeps that ratio at a size a record's
 * document can actually reach without inventing questions to pad it.
 */
export const DEFAULT_QUESTIONS_PER_ROUND = 10;

/**
 * The questions one round asks.
 *
 * A bank at or below the round size is returned WHOLE and in authored order:
 * there is no second round to make different, so shuffling would only cost the
 * author their deliberate ordering. A larger bank is sampled, which is what
 * makes another round worth taking.
 *
 * `pick` is a parameter rather than a call to `Math.random()` inside, so the
 * sampling is assertable and the module stays pure — the same reason `schedule`
 * takes `now`.
 */
export function roundOf<T>(
  bank: readonly T[],
  size: number,
  pick: () => number = Math.random,
): readonly T[] {
  if (bank.length <= size) return bank;
  const pool = [...bank];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(pick() * (i + 1));
    const a = pool[i];
    const b = pool[j];
    if (a !== undefined && b !== undefined) {
      pool[i] = b;
      pool[j] = a;
    }
  }
  return pool.slice(0, size);
}

/** True when the bank is bigger than one round, so another round differs. */
export function hasMoreRounds(bankSize: number, roundSize: number): boolean {
  return bankSize > roundSize;
}
