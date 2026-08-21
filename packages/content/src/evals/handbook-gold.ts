/**
 * A handbook-shaped gold set — the second one this project needs.
 *
 * The predecessor's gold (`sor-evals/gold/`, converted under decision 6) is
 * entirely curriculum: `python-crash-course`, `harness-engineering-crash-course`,
 * `foundations-everyone`. It is good gold and it cannot answer the question
 * issue #55 asks, because the classifier under test was TUNED on that corpus:
 * measuring the navigation threshold against curriculum gold would confirm 250,
 * since in a curriculum a sub-250-character segment genuinely is navigation.
 *
 * A handbook is the other shape. Its highest-value content is short and
 * declarative — "Probation: six months, with a written review at three and six"
 * — which the length-only rule cannot distinguish from a link list.
 *
 * So the fixture carries THREE categories on purpose, and the gold names which
 * each question is for:
 *
 *   short-substantive  a complete fact under the threshold — WRONGLY excluded
 *   long-prose         over the threshold — the control, currently reachable
 *   nav                a genuine link list — RIGHTLY excluded
 *
 * A permissive classifier scores well on the first two and fails the third. A
 * correct one passes all three. Measuring only recall would call the permissive
 * one a win, which is why the categories are in the data rather than in a note.
 *
 * Method follows the predecessor's, deliberately rather than reinventing it:
 * success@k over DISTINCT NODES, comparison PAIRED per question, and
 * false-abstention / out-of-corpus leak measured once. Absolute numbers are
 * gold-dependent; trust the paired deltas.
 */

export type GoldKind = "short-substantive" | "long-prose" | "nav";

export interface GoldRow {
  readonly q: string;
  /** The document slug that should be retrieved. */
  readonly expect: string;
  readonly kind: GoldKind;
  /** Other slugs that would also be a correct answer. */
  readonly alsoOk?: readonly string[];
}

/**
 * In-corpus questions, phrased as a person asks them — never lifted from the
 * passage, which is the bias the predecessor's README names and which this
 * project shipped a calibrator without until 0.0.12.
 */
export const HANDBOOK_GOLD: readonly GoldRow[] = [
  // ── short-substantive: the content the current rule loses
  { q: "how long is probation", expect: "probation", kind: "short-substantive" },
  { q: "when is my probation review", expect: "probation", kind: "short-substantive" },
  { q: "can probation be extended", expect: "probation", kind: "short-substantive" },
  { q: "how much notice do I have to give", expect: "notice-periods", kind: "short-substantive" },
  {
    q: "what is the notice period during probation",
    expect: "notice-periods",
    kind: "short-substantive",
  },
  { q: "does garden leave count as notice", expect: "notice-periods", kind: "short-substantive" },
  {
    q: "do I need a receipt for a fifteen pound lunch",
    expect: "expense-limits",
    kind: "short-substantive",
  },
  { q: "what is the mileage rate", expect: "expense-limits", kind: "short-substantive" },
  {
    q: "how long do I have to claim an expense",
    expect: "expense-limits",
    kind: "short-substantive",
  },

  // ── long-prose: the control. These work today; they must keep working.
  { q: "what is the hotel limit in London", expect: "travel", kind: "long-prose" },
  { q: "can I fly premium economy", expect: "travel", kind: "long-prose" },
  {
    q: "when do I have to page a director about a breach",
    expect: "incidents",
    kind: "long-prose",
  },
  { q: "what counts as a severity one incident", expect: "incidents", kind: "long-prose" },
];

/**
 * Scope-adjacent probes — near-misses in the same domain, never far-domain
 * questions. A handbook that declines "what is the boiling point of mercury"
 * has proved nothing; declining "what is the parental leave policy" is the
 * measurement (decision 20, and the testing contract).
 */
export const HANDBOOK_OOC: readonly string[] = [
  "what is the parental leave policy",
  "how many holiday days do I get",
  "what is the bonus scheme",
  "what pension contribution does the company make",
  "how do I raise a grievance",
  "what is the sickness absence policy",
  "can I work from abroad",
  "who is my HR business partner",
];

/**
 * The negative control that separates a CORRECT classifier from a merely
 * PERMISSIVE one: the index page is a link list and must never be the answer
 * to a content question. Admitting everything would score well on recall and
 * fail here.
 */
export const NAV_NEGATIVE_SLUG = "index";
