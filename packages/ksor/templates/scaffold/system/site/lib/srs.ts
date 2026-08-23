/**
 * Review scheduling for flashcard decks.
 *
 * A two-grade SM-2 variant. It is NOT FSRS, it models no memory, and it makes
 * no retention guarantee — see `SCHEDULER_POLICY` and the note at the foot of
 * this file. Naming it for what it is costs nothing and stops a future reader
 * assuming a probabilistic guarantee that was never here.
 *
 * A LEAF and a pure function: `(schedule, rating, now) -> schedule`. No React,
 * no storage, no ambient clock — `now` is always passed in, which is what makes
 * the whole transition table assertable against a frozen clock.
 */

/** Persisted beside the state, so a stored record always says what wrote it. */
export const SCHEDULER_POLICY = "ksor-sm2-v1";

/** New | Learning | Review | Relearning. */
export type CardState = 0 | 1 | 2 | 3;

export type Rating = "again" | "good";

export interface CardSchedule {
  readonly state: CardState;
  /** Index into the active step ladder while sub-day; 0 in Review. */
  readonly step: number;
  /** The last scheduled interval in days; 0 while sub-day. */
  readonly intervalDays: number;
  /** The interval a lapse interrupted, remembered so re-graduation can halve it. */
  readonly lapsedIntervalDays: number;
  /** Growth multiplier, clamped to [EASE_MIN, EASE_START]. */
  readonly ease: number;
  readonly reps: number;
  readonly lapses: number;
  readonly dueMs: number;
  readonly lastReviewMs?: number;
  /** Hash of the card's authored text — a change resets THIS card only. */
  readonly hash: string;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

// Every constant below is a choice. FSRS's own defaults are named where ours
// match them, so a future reader can see which numbers are inherited and which
// are ours.
/** Matches FSRS's default learning steps. */
export const LEARNING_STEPS_MIN: readonly number[] = [1, 10];
/** Matches FSRS's default relearning steps. */
export const RELEARNING_STEPS_MIN: readonly number[] = [10];
/** Matches FSRS's observed New → Good → Good interval. */
export const GRADUATING_INTERVAL_DAYS = 2;
export const EASE_START = 2.5;
export const EASE_MIN = 1.3;
export const EASE_LAPSE_PENALTY = 0.2;
/** A re-graduated card returns at half the interval its lapse interrupted. */
export const LAPSE_INTERVAL_FACTOR = 0.5;
/** Ten years. FSRS ships a hundred; a century is not a claim this can make. */
export const MAX_INTERVAL_DAYS = 3650;
export const MIN_REVIEW_INTERVAL_DAYS = 1;

export function newCard(hash: string, now: number): CardSchedule {
  return {
    state: 0,
    step: 0,
    intervalDays: 0,
    lapsedIntervalDays: 0,
    ease: EASE_START,
    reps: 0,
    lapses: 0,
    dueMs: now,
    hash,
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Advance along a sub-day ladder, or null when the ladder is finished. */
function nextRung(steps: readonly number[], step: number): number | null {
  return step + 1 < steps.length ? step + 1 : null;
}

/**
 * The next schedule for a card, given how the learner graded it and when.
 *
 * Never mutates its input: review state is persisted, and an in-place update
 * that a failed write leaves half-applied is a corrupt record.
 */
export function schedule(card: CardSchedule, rating: Rating, now: number): CardSchedule {
  const base = { ...card, reps: card.reps + 1, lastReviewMs: now };

  if (card.state === 0) {
    // New. Again starts the ladder; Good skips its first rung — a card the
    // learner already knows should not be asked again in sixty seconds.
    const step = rating === "again" ? 0 : Math.min(1, LEARNING_STEPS_MIN.length - 1);
    return {
      ...base,
      state: 1,
      step,
      dueMs: now + (LEARNING_STEPS_MIN[step] ?? 1) * MINUTE_MS,
    };
  }

  if (card.state === 1 || card.state === 3) {
    const relearning = card.state === 3;
    const steps = relearning ? RELEARNING_STEPS_MIN : LEARNING_STEPS_MIN;

    if (rating === "again") {
      return { ...base, step: 0, dueMs: now + (steps[0] ?? 1) * MINUTE_MS };
    }

    const advanced = nextRung(steps, card.step);
    if (advanced !== null) {
      return { ...base, step: advanced, dueMs: now + (steps[advanced] ?? 1) * MINUTE_MS };
    }

    // Graduating. A first graduation takes the fixed interval; a RE-graduation
    // takes half the interval its lapse interrupted, so a card that was on a
    // 40-day interval does not restart from two days.
    const intervalDays = relearning
      ? clamp(
          Math.round(card.lapsedIntervalDays * LAPSE_INTERVAL_FACTOR),
          MIN_REVIEW_INTERVAL_DAYS,
          MAX_INTERVAL_DAYS,
        )
      : GRADUATING_INTERVAL_DAYS;

    return { ...base, state: 2, step: 0, intervalDays, dueMs: now + intervalDays * DAY_MS };
  }

  // Review.
  if (rating === "again") {
    return {
      ...base,
      state: 3,
      step: 0,
      lapses: card.lapses + 1,
      ease: Math.max(EASE_MIN, card.ease - EASE_LAPSE_PENALTY),
      lapsedIntervalDays: card.intervalDays,
      dueMs: now + (RELEARNING_STEPS_MIN[0] ?? 10) * MINUTE_MS,
    };
  }

  // The `intervalDays + 1` floor is load-bearing: at the minimum ease,
  // round(1 * 1.3) is 1, and the card would be scheduled at the same interval
  // forever. One clamp prevents a stall that takes months of use to notice.
  const grown = clamp(
    Math.round(card.intervalDays * card.ease),
    card.intervalDays + 1,
    MAX_INTERVAL_DAYS,
  );
  return { ...base, state: 2, step: 0, intervalDays: grown, dueMs: now + grown * DAY_MS };
}

/**
 * The cards due at `now`, soonest first, with never-seen cards ahead of
 * overdue ones so a first session walks the deck in its authored order.
 *
 * This is the function the predecessor computed and then never called — its
 * deck rendered `deck.cards` directly, so its spaced repetition influenced
 * nothing a learner ever saw (`useFSRS.ts:253-256` against `Flashcards.tsx:176`).
 * Here it is what the session reads.
 */
export function dueOrder<T>(
  cards: readonly T[],
  scheduleOf: (card: T) => CardSchedule,
  now: number,
): readonly T[] {
  return cards
    .map((card, index) => ({ card, index, state: scheduleOf(card) }))
    .filter((entry) => entry.state.dueMs <= now)
    .sort((a, b) =>
      a.state.state === 0 && b.state.state !== 0
        ? -1
        : b.state.state === 0 && a.state.state !== 0
          ? 1
          : a.state.dueMs !== b.state.dueMs
            ? a.state.dueMs - b.state.dueMs
            : a.index - b.index,
    )
    .map((entry) => entry.card);
}

/**
 * What this gives up against FSRS, recorded beside the code rather than in a
 * document that can drift from it:
 *
 *  1. No memory model. `ease` is a heuristic multiplier with no probabilistic
 *     meaning; it cannot answer "how likely is recall today".
 *  2. Elapsed time is ignored — the largest single loss. FSRS feeds
 *     retrievability into every update, so a card recalled sixty days late
 *     earns a much larger interval. Here the interval grows the same whether
 *     the review was on time or a year late.
 *  3. No retention target. FSRS derives intervals to hit a requested
 *     retention; "roughly 90%" is a sentence this is not entitled to.
 *  4. No optimisation. FSRS re-fits parameters per learner; these are
 *     constants, identical for everyone.
 *  5. No graded lapse recovery — a flat half-interval and a flat ease penalty,
 *     whatever the card.
 *  6. Four grades reduced to two, which costs nothing: the UI never exposed
 *     Hard or Easy, so no information that was ever collected was discarded.
 */
