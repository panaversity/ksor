/**
 * The shared text hash, and the promise that extracting it moved nothing.
 *
 * `cardHash` used to carry its own copy of this loop inside `deck.ts`. The
 * copy was removed so the deck and the quiz share one implementation — and a
 * hash that CHANGES silently discards every reader's saved review progress,
 * because the stored state is keyed by it. So the expected values below were
 * computed from the previous implementation before the extraction, and are
 * pinned here rather than recomputed from the current one, which would only
 * ever prove that the code agrees with itself.
 */
import { describe, expect, it } from "vitest";

import { questionHash, textHash } from "../templates/scaffold/system/site/lib/identity.js";

/** [front, back] → what the pre-extraction `cardHash` returned. */
const PRE_EXTRACTION = [
  { parts: ["What is the return window?", "Thirty days."], hash: "1da6a894" },
  { parts: ["a", "bc"], hash: "609747a3" },
  { parts: ["ab", "c"], hash: "ef850b27" },
  { parts: ["", ""], hash: "050c5d1f" },
  { parts: ["front only", ""], hash: "bf2fa40e" },
] as const;

describe("the extraction did not move a single hash", () => {
  for (const row of PRE_EXTRACTION) {
    it(`${JSON.stringify(row.parts)} still hashes to ${row.hash}`, () => {
      expect(textHash(row.parts)).toBe(row.hash);
    });
  }
});

describe("the separator is load-bearing", () => {
  it("distinguishes a split that a bare concatenation would collide", () => {
    // Without a separator both are "abc" and a reader's progress on one card
    // would be read as progress on the other.
    expect(textHash(["a", "bc"])).not.toBe(textHash(["ab", "c"]));
  });

  it("is a character authored text cannot contain, so it cannot be forged", () => {
    expect(textHash(["a b"])).not.toBe(textHash(["a", "b"]));
  });
});

describe("a question's identity covers what changes its answer", () => {
  const base = { question: "Who approves this?", options: ["A second approver", "The requester"] };

  it("is stable for the same text", () => {
    expect(questionHash(base)).toBe(questionHash({ ...base }));
  });

  it("changes when the stem changes", () => {
    expect(questionHash({ ...base, question: "Who approves that?" })).not.toBe(questionHash(base));
  });

  it("changes when the OPTIONS are reordered — the answer index now means something else", () => {
    expect(questionHash({ ...base, options: [...base.options].reverse() })).not.toBe(
      questionHash(base),
    );
  });

  it("does not change when an explanation is improved", () => {
    // Not hashed at all, so this is a property of the signature: only the two
    // fields are read. Asserted so a future field added to the hash is noticed.
    const withExtras = { ...base, explanation: "a much better explanation", answer: 0 };
    expect(questionHash(withExtras)).toBe(questionHash(base));
  });
});
