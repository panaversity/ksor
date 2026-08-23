/**
 * Round selection.
 *
 * The SCHEMA's own behaviour — the answer-range check and the audit it runs at
 * parse time — is asserted where it actually matters, as a build refusal in
 * `quiz-build.integration.test.ts`. It cannot be asserted here: `quiz.ts`
 * carries zod, and pulling a zod-carrying module into this tier trips
 * `isolatedDeclarations`, which is the same wall `progressPercent` hit when it
 * lived in `deck.ts`. Proving it on the shipped build is the better test in any
 * case — it is what an author actually meets.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_QUESTIONS_PER_ROUND,
  hasMoreRounds,
  roundOf,
} from "../templates/scaffold/system/site/lib/quiz-round.js";

describe("rounds adapt to the bank rather than demanding fifty questions", () => {
  it("a bank at or below the round size is returned WHOLE, in authored order", () => {
    const items = [1, 2, 3, 4, 5];
    // A pick that would reverse the array if it were consulted at all.
    expect(roundOf(items, 10, () => 0)).toEqual(items);
    expect(roundOf(items, 5, () => 0)).toEqual(items);
  });

  it("a larger bank is sampled down to the round size", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const round = roundOf(items, 10, () => 0.5);
    expect(round).toHaveLength(10);
    expect(new Set(round).size, "no question twice in one round").toBe(10);
    for (const q of round) expect(items).toContain(q);
  });

  it("every question in a round comes from the bank, over many draws", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    let seed = 1;
    const pick = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let draw = 0; draw < 50; draw++) {
      const round = roundOf(items, 10, pick);
      expect(new Set(round).size).toBe(10);
    }
  });

  it("only a bank larger than one round offers another", () => {
    expect(hasMoreRounds(5, 10)).toBe(false);
    expect(hasMoreRounds(10, 10)).toBe(false);
    expect(hasMoreRounds(11, 10)).toBe(true);
  });

  it("the default round is ten", () => {
    expect(DEFAULT_QUESTIONS_PER_ROUND).toBe(10);
  });
});
