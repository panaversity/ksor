/**
 * The progress bar and its caption show the same fact, and once disagreed by a
 * whole card: the bar read `position` while the caption read `position + 1`, so
 * a reader on the last card saw "5 / 5" above a bar at 80% — and a full bar was
 * never on screen at all, because reaching the end swaps the bar for the
 * completion panel. Found live by the owner.
 */

import { describe, expect, it } from "vitest";

import { progressPercent } from "../templates/scaffold/system/site/lib/deck.js";

describe("deck progress", () => {
  it("reaches 100% on the last card, not one short of it", () => {
    expect(progressPercent(4, 5), "the last of five cards must fill the bar").toBe(100);
  });

  it("agrees with the caption on every card of a five-card deck", () => {
    // The caption renders `position + 1` of `total`; the bar must show that
    // same fraction, or the two are telling the reader different things.
    for (let position = 0; position < 5; position += 1) {
      const caption = position + 1;
      expect(progressPercent(position, 5), `card ${caption} of 5`).toBe((caption / 5) * 100);
    }
  });

  it("starts filled by one card, never empty — the reader is already on one", () => {
    expect(progressPercent(0, 5)).toBe(20);
    expect(progressPercent(0, 1)).toBe(100);
  });

  it("never exceeds 100%, whatever index it is handed", () => {
    expect(progressPercent(9, 5)).toBe(100);
    expect(progressPercent(100, 3)).toBe(100);
  });

  it("survives an empty or negative shape rather than dividing by zero", () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(-3, 5)).toBe(20);
  });
});
