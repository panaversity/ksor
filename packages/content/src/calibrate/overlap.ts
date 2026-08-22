/**
 * WHICH probes held a calibration open, when it did not separate.
 *
 * A "NOT separable" verdict reads as "this corpus cannot be calibrated", and the
 * likeliest cause is something else: one probe in the out-of-corpus set that the
 * record actually answers. The report has every number needed to see that and
 * prints none of them — its remedy says "widen the probe set" when the fix is
 * sometimes to narrow it.
 *
 * Found on a real 81-document book. The set contained "which vector database
 * should I choose", against a record carrying a Postgres-and-AI chapter; it
 * scored 0.721 against a weakest in-corpus question of 0.680, the tool correctly
 * refused to paste a floor, and the conclusion drawn was that the record could
 * not support abstention at all. Removing that one probe separated it
 * immediately — `separable: max OOC 0.676 < min in-corpus 0.680` — and the floor
 * then held 10/10 against live questions.
 *
 * This lives beside `math.ts` rather than inside it because `renderReport` is
 * pinned byte-exact to the Python oracle's output (`fixtures/math.ts`, a
 * generated capture). The oracle governs the measurement; operator guidance is
 * ours to improve without regenerating it.
 */

import type { CalibrationReport, ScoredQuery } from "./math.js";

/**
 * Out-of-corpus probes scoring at or above the weakest in-corpus question,
 * worst first — the ones that decided the verdict. Empty when the measurement
 * separated, because then nothing held it open.
 */
export function overlappingProbes(report: CalibrationReport): readonly ScoredQuery[] {
  if (report.separable) return [];
  const weakest = report.low_tail[0]?.score;
  if (weakest === undefined) return [];
  return report.detail
    .filter((d) => !d.in_corpus && d.score >= weakest)
    .toSorted((a, b) => b.score - a.score);
}

/**
 * The guidance itself, or null when there is nothing to say.
 *
 * Deliberately names BOTH readings. The overlapping probe is sometimes a
 * question the record covers — mislabelled, and the measurement is fine once it
 * moves — and sometimes a genuine near-miss the corpus simply cannot separate,
 * in which case the floor stays uncalibrated and that is the correct outcome.
 * Asserting either one alone would send half the readers the wrong way.
 */
export function overlapAdvice(report: CalibrationReport): string | null {
  const overlapping = overlappingProbes(report);
  if (overlapping.length === 0) return null;
  return (
    "these out-of-corpus probes scored at or above your weakest in-corpus question:\n" +
    overlapping.map((d) => `  ${d.score.toFixed(3)}  ${d.query}\n`).join("") +
    "  ^ look at these first. Either the record COVERS one — move it to the\n" +
    "    in-corpus side, because a probe the record answers is not out of corpus\n" +
    "    — or it genuinely does not separate, and the floor stays uncalibrated.\n"
  );
}
