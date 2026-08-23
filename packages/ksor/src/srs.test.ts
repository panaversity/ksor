/**
 * The review scheduler, asserted as a table against a frozen clock.
 *
 * It lives in the scaffold's site (`system/site/lib/srs.ts`) because scheduling
 * is a site concern — the kernel neither schedules nor stores review state. It
 * is unit-tested from here, and it can be, because it is a LEAF: a pure
 * function of (schedule, rating, now) with no React, no storage, and no ambient
 * clock. A module that reached for `Date.now()` could not be tested this way,
 * which is the reason it does not.
 */

import { describe, expect, it } from "vitest";

import {
  EASE_LAPSE_PENALTY,
  EASE_MIN,
  EASE_START,
  GRADUATING_INTERVAL_DAYS,
  LEARNING_STEPS_MIN,
  MAX_INTERVAL_DAYS,
  RELEARNING_STEPS_MIN,
  SCHEDULER_POLICY,
  type CardSchedule,
  newCard,
  schedule,
} from "../templates/scaffold/system/site/lib/srs.js";

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = 1_700_000_000_000; // a frozen clock; the value is arbitrary and never read from the system

/** A card parked in a given state, so each transition is asserted in isolation. */
function at(overrides: Partial<CardSchedule>): CardSchedule {
  return { ...newCard("h", T0), ...overrides };
}

describe("the policy names itself honestly", () => {
  it("is ksor-sm2-v1 — not FSRS, and never says it is", () => {
    expect(SCHEDULER_POLICY).toBe("ksor-sm2-v1");
    expect(SCHEDULER_POLICY.toLowerCase()).not.toContain("fsrs");
  });
});

describe("a new card", () => {
  it("starts in state New, due immediately, at the starting ease", () => {
    const card = newCard("hash-1", T0);
    expect(card.state).toBe(0);
    expect(card.dueMs).toBe(T0);
    expect(card.ease).toBe(EASE_START);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.hash).toBe("hash-1");
  });
});

describe("New", () => {
  it("Again → Learning at the first step", () => {
    const next = schedule(at({ state: 0 }), "again", T0);
    expect(next.state).toBe(1);
    expect(next.step).toBe(0);
    expect(next.dueMs).toBe(T0 + LEARNING_STEPS_MIN[0]! * MIN);
    expect(next.reps).toBe(1);
  });

  it("Good → Learning at the second step", () => {
    const next = schedule(at({ state: 0 }), "good", T0);
    expect(next.state).toBe(1);
    expect(next.step).toBe(1);
    expect(next.dueMs).toBe(T0 + LEARNING_STEPS_MIN[1]! * MIN);
  });
});

describe("Learning", () => {
  it("Again → back to the first step, however far in", () => {
    const next = schedule(at({ state: 1, step: 1 }), "again", T0);
    expect(next.state).toBe(1);
    expect(next.step).toBe(0);
    expect(next.dueMs).toBe(T0 + LEARNING_STEPS_MIN[0]! * MIN);
  });

  it("Good mid-ladder → the next step", () => {
    const next = schedule(at({ state: 1, step: 0 }), "good", T0);
    expect(next.state).toBe(1);
    expect(next.step).toBe(1);
    expect(next.dueMs).toBe(T0 + LEARNING_STEPS_MIN[1]! * MIN);
  });

  it("Good at the last step → graduates to Review", () => {
    const last = LEARNING_STEPS_MIN.length - 1;
    const next = schedule(at({ state: 1, step: last }), "good", T0);
    expect(next.state).toBe(2);
    expect(next.step).toBe(0);
    expect(next.intervalDays).toBe(GRADUATING_INTERVAL_DAYS);
    expect(next.dueMs).toBe(T0 + GRADUATING_INTERVAL_DAYS * DAY);
  });
});

