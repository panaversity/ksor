/**
 * Has the declared floor gone stale? — read off the record's own traffic.
 *
 * `vector_floor` is measured once, against the corpus as it stood that day.
 * The record then grows and nothing re-examines the number, which matters here
 * more than a drifting constant usually would: the floor IS the abstention
 * guarantee. AGENTS.md forbids copying a calibrated constant BETWEEN corpora;
 * the same reasoning applies across TIME within one corpus, and there nothing
 * enforced it (#182).
 *
 * It fails in the dangerous direction and in silence. As the corpus grows,
 * questions that were out-of-corpus start scoring above a fixed floor, so the
 * record answers what it used to refuse — no error, no log line, and an
 * envelope still reporting `gate: { floor: … }` exactly as before.
 *
 * WHAT THIS READS, and why it is nearly free: every serving act already leaves
 * a row (schema §7), and `detail.top_cosine` is on both sides of the gate —
 * `search_abstained` carried it from the start and `similarity_searched` gained
 * it with the audit-detail work. So the distribution #182 asks for is already
 * in the database. One query, no provider key, no embedding call, no LLM, no
 * exporter, and no dependency on the unimplemented telemetry binding (#180).
 *
 * WHAT IT IS NOT. This is a MONITOR, not a calibration: it measures the
 * questions people actually asked, so it can say the floor has gone permissive
 * against real traffic and it can never say the floor is too strict for
 * questions nobody asks. The authoritative answer is re-running
 * `ksor calibrate` against the corpus. It also needs traffic — a record nobody
 * queries reports nothing, and says so rather than reading as healthy.
 *
 * AND IT NEVER GATES. A stale floor is a "this wants re-measuring" state, and
 * refusing a build for one would make the shortest way out deleting
 * `vector_floor` — turning the abstention gate off entirely to clear the
 * error, which destroys the guarantee the check exists to protect. The same
 * reasoning `build/lifecycle-notice.ts` records for a passed review date, where
 * the escape was deleting `stale_after`.
 */

/** One logged search: the gate's own signal, and which side of it the search fell. */
export interface DriftSample {
  readonly topCosine: number;
  readonly abstained: boolean;
}

/**
 * How close to the floor an answer has to be to count as marginal.
 *
 * 0.01 is not a tuned threshold — it is the size of the decision in this
 * record's own gold, quoted rather than invented: in-corpus at 0.730 / 0.671
 * against a scope-adjacent near-miss at 0.683 (`evals/behavioural.db.test.ts`),
 * so a hundredth of a cosine is the smallest difference that has ever changed
 * an answer here. An answer inside that band is one the floor barely admitted.
 */
export const MARGIN_BAND = 0.01;

/**
 * Below this many searches the shape of a distribution is noise, so the report
 * declines to characterise it. A number that describes 4 searches, printed
 * beside a governance guarantee, would be read as evidence.
 */
export const MIN_SAMPLES = 30;

/** Enough to absorb one subtraction of two cosines, and far below any difference that means anything. */
const FLOAT_SLACK = 1e-9;

export type DriftVerdict = "no-data" | "watch" | "steady";

export interface DriftReport {
  readonly floor: number;
  readonly samples: number;
  readonly abstained: number;
  readonly answered: number;
  /** Answered searches whose top score sat within MARGIN_BAND above the floor. */
  readonly marginal: number;
  /** Of the ANSWERED searches, the share that were marginal; 0 when none were answered. */
  readonly marginalShare: number;
  /** Of ALL searches, the share the gate refused. */
  readonly abstainRate: number;
  /** Top scores of the ANSWERED searches; null when nothing was answered. */
  readonly p05: number | null;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly verdict: DriftVerdict;
  readonly why: string;
}

/** Nearest-rank percentile over a sorted ascending list. */
function percentile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[rank] ?? null;
}

/**
 * Characterise the traffic against the declared floor.
 *
 * Two numbers carry the verdict, and both are reported whatever it says,
 * because the verdict is a reading aid and the numbers are the evidence:
 *
 *   the ABSTAIN RATE       — a gate that has stopped refusing anything is
 *                            either serving a record that now covers its
 *                            traffic, or a floor that has fallen behind it.
 *   the MARGINAL SHARE     — answers the floor barely admitted. These are the
 *                            ones that would flip if the number moved at all,
 *                            so a large share means the answer set turns on a
 *                            constant measured against a smaller corpus.
 *
 * `watch` is deliberately not called "stale". This cannot tell the two causes
 * apart — only a re-measurement can — so it names what it saw and says what to
 * run.
 */
