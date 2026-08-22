/**
 * The recorded measurement a change is judged against.
 *
 * Every retrieval change before this one was argued from a fresh number with
 * nothing to compare it to, which makes "better" a matter of whoever ran it
 * last. A baseline turns that into a delta: the harness prints current against
 * recorded, and the guarantees below fail rather than drift.
 *
 * WHAT RATCHETS AND WHAT DOES NOT, following the testing contract:
 *   - `shortSubstantiveAt1` and `longProseAt1` are FLOORS. They may rise and a
 *     rise should be recorded here; they may not fall without a decision.
 *   - `navNegativeHits` is a CEILING, and it is the one that stops "improve
 *     recall" from meaning "return everything". A classifier that admits the
 *     link-list index page scores better on both floors and is worse.
 *   - `oocAnswered` is REPORTED, never asserted: the fixture declares no
 *     abstention floor, so every out-of-corpus probe is answered by design and
 *     the number measures the fixture's posture, not the retriever's quality.
 *     It becomes meaningful only once the fixture is calibrated.
 *
 * Absolute values are gold-dependent — trust the paired delta, not the number.
 * Re-measure with:
 *   KSOR_DB_URL=… GEMINI_API_KEY=… pnpm vitest run --config vitest.db.config.ts \
 *     --disable-console-intercept packages/content/src/evals/retrieval-measure.db.test.ts
 */

export interface RetrievalBaseline {
  /** When this line was measured, and against which corpus and space. */
  readonly measuredAt: string;
  readonly corpus: string;
  readonly embedding: string;
  /** Floors: distinct-node success@1 by gold category. */
  readonly shortSubstantiveAt1: number;
  readonly shortSubstantiveTotal: number;
  readonly longProseAt1: number;
  readonly longProseTotal: number;
  /** Ceiling: gold questions that returned the link-list page. */
  readonly navNegativeHits: number;
  /** Reported only — the fixture declares no floor, so this is its posture. */
  readonly oocAnswered: number;
  readonly oocTotal: number;
  /** What changed since the previous line, in one sentence. */
  readonly note: string;
}

/**
 * The line in force. Supersede it by REPLACING it and moving the old one into
 * `RETRIEVAL_HISTORY` below — a baseline with no history is just a number.
 */
export const RETRIEVAL_BASELINE: RetrievalBaseline = {
  measuredAt: "2026-08-22",
  corpus: "evals/fixtures/handbook (6 documents, 13 gold questions, 8 ooc probes)",
  embedding: "gemini-embedding-001 @ 1536",
  shortSubstantiveAt1: 9,
  shortSubstantiveTotal: 9,
  longProseAt1: 4,
  longProseTotal: 4,
  navNegativeHits: 0,
  oocAnswered: 8,
  oocTotal: 8,
  note:
    "Issue #55: `classify()` decides navigation by SHAPE rather than length. " +
    "Short substantive facts went 0/9 -> 9/9 at rank 1, the long-prose control " +
    "held at 4/4, and the link-list page was returned 0 times — so the gain is " +
    "correctness, not permissiveness.",
};

/** Superseded lines, newest first. Kept so a regression can be dated. */
export const RETRIEVAL_HISTORY: readonly RetrievalBaseline[] = [
  {
    measuredAt: "2026-08-21",
    corpus: "evals/fixtures/handbook (6 documents, 13 gold questions, 8 ooc probes)",
    embedding: "gemini-embedding-001 @ 1536",
    shortSubstantiveAt1: 0,
    shortSubstantiveTotal: 9,
    longProseAt1: 4,
    longProseTotal: 4,
    navNegativeHits: 0,
    oocAnswered: 8,
    oocTotal: 8,
    note:
      "The defect, characterized: every short substantive fact was unreachable at " +
      "any k because `classify()` labelled anything under 250 code points `nav`, " +
      "and the serving predicate admits only `prose`.",
  },
];