describe("Review", () => {
  it("Good → the interval grows by the ease", () => {
    const next = schedule(at({ state: 2, intervalDays: 10, ease: 2.5 }), "good", T0);
    expect(next.state).toBe(2);
    expect(next.intervalDays).toBe(25);
    expect(next.dueMs).toBe(T0 + 25 * DAY);
  });

  /**
   * The floor that prevents a permanent stall: at the minimum ease a one-day
   * interval rounds back to one day, and the card is scheduled at the same
   * interval forever. It would take months of real use to notice.
   */
  it("Good always advances by at least a day, even at minimum ease", () => {
    const next = schedule(at({ state: 2, intervalDays: 1, ease: EASE_MIN }), "good", T0);
    expect(Math.round(1 * EASE_MIN), "the un-floored product would stall").toBe(1);
    expect(next.intervalDays).toBe(2);
  });

  it("Good is capped, so no card is scheduled past the maximum", () => {
    const next = schedule(at({ state: 2, intervalDays: MAX_INTERVAL_DAYS, ease: 2.5 }), "good", T0);
    expect(next.intervalDays).toBe(MAX_INTERVAL_DAYS);
  });

  it("Again → Relearning, a lapse counted and ease docked", () => {
    const next = schedule(at({ state: 2, intervalDays: 40, ease: 2.5, lapses: 1 }), "again", T0);
    expect(next.state).toBe(3);
    expect(next.step).toBe(0);
    expect(next.lapses).toBe(2);
    expect(next.ease).toBeCloseTo(2.5 - EASE_LAPSE_PENALTY, 10);
    expect(next.lapsedIntervalDays, "the lapsed interval is remembered for re-graduation").toBe(40);
    expect(next.dueMs).toBe(T0 + RELEARNING_STEPS_MIN[0]! * MIN);
  });

  it("Again never docks ease below the floor", () => {
    const next = schedule(at({ state: 2, intervalDays: 5, ease: EASE_MIN }), "again", T0);
    expect(next.ease).toBe(EASE_MIN);
  });
});

describe("Relearning", () => {
  it("Again → back to the first relearning step", () => {
    const next = schedule(at({ state: 3, step: 0 }), "again", T0);
    expect(next.state).toBe(3);
    expect(next.step).toBe(0);
    expect(next.dueMs).toBe(T0 + RELEARNING_STEPS_MIN[0]! * MIN);
  });

  it("Good at the last step → Review at half the lapsed interval", () => {
    const last = RELEARNING_STEPS_MIN.length - 1;
    const next = schedule(at({ state: 3, step: last, lapsedIntervalDays: 40 }), "good", T0);
    expect(next.state).toBe(2);
    expect(next.intervalDays).toBe(20);
    expect(next.dueMs).toBe(T0 + 20 * DAY);
  });

  it("…and never below one day", () => {
    const last = RELEARNING_STEPS_MIN.length - 1;
    const next = schedule(at({ state: 3, step: last, lapsedIntervalDays: 1 }), "good", T0);
    expect(next.intervalDays).toBe(1);
  });
});

describe("every transition", () => {
  const states = [0, 1, 2, 3] as const;
  const ratings = ["again", "good"] as const;

  it("counts a rep and stamps the review time", () => {
    for (const state of states) {
      for (const rating of ratings) {
        const next = schedule(at({ state, reps: 7 }), rating, T0);
        expect(next.reps, `state ${state} / ${rating}`).toBe(8);
        expect(next.lastReviewMs, `state ${state} / ${rating}`).toBe(T0);
      }
    }
  });

  it("always schedules into the future", () => {
    for (const state of states) {
      for (const rating of ratings) {
        const next = schedule(at({ state, intervalDays: 3 }), rating, T0);
        expect(next.dueMs, `state ${state} / ${rating}`).toBeGreaterThan(T0);
      }
    }
  });

  it("is pure — the input is never mutated", () => {
    const card = at({ state: 2, intervalDays: 10 });
    const snapshot = JSON.stringify(card);
    schedule(card, "again", T0);
    expect(JSON.stringify(card)).toBe(snapshot);
  });
});

describe("the ladder a learner actually walks", () => {
  /**
   * Recorded so a change to a constant shows up as a diff in the schedule a
   * reader experiences, rather than as an abstract number moving. Measured by
   * this test, not asserted from a claim: New → Good repeatedly.
   */
  it("New → Good → Good → … gives 10min, 2d, 5d, 13d, 33d", () => {
    let card = newCard("h", T0);
    let now = T0;
    const seen: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const previous = now;
      card = schedule(card, "good", now);
      seen.push(
        card.state === 1
          ? `${(card.dueMs - previous) / MIN}min`
          : `${(card.dueMs - previous) / DAY}d`,
      );
      now = card.dueMs;
    }
    expect(seen).toEqual(["10min", "2d", "5d", "13d", "33d"]);
  });

  /**
   * The same ladder against FSRS-6's, recorded so the gap is a fact in the
   * suite rather than a claim in prose: ours is materially more conservative
   * (more reviews for the same material), which for governed knowledge is the
   * right side to err on.
   */
  it("is more conservative than FSRS-6 at every interval past graduation", () => {
    const fsrs6 = [2, 11, 46, 163, 498];
    let card = newCard("h", T0);
    let now = T0;
    const ours: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      card = schedule(card, "good", now);
      now = card.dueMs;
      if (card.state === 2) ours.push(card.intervalDays);
    }
    for (const [i, days] of ours.entries()) {
      expect(days, `interval ${i}: ours ${days}d vs FSRS-6 ${fsrs6[i]}d`).toBeLessThanOrEqual(
        fsrs6[i]!,
      );
    }
  });
});