export function driftReport(floor: number, samples: readonly DriftSample[]): DriftReport {
  const answeredScores = samples
    .filter((s) => !s.abstained)
    .map((s) => s.topCosine)
    .sort((a, b) => a - b);
  const abstained = samples.length - answeredScores.length;
  // Inclusive, with a float tolerance, because the words are "within
  // MARGIN_BAND of the floor" and a reader is entitled to have that mean what
  // it says: 0.56 against a 0.55 floor subtracts to 0.010000000000000009 in
  // IEEE, so a strict `<` would report exactly-on-the-band as outside it —
  // an artifact of binary floats masquerading as a judgement about a score.
  const marginal = answeredScores.filter(
    (score) => score - floor <= MARGIN_BAND + FLOAT_SLACK,
  ).length;
  const marginalShare = answeredScores.length === 0 ? 0 : marginal / answeredScores.length;
  const abstainRate = samples.length === 0 ? 0 : abstained / samples.length;

  const base = {
    floor,
    samples: samples.length,
    abstained,
    answered: answeredScores.length,
    marginal,
    marginalShare,
    abstainRate,
    p05: percentile(answeredScores, 0.05),
    p50: percentile(answeredScores, 0.5),
    p95: percentile(answeredScores, 0.95),
  };

  if (samples.length < MIN_SAMPLES) {
    return {
      ...base,
      verdict: "no-data",
      why: `only ${samples.length} logged search(es) — too few to characterise; this reports traffic, so a record nobody queries says nothing rather than looking healthy`,
    };
  }
  // A fifth of answers sitting inside the band the gold says decides an answer
  // is enough to say the floor is load-bearing at its exact value. The band is
  // quoted from a measurement; this share is a REPORTING threshold chosen so
  // the line fires rarely, and it is named as such rather than dressed up.
  if (marginalShare >= 0.2) {
    return {
      ...base,
      verdict: "watch",
      why: `${marginal} of ${answeredScores.length} answers scored within ${MARGIN_BAND} of the floor — the answer set turns on this exact number`,
    };
  }
  if (abstained === 0) {
    return {
      ...base,
      verdict: "watch",
      why: `the gate refused none of ${samples.length} searches — either the record now covers its traffic, or the floor has fallen behind it, and only a re-measurement tells them apart`,
    };
  }
  return {
    ...base,
    verdict: "steady",
    why: `${abstained} of ${samples.length} searches were refused, and ${marginal} answer(s) sat within ${MARGIN_BAND} of the floor`,
  };
}

/** The report as the CLI prints it. Numbers first; the verdict is a reading aid. */
export function renderDrift(report: DriftReport, window: string): string {
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  const score = (n: number | null): string => (n === null ? "—" : n.toFixed(3));
  const lines = [
    `floor drift — ${window}`,
    `  declared vector_floor  ${report.floor.toFixed(3)}`,
    `  searches logged        ${report.samples}  (${report.answered} answered, ${report.abstained} abstained)`,
    `  abstain rate           ${pct(report.abstainRate)}`,
    `  answered top score     p05 ${score(report.p05)}  p50 ${score(report.p50)}  p95 ${score(report.p95)}`,
    `  within ${MARGIN_BAND} of floor    ${report.marginal}  (${pct(report.marginalShare)} of answers)`,
    `  verdict                ${report.verdict.toUpperCase()} — ${report.why}`,
  ];
  if (report.verdict === "watch") {
    lines.push(
      "",
      "  This is traffic, not a calibration: it cannot tell a record that grew",
      "  from a floor that fell behind. Re-measure to find out —",
      "    ksor calibrate --instance instance.md --queries-file <your questions>",
      "  and paste the floor it prints if it differs from the declared one.",
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The logged searches for this corpus, newest `days` days.
 *
 * Only rows carrying a NUMERIC `top_cosine`: an audit row shed under
 * saturation, or one written before that detail existed, is ABSENT rather than
 * counted as a zero — a shed row is a gap in the evidence, and scoring it as
 * zero would drag every statistic here toward a number nobody measured, in the
 * direction that makes a floor look safer than it is.
 *
 * Scoped by CORPUS as well as tenant, for the reason `readLedger` records: a
 * tenant serving two corpora would otherwise measure one record's floor
 * against the other's traffic. Read through `runAuditRead` — the serving role
 * has no SELECT on this table at all, deliberately, and widening that to read
 * a monitor would trade an audit guarantee for a convenience.
 */
export const DRIFT_SQL = `
SELECT (detail->>'top_cosine')::float8 AS top_cosine,
       action = 'search_abstained'     AS abstained
  FROM retrieval_log
 WHERE tenant_id = $1
   AND corpus_id = $2
   AND action IN ('similarity_searched','search_abstained')
   AND created_at > now() - ($3 || ' days')::interval
   AND jsonb_typeof(detail->'top_cosine') = 'number'
 ORDER BY created_at DESC
 LIMIT $4`;

/** How many rows one check reads at most — a bound, so a busy record cannot make this expensive. */
export const DRIFT_LIMIT = 5000;
