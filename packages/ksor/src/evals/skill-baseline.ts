/**
 * Every armed run of the agent tier, recorded — the with/without comparison
 * AGENTS.md demands before a skill is kept, as numbers a person can compare
 * rather than a memory of having looked.
 *
 * REPORTED, never gating (Testing contract, relevance class): a model is
 * stochastic and a threshold over a handful of runs flakes. The deterministic
 * gates in the suite are what turn red; this file is what a run is READ
 * against. It ratchets when there is enough history to say what "worse" is.
 *
 * Append a row per run. Never edit an old row: a baseline that moves is not a
 * baseline. If the harness changes in a way that makes rows incomparable —
 * the prompt, the graders, the fixture — say so in `note` on the first new
 * row, the way run 3 does.
 *
 * The two fixtures `CASES` gained after run 3 — `expense-policy-hard.pdf` and
 * `scanned-policy.pdf` — have no row yet: the second fixture's first armed run
 * is pending, and its row lands with the run that produces it, never before.
 */

export interface SkillArmResult {
  readonly gates: number;
  readonly of: number;
  readonly costUsd: number;
  readonly turns: number;
  readonly seconds: number;
  /** Wrote nothing and ended on a question — waiting for an owner who is not there. */
  readonly paused: boolean;
}

export interface SkillRun {
  readonly date: string;
  readonly skill: string;
  readonly fixture: string;
  readonly model: string;
  /** Which prompt the harness gave; rows with different prompts are not comparable. */
  readonly prompt: "tutorial" | "tutorial+standing-answers";
  readonly with: SkillArmResult;
  readonly without: SkillArmResult;
  readonly note: string;
}

export const SKILL_BASELINE: readonly SkillRun[] = [
  {
    date: "2026-09-02",
    skill: "add-sources",
    fixture: "expense-policy.pdf",
    model: "claude-sonnet-5",
    prompt: "tutorial",
    with: { gates: 9, of: 9, costUsd: 1.23, turns: 42, seconds: 291, paused: false },
    without: { gates: 8, of: 9, costUsd: 0.59, turns: 19, seconds: 130, paused: false },
    note:
      "First armed run. The baseline's one failed gate was the GRADER's: it ran the scaffold's " +
      "verify.mjs, which the baseline arm had removed with the skill, and read 'module not " +
      "found' as a miss. Every other gate passed on both arms. The grader now uses the repo's " +
      "copy; the true baseline score for this run is unknown but almost certainly 9/9.",
  },
  {
    date: "2026-09-02",
    skill: "add-sources",
    fixture: "expense-policy.pdf",
    model: "claude-sonnet-5",
    prompt: "tutorial",
    with: { gates: 4, of: 9, costUsd: 0.4, turns: 13, seconds: 72, paused: true },
    without: { gates: 9, of: 9, costUsd: 0.53, turns: 13, seconds: 157, paused: false },
    note:
      "The WITH arm extracted, compared, found two things it must not invent — the source " +
      "names no currency, and AGENTS.md says audience is never inferred — and stopped to ask " +
      "the owner, writing nothing. The baseline guessed ('team:finance — a guess'), chose " +
      "[public] unasked, and proceeded. The skill behaving correctly, and a one-shot harness " +
      "with nobody to answer misreading it. The prompt gained the owner's standing answers " +
      "after this run; rows before and after are not comparable on the WITH arm.",
  },
  {
    date: "2026-09-02",
    skill: "add-sources",
    fixture: "expense-policy.pdf",
    model: "claude-sonnet-5",
    prompt: "tutorial+standing-answers",
    with: { gates: 9, of: 9, costUsd: 1.71, turns: 62, seconds: 396, paused: false },
    without: { gates: 9, of: 9, costUsd: 0.56, turns: 19, seconds: 173, paused: false },
    note:
      "Told what the owner would say, the WITH arm proceeded: extracted with pdftotext, " +
      "verified against the extraction, and rendered the page on the dev server before " +
      "reporting — the read-back the skill prescribes. Both arms pass every gate. THE FINDING: " +
      "on a clean two-page PDF the deterministic gates do not distinguish the skill from its " +
      "absence; its value is in acts the gates do not score (extraction, verification, the " +
      "read-back, and refusing to invent) at three times the cost. A tenth gate — no currency " +
      "invented, since the source names none — was added AFTER this run and is not in its " +
      "score. The next fixture should be one a baseline plausibly gets wrong: tables, a " +
      "misreadable figure, a value the source states two ways.",
  },
];
