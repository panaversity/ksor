/**
 * Every armed run of the trigger eval — WHICH skill a real agent reached for,
 * per phrase, per model.
 *
 * REPORTED, never gating (Testing contract, relevance class): a model is
 * stochastic, and a threshold over a handful of runs flakes. This file is what
 * a run is read AGAINST, and what a decision about a skill's description — or
 * about whether a skill should exist at all — is made from.
 *
 * Append a row per sweep. Never edit an old row: a baseline that moves is not a
 * baseline. When the harness or a description changes in a way that makes rows
 * incomparable, say so in `note` on the first new row.
 *
 * WHY THE MODEL IS A COLUMN. The first sweep found the answer depends on it.
 * The same phrase, the same scaffold, the same harness: `claude-sonnet-5` fired
 * `add-sources` 3/3 and `claude-opus-5` fired nothing 0/2. A single-model run is
 * a measurement of that model, not of the trigger — and AGENTS.md already
 * concedes "the adopter's own model is whatever they run".
 */

export interface TriggerRow {
  readonly id: string;
  /** The skill the description promises, or null for "none should fire". */
  readonly expect: string | null;
  readonly hits: number;
  readonly runs: number;
}

export interface TriggerSweep {
  readonly date: string;
  readonly model: string;
  /** Which version of the descriptions was probed; rows across a change are not comparable. */
  readonly descriptions: string;
  readonly rows: readonly TriggerRow[];
  readonly costUsd: number;
  readonly note: string;
}

export const TRIGGER_BASELINE: readonly TriggerSweep[] = [
  {
    date: "2026-09-03",
    model: "claude-sonnet-5",
    descriptions: "0.0.59",
    rows: [
      { id: "file-in-repo", expect: "add-sources", hits: 3, runs: 3 },
      { id: "own-words", expect: "add-sources", hits: 3, runs: 3 },
      { id: "from-memory", expect: "add-sources", hits: 3, runs: 3 },
      { id: "get-started", expect: "intake-interview", hits: 3, runs: 3 },
      { id: "stay-silent", expect: null, hits: 3, runs: 3 },
    ],
    costUsd: 4.16,
    note:
      "First armed sweep. Every phrase fired the skill its description promises, including " +
      "both controls — a different skill winning `get-started`, and no skill firing on a " +
      "question about the repo itself.",
  },
  {
    date: "2026-09-03",
    model: "claude-opus-5",
    descriptions: "0.0.59",
    rows: [
      { id: "file-in-repo", expect: "add-sources", hits: 0, runs: 2 },
      { id: "own-words", expect: "add-sources", hits: 2, runs: 2 },
      { id: "from-memory", expect: "add-sources", hits: 2, runs: 2 },
      { id: "get-started", expect: "intake-interview", hits: 2, runs: 2 },
      { id: "stay-silent", expect: null, hits: 2, runs: 2 },
    ],
    costUsd: 5.06,
    note:
      "THE FINDING, and it is narrower than the live walk suggested. Opus reaches for " +
      "`add-sources` readily — on the description's own quoted phrase and on the " +
      "no-source-to-hand case — picks `intake-interview` correctly, and stays silent when it " +
      "should. It misses exactly one shape: the owner POINTING AT A FILE already in the repo " +
      "and naming a destination (`src/policy.txt` … `under finance/`). That prompt is concrete " +
      "enough to act on directly, so the model does, and never consults the skill. Sonnet " +
      "fires on the same phrase 3/3, which is why the 0.0.59 live walk (default model, one " +
      "run) and the first probe (Sonnet, pinned) disagreed — neither was wrong, and neither " +
      "alone measured the trigger.",
  },
  {
    date: "2026-09-03",
    model: "claude-opus-5",
    descriptions: "0.0.59 + one clause naming the file-in-repo shape",
    rows: [
      { id: "file-in-repo", expect: "add-sources", hits: 0, runs: 3 },
      { id: "own-words", expect: "add-sources", hits: 3, runs: 3 },
      { id: "from-memory", expect: "add-sources", hits: 3, runs: 3 },
      { id: "get-started", expect: "intake-interview", hits: 3, runs: 3 },
      { id: "stay-silent", expect: null, hits: 3, runs: 3 },
    ],
    costUsd: 7.79,
    note:
      "A NEGATIVE RESULT, recorded because it is the useful one. The obvious repair for the " +
      "row above — name the missing shape in the description — was made and measured: " +
      '`add-sources` 2.1.0 read "points at a file already in the repo and says where it ' +
      "belongs\". `file-in-repo` stayed at 0/3. So the miss is NOT the description's wording; " +
      "the model acts directly on an instruction concrete enough to act on, and never " +
      "consults a skill to do it. The clause was reverted rather than kept: it is resident " +
      "context in every session and bought nothing a measurement can see. What this leaves is " +
      "a real question for the owner rather than an edit — see the note in " +
      "`skill-triggers.agent.test.ts`.",
  },
];
