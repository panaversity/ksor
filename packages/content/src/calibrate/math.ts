/**
 * The calibration mathematics of the content kernel — the risk–coverage
 * maths, the two recommended floors, the paste-line value, and the printed
 * recommendation block — converted verbatim from the predecessor's
 * calibrate.py (sor-content @ b554f91, decision 6). Pure: no DB, no LLM, no
 * fs. The passage-sampling SQL, query synthesis, and CLI wiring land in a
 * later pass; fixtures/math.json is the oracle record these functions are
 * tested against, byte- and bit-exact.
 */

export interface Scored {
  readonly score: number;
  readonly in_corpus: boolean;
}

export interface FloorStats {
  readonly floor: number;
  readonly coverage: number;
  readonly risk: number;
  readonly false_abstention: number;
  readonly answer_precision: number;
}

export interface FloorRecommendation {
  readonly zero_fa: FloorStats | null;
  readonly target_precision: FloorStats | null;
  readonly target: number;
}

/** Which door produced the in-corpus side — never compare floors across doors. */
export type CalibrationDoor = "synthesized" | "queries-file";

/** One scored query, as the report's `detail` and `low_tail` carry it. */
export interface ScoredQuery {
  readonly query: string;
  readonly in_corpus: boolean;
  readonly score: number;
}

export interface ReportMeta {
  readonly generation: number | null;
  readonly pinned: boolean;
  readonly model: string;
  readonly dim: number;
  readonly door: CalibrationDoor;
  /**
   * Where the OUT-OF-CORPUS probes came from. The built-in set can only ever be
   * far-domain — scope-adjacency is a property of the corpus, and a set shipped
   * in the binary does not know the corpus — so a separability verdict resting
   * on it is measuring the easy half of the question.
   */
  readonly oocSource: "built-in" | "provided";
}

/** The report dict of the oracle's `calibrate()`, key for key. */
export interface CalibrationReport {
  readonly generation: number | null;
  readonly pinned: boolean;
  readonly model: string;
  readonly dim: number;
  readonly door: CalibrationDoor;
  readonly in_corpus_queries: number;
  readonly ooc_probes: number;
  readonly aurc: number;
  readonly zero_fa: FloorStats | null;
  readonly target_precision: FloorStats | null;
  readonly paste: number;
  readonly paste_why: string;
  /**
   * min(in-corpus scores) − max(out-of-corpus scores): how much room the floor
   * has before a real question falls under it or a probe climbs over it.
   * NEGATIVE when the two distributions overlap, which is exactly the
   * `separable: false` case — carried as a number so the size of the overlap is
   * legible, not just its existence.
   */
  readonly margin: number;
  /**
   * Did the measurement separate in-corpus from out-of-corpus at all? When it
   * did NOT, there is no floor to paste — only a diagnosis. Carried on the
   * report so the renderer cannot hand out a number the maths just refused.
   */
  readonly separable: boolean;
  /** See ReportMeta.oocSource. Carried so the renderer can qualify the verdict. */
  readonly ooc_source: "built-in" | "provided";
  /** The precision target the ALT floor was measured at — reported, not assumed. */
  readonly target: number;
  /** When the measurement was taken: the invariant says the DATE rides beside the number. */
  readonly measured_at: string;
  readonly low_tail: ScoredQuery[];
  readonly detail: ScoredQuery[];
}

// ---------------------------------------------------------------------------
// The risk–coverage maths (calibrate.py:114-170, quarried verbatim there,
// ported 1:1 here).
// ---------------------------------------------------------------------------

/**
 * Confusion counts at one floor. A score exactly AT the floor SERVES (`>=`);
 * the serve-time gate abstains on strictly-less-than — both directions exact.
 */
export function statsAtFloor(points: readonly Scored[], floor: number): FloorStats {
  const total = points.length;
  const inCorpus = points.filter((p) => p.in_corpus);
  const answered = points.filter((p) => p.score >= floor);
  const inAnswered = answered.filter((p) => p.in_corpus);
  const leaked = answered.filter((p) => !p.in_corpus);
  const coverage = total ? answered.length / total : 0.0;
  const risk = answered.length ? leaked.length / answered.length : 0.0;
  const answer_precision = answered.length ? inAnswered.length / answered.length : 0.0;
  const false_abstention = inCorpus.length
    ? (inCorpus.length - inAnswered.length) / inCorpus.length
    : 0.0;
  return { floor, coverage, risk, false_abstention, answer_precision };
}

/** Every distinct observed score is a candidate floor, walked high to low. */
export function riskCoverageCurve(points: readonly Scored[]): FloorStats[] {
  const floors = [...new Set(points.map((p) => p.score))].sort((a, b) => b - a);
  return floors.map((f) => statsAtFloor(points, f));
}

/**
 * Trapezoid area under the risk–coverage curve, from (0, 0), with the
 * oracle's exact term expression. The oracle sums via builtins.sum, which
 * since CPython 3.12 is Neumaier-compensated for floats (gh-100425) — a
 * plain left fold diverges by 1 ULP (measured on this port 2026-08-19:
 * 0.7291666666666665 vs Python's 0.7291666666666666), so CPython's float
 * sum path is replicated exactly, final compensation added only when
 * non-zero and finite, as bltinmodule.c does.
 */
export function aurc(points: readonly Scored[]): number {
  const curve = riskCoverageCurve(points);
  const xs = [0.0, ...curve.map((s) => s.coverage)];
  const ys = [0.0, ...curve.map((s) => s.risk)];
  let area = 0;
  let comp = 0;
  for (let i = 1; i < xs.length; i++) {
    const term = ((xs[i]! - xs[i - 1]!) * (ys[i]! + ys[i - 1]!)) / 2;
    const t = area + term;
    if (Math.abs(area) >= Math.abs(term)) {
      comp += area - t + term;
    } else {
      comp += term - t + area;
    }
    area = t;
  }
  if (comp && Number.isFinite(comp)) {
    area += comp;
  }
  return area;
}

/**
 * The two recommended floors: the zero-false-abstention floor (min in-corpus
 * score — never refuses a real question, its OOC leak reported beside it),
 * and among all candidate floors meeting `targetPrecision`, the one with
 * maximum coverage (null when no floor meets the target — reported honestly,
 * never faked).
 */
export function recommendFloor(
  points: readonly Scored[],
  targetPrecision: number = 0.95,
): FloorRecommendation {
  const inCorpus = points.filter((p) => p.in_corpus);
  const zero_fa = inCorpus.length
    ? statsAtFloor(
        points,
        inCorpus.reduce((m, p) => Math.min(m, p.score), Infinity),
      )
    : null;
  const curve = riskCoverageCurve(points);
  const meeting = curve.filter((s) => s.answer_precision >= targetPrecision);
  // Python's max() keeps the FIRST maximal element on coverage ties.
  const target = meeting.length
    ? meeting.reduce((best, s) => (s.coverage > best.coverage ? s : best))
    : null;
  return { zero_fa, target_precision: target, target: targetPrecision };
}

/**
 * The value an operator pastes as `vector_floor`, chosen INSIDE the measured
 * safety margin. Naive rounding of the zero-FA floor is downward-biased
 * (0.664 → 0.66) and can re-admit an OOC probe scoring in the rounding gap.
 * Separable corpus: the midpoint of (max OOC, min in-corpus] — maximum
 * margin against serve-time score jitter on BOTH sides — rounded to 3
 * decimals, falling back to hi exactly when rounding leaves the (narrow)
 * interval. Not separable: the precise zero-FA floor with the leak stated.
 */
export function pasteValue(
  points: readonly Scored[],
): [paste: number, why: string, separable: boolean] {
  const inScores = points.filter((p) => p.in_corpus).map((p) => p.score);
  const oocScores = points.filter((p) => !p.in_corpus).map((p) => p.score);
  if (!inScores.length || !oocScores.length) {
    throw new Error("paste_value needs both in-corpus and out-of-corpus scores");
  }
  const lo = oocScores.reduce((a, b) => Math.max(a, b));
  const hi = inScores.reduce((a, b) => Math.min(a, b));
  if (lo < hi) {
    // Python round() semantics, deliberately: half-to-even on the EXACT
    // binary value — round(0.0625, 3) === 0.062 where Math.round/toFixed
    // would say 0.063 (ties away from zero). A floor rounded the wrong way
    // at the boundary re-admits the probe the margin was measured against.
    let mid = pythonRound((lo + hi) / 2, 3);
    if (!(lo < mid && mid <= hi)) {
      // rounding left the interval (it is that narrow) — use hi exactly
      mid = hi;
    }
    return [
      mid,
      `separable: max OOC ${pythonFormatFixed(lo, 3)} < min in-corpus ${pythonFormatFixed(hi, 3)}; midpoint has margin both ways`,
      true,
    ];
  }
  const leak = statsAtFloor(points, hi).risk;
  return [
    hi,
    `NOT separable: max OOC ${pythonFormatFixed(lo, 3)} >= min in-corpus ${pythonFormatFixed(hi, 3)}; zero-FA floor leaks ${pythonFormatFixed(leak, 3)}`,
    false,
  ];
}

/**
 * The null-score guard of the scoring loop (calibrate.py:417-424): a null
 * means the vector arm returned NOTHING for a non-empty corpus — broken
 * scope/DSN/generation. Folding it in as a sentinel would silently collapse
 * the recommended floor (min() over scores) and disarm the gate.
 */
export function requireScore(query: string, score: number | null): number {
  if (score === null) {
    throw new Error(
      `query scored null (no vector results) — setup is broken: ${pythonStrRepr(query)}`,
    );
  }
  return score;
}

// ---------------------------------------------------------------------------
// The probes and the printed caveat (calibrate.py:91-96, 177-198, verbatim).
// ---------------------------------------------------------------------------

// Generic, corpus-independent out-of-corpus probes (the "clearly unrelated"
// cluster). An operator appends corpus-ADJACENT probes for a tighter floor —
// the testing rule that OOC probes must include scope-adjacent near-misses is
// satisfied per corpus, never here.
export const BUILT_IN_OOC = [
  "What's for dinner tonight?",
  "How do I file my taxes?",
  "Who won the football game yesterday?",
  "What's the weather this weekend?",
  "How do I unclog a kitchen sink?",
  "Best pizza place near me?",
  "How do I renew my passport?",
  "What time does the mall close?",
  "Is it going to rain in Lahore tomorrow?",
  "How do I reset my wifi router?",
  "What's a good gift for a five year old?",
  "How long do I boil an egg?",
  "Which phone should I buy this year?",
  "How do I get red wine out of a carpet?",
  "What's the capital of Australia?",
  "How much water should I drink per day?",
  "Why is my car making a clicking noise?",
  "How do I train a puppy not to bite?",
  "What movies are playing this week?",
  "How do I write a resignation letter?",
] as const;

/**
 * The synthesized door's caveat — the DEFAULT door, and the one whose bias has
 * a direction.
 *
 * Every synthesized query is generated FROM a passage and then scored against
 * the corpus containing that passage, so it shares that passage's vocabulary in
 * a way a reader's question does not. The in-corpus distribution is therefore
 * shifted UP relative to real traffic, and the separation this door measures is
 * an upper bound on the separation a record will actually see.
 *
 * Found live 2026-08-21: a real record calibrated through this door reported
 * min in-corpus 0.682 against max OOC 0.580 and recommended 0.631. Questions
 * the record demonstrably answers then scored 0.530-0.606 — every one of them
 * below the recommended floor. Pasting it would have made the record abstain on
 * questions whose answers it had just cited. Nothing in the block said the
 * measurement had an easier question set than production would.
 */
export const SYNTHESIZED_CAVEAT: string =
  "CAVEAT: synthesized queries are written FROM the passages they are then scored against, so " +
  "they share vocabulary a reader's question will not. This door measures an UPPER BOUND on " +
  "separation — treat the floor below as provisional until it has been checked against questions " +
  "the corpus did not write (--queries-file), and re-run if real questions score under it.";

/**
 * What a separability verdict is worth when the probes came from the binary.
 *
 * Every entry in BUILT_IN_OOC is far-domain — dinner, taxes, football, boiling
 * an egg. Those score low against ANY corpus, so max-OOC comes out artificially
 * low and the margin is inflated from that end, exactly as synthesized in-corpus
 * queries inflate it from the other. Measured on one record, changing ONLY the
 * probe set: built-ins reported "separable, margin 0.072" and recommended a
 * floor; eight scope-adjacent near-misses on the same corpus and the same
 * in-corpus questions reported "NOT separable, margin -0.030". The recommended
 * floor then answered six of those eight near-misses live, with citations
 * (2026-08-21).
 *
 * The tool already knows this — the not-separable branch tells the operator to
 * "widen the probe set (scope-adjacent near-misses, not only far-domain
 * questions)". It said so only AFTER weak probes had failed to bless a floor,
 * which is the one case where the advice is least needed.
 *
 * A shipped set cannot be scope-adjacent, because adjacency depends on a corpus
 * the binary has never seen. So this is stated whenever built-ins are used, on
 * BOTH branches, rather than pretending a better default exists.
 */
export const BUILT_IN_OOC_CAVEAT: string =
  "CAVEAT: the out-of-corpus probes are the BUILT-IN set, which is entirely far-domain — a " +
  "shipped set cannot be scope-adjacent, because adjacency depends on a corpus it has never " +
  "seen. Far-domain probes score low against anything, so this margin is an OVER-estimate and " +
  "a floor it blesses may still answer near-misses just outside your scope. Re-run with " +
  "--ooc-file naming questions a reader might plausibly ask that this record does NOT cover, " +
  "and trust that verdict over this one.";

export const QUERIES_FILE_CAVEAT: string =
  "CAVEAT: --queries-file floors are measured on human/gold-derived queries — section-weighted " +
  "eval targets, NOT per-node passage samples — so this floor's low tail is a different distribution " +
  "than the synthesized door's; record 'door: queries-file' beside the number and never compare the " +
  "two doors' floors as interchangeable.";

// ---------------------------------------------------------------------------
// Report assembly (the pure tail of calibrate(), calibrate.py:427-445) and
// the printed recommendation block (main(), calibrate.py:580-609).
// ---------------------------------------------------------------------------

/**
 * The report dict, assembled from every scored query. `in_corpus_queries` /
 * `ooc_probes` are the detail's class counts — identical to the oracle's
 * len(in_queries) / len(ooc_probes), since every query is scored or the run
 * dies (requireScore).
 */
/**
 * The gap between the two distributions' facing edges. Both classes are
 * guaranteed non-empty by `pasteValue`, which throws first on a one-sided
 * measurement; this is defensive only, and NaN would be a lie either way.
 */
function marginOf(points: readonly Scored[]): number {
  const inScores = points.filter((p) => p.in_corpus).map((p) => p.score);
  const oocScores = points.filter((p) => !p.in_corpus).map((p) => p.score);
  if (!inScores.length || !oocScores.length) return 0;
  return Math.min(...inScores) - Math.max(...oocScores);
}

export function buildReport(
  detail: readonly ScoredQuery[],
  meta: ReportMeta,
  targetPrecision: number = 0.95,
  /** Injected so the report is deterministic under test. */
  now: Date = new Date(),
): CalibrationReport {
  const points: Scored[] = detail.map((d) => ({ score: d.score, in_corpus: d.in_corpus }));
  const rec = recommendFloor(points, targetPrecision);
  const [paste, paste_why, separable] = pasteValue(points);
  // The weakest in-corpus queries drive the floor via min(); a ratifying
  // human must SEE them, or one atypical low scorer silently drags the
  // recommendation down. Stable ascending sort, first five — as the oracle.
  const low_tail = detail
    .filter((d) => d.in_corpus)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);
  return {
    generation: meta.generation,
    pinned: meta.pinned,
    model: meta.model, // the embedding space the floor is a threshold IN
    dim: meta.dim,
    door: meta.door,
    in_corpus_queries: detail.filter((d) => d.in_corpus).length,
    ooc_probes: detail.filter((d) => !d.in_corpus).length,
    aurc: pythonRound(aurc(points), 4),
    zero_fa: rec.zero_fa,
    target_precision: rec.target_precision,
    paste,
    paste_why,
    // Rounded like every other printed statistic; the sign survives rounding,
    // so a hair of overlap does not read as a clean zero.
    margin: pythonRound(marginOf(points), 4),
    separable,
    ooc_source: meta.oocSource,
    target: rec.target,
    // "Never copy a calibrated constant between corpora. Recalibrate; record
    // the measurement and its DATE beside the number" — the date was the half
    // the paste line never carried.
    measured_at: now.toISOString().slice(0, 10),
    low_tail,
    detail: [...detail],
  };
}

/**
 * The recommendation block printed for the human to ratify, byte-identical
 * to the oracle's stdout — ending in the exact
 * `vector_floor: X.XXX   # calibrated on generation N, model M/dN, door: D`
 * paste line (a machine-checked format; the provenance comment beside the
 * number implements "record the measurement beside the number").
 */
/**
 * The one instruction this report gives, and the block under it is a PASTE
 * TARGET rather than a quotation — so both halves have to be right.
 *
 * `vector_floor:` and `floor_digest:` are keys of the instance's `retrieval:`
 * block, and the report printed them at the top level; an adopter pasted them
 * verbatim and `ksor build` refused the file (first-hour walkthrough,
 * 2026-08-26). The block is written at COLUMN 0 for the same reason: two spaces
 * reads well in a terminal and lands inside a frontmatter as a nested mapping
 * under whatever key precedes it, which `yaml` refuses outright ("Nested
 * mappings are not allowed in compact mappings", measured). A record that
 * already declares `retrieval:` gets told to merge, because a second one is a
 * duplicate key — refused, loudly, but refused.
 */
const PASTE_INSTRUCTION =
  "paste this into instance.md's frontmatter (merge it into `retrieval:` if the file already has one):";

export function renderReport(
  report: CalibrationReport,
  /**
   * The digest of the retrieval predicate this measurement ran under
   * (`GATE_PREDICATE_DIGEST`), written beside the floor so the door can tell a
   * floor measured on ITS candidate set from one measured on another's.
   *
   * REQUIRED and not defaulted: the caller that renders for an operator must
   * name the predicate, and a default would let the one caller that matters
   * silently omit it. `null` is the oracle-parity rendering — used by the
   * fixture comparison, whose bytes come from a Python run that had no such
   * concept.
   */
  predicateDigest: string | null,
): string {
  const lines: string[] = [];
  const z = report.zero_fa;
  const how = report.pinned ? "PINNED" : "served";
  // The generation this was measured against. The oracle printed Python's
  // `None` literal when it had none and ksor replicated the bytes; that put
  // the string "None" into the provenance comment an operator pastes beside
  // the floor, which is the one place the invariant "record the measurement
  // beside the number" is implemented. Byte-fidelity to the oracle is for
  // ALGORITHMS, never for reporting (review 2026-08-20).
  const gen =
    report.generation === null ? "unknown (no generation pinned)" : String(report.generation);
  lines.push(
    `\nmeasured on generation ${gen} (${how}), model ${report.model}, door: ${report.door}`,
  );
  lines.push(report.door === "queries-file" ? QUERIES_FILE_CAVEAT : SYNTHESIZED_CAVEAT);
  if (report.ooc_source === "built-in") lines.push(BUILT_IN_OOC_CAVEAT);
  lines.push(`AURC = ${pythonFloatRepr(report.aurc)}  (lower = better separation)`);
  // The margin is the number that decides, and it was the one number the block
  // never printed: `paste_why` names both ends, leaving the subtraction to the
  // reader. The probe counts ride with it because a margin measured over six
  // probes is not the same claim as the same margin over sixty — both were on
  // the report already and neither reached the page.
  lines.push(
    `separation margin: ${pythonFormatFixed(report.margin, 3)} ` +
      `(over ${report.in_corpus_queries} in-corpus / ${report.ooc_probes} out-of-corpus probes)`,
  );
  if (z) {
    lines.push(
      `zero-FA floor (never refuse a real question): ${pythonFormatFixed(z.floor, 3)} -> coverage ${pythonFormatFixed(z.coverage, 3)}, ooc leak ${pythonFormatFixed(z.risk, 3)}`,
    );
  }
  const t = report.target_precision;
  if (t) {
    // The label states the precision this floor was actually measured at. The
    // oracle read a key its own report never carried, so the line always said
    // 0.95 whatever was measured — a report that describes a different
    // measurement than the one it performed (review 2026-08-20).
    lines.push(
      `ALT (${pythonFloatRepr(report.target)}-precision): floor = ${pythonFormatFixed(t.floor, 3)} -> coverage ${pythonFormatFixed(t.coverage, 3)}`,
    );
  }
  lines.push("weakest in-corpus queries (these set the floor):");
  for (const d of report.low_tail) {
    lines.push(`  ${pythonFormatFixed(d.score, 3)}  ${d.query}`);
  }
  lines.push(`\n${report.paste_why}`);
  if (!report.separable) {
    // NO paste-ready number. The measurement just said this corpus does not
    // separate in-corpus from out-of-corpus at the floor it found — handing
    // over a value anyway is handing over a floor known to leak, and the
    // intended operator is a coding agent that will paste it (review
    // 2026-08-20). `uncalibrated` is representable and REFUSES every serve,
    // which is the honest state until the measurement succeeds.
    lines.push(
      "NOT pasting a floor: this measurement did not separate, so any number here " +
        "would be one that is known to leak.\n" +
        "Widen the probe set (scope-adjacent near-misses, not only far-domain " +
        "questions), add in-corpus questions, and re-run. Until then, put the record in " +
        "the fail-closed state — " +
        PASTE_INSTRUCTION +
        "\nretrieval:\n  vector_floor: uncalibrated",
    );
    return lines.join("\n") + "\n";
  }
  lines.push(
    `${PASTE_INSTRUCTION[0]!.toUpperCase()}${PASTE_INSTRUCTION.slice(1)}\nretrieval:\n` +
      `  vector_floor: ${pythonFormatFixed(report.paste, 3)}   # calibrated ${report.measured_at} on generation ${gen}, model ${report.model}/d${report.dim}, door: ${report.door}` +
      (predicateDigest === null ? "" : `\n  floor_digest: ${predicateDigest}`),
  );
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Python-fidelity numeric helpers. CPython rounds and formats floats on the
// EXACT binary value with ties-to-even (David Gay's dtoa); JS Math.round and
// Number.prototype.toFixed round ties away from zero. The paste value and
// every printed number must match the oracle bit for bit, so the decimal
// expansion is computed exactly with BigInt and rounded half-to-even here.
// Measured divergence that forced this: round(0.0625, 3) → Python 0.062,
// naive JS 0.063 (fixtures pin both directions of the tie).
// ---------------------------------------------------------------------------

interface ExactDecimal {
  readonly neg: boolean;
  /** All decimal digits of the exact value, no sign, no point. */
  readonly digits: string;
  /** value = digits × 10^(pointPos − digits.length); may be ≤ 0 or > length. */
  readonly pointPos: number;
}

/** Exact decimal expansion of a finite non-zero double (m × 2^e, expanded via 5^k). */
function exactDecimal(x: number): ExactDecimal {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0);
  const lo = dv.getUint32(4);
  const neg = hi >>> 31 === 1;
  const biased = (hi >>> 20) & 0x7ff;
  let mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exp2: number;
  if (biased === 0) {
    exp2 = -1074; // subnormal
  } else {
    mantissa |= 1n << 52n;
    exp2 = biased - 1075;
  }
  if (exp2 >= 0) {
    const digits = (mantissa << BigInt(exp2)).toString();
    return { neg, digits, pointPos: digits.length };
  }
  const k = -exp2;
  const digits = (mantissa * 5n ** BigInt(k)).toString();
  return { neg, digits, pointPos: digits.length - k };
}

/** |value| × 10^ndigits as an integer, rounded half-to-even on the exact digits. */
function roundedScaled(dec: ExactDecimal, ndigits: number): bigint {
  const { digits, pointPos } = dec;
  const keep = pointPos + ndigits;
  if (keep >= digits.length) {
    return BigInt(digits) * 10n ** BigInt(keep - digits.length); // already exact
  }
  let kept = keep <= 0 ? 0n : BigInt(digits.slice(0, keep));
  const first = keep < 0 ? "0" : digits[keep]!;
  const rest = keep < 0 ? digits : digits.slice(keep + 1);
  const cmp = first > "5" ? 1 : first < "5" ? -1 : /[1-9]/.test(rest) ? 1 : 0;
  if (cmp > 0 || (cmp === 0 && kept % 2n === 1n)) {
    kept += 1n;
  }
  return kept;
}

/**
 * Python's round(x, ndigits): the exact decimal digits of the double,
 * rounded half-to-even at ndigits, re-parsed to the nearest double
 * (CPython: _Py_dg_dtoa mode 3 + strtod). round(0.0625, 3) === 0.062 and
 * round(0.4375, 3) === 0.438 — one tie each way.
 */
export function pythonRound(x: number, ndigits: number): number {
  if (!Number.isFinite(x) || x === 0) {
    return x;
  }
  const dec = exactDecimal(x);
  if (dec.pointPos + ndigits >= dec.digits.length) {
    return x; // the value already has ≤ ndigits decimals: unchanged, exactly
  }
  const value = Number(`${roundedScaled(dec, ndigits)}e${-ndigits}`);
  return dec.neg ? -value : value;
}

/**
 * Python's f"{x:.3f}"-style fixed formatting: correctly rounded
 * half-to-even on the exact value. (0.0625).toFixed(3) is "0.063" in JS;
 * Python prints "0.062".
 */
export function pythonFormatFixed(x: number, digits: number): string {
  const neg = x < 0 || Object.is(x, -0);
  const scaled = x === 0 ? 0n : roundedScaled(exactDecimal(x), digits);
  const s = scaled.toString().padStart(digits + 1, "0");
  return `${neg ? "-" : ""}${s.slice(0, s.length - digits)}.${s.slice(s.length - digits)}`;
}

/**
 * Python's repr() of a float, for the report's plain `{aurc}` interpolation.
 * Both languages choose the same shortest round-tripping digits; they differ
 * on integral values (Python "0.0", JS "0") and on the exponent-notation
 * switchover (Python below 1e-4 and at 1e16; JS below 1e-6 and at 1e21).
 */
export function pythonFloatRepr(x: number): string {
  if (x === 0) {
    return Object.is(x, -0) ? "-0.0" : "0.0";
  }
  const abs = String(Math.abs(x));
  const sign = x < 0 ? "-" : "";
  // Shortest digits + decimal exponent of the leading digit, from JS's repr.
  let digits: string;
  let decExp: number;
  const e = abs.indexOf("e");
  if (e >= 0) {
    const mantissa = abs.slice(0, e);
    digits = mantissa.replace(".", "");
    decExp = Number(abs.slice(e + 1));
  } else {
    const dot = abs.indexOf(".");
    if (dot < 0) {
      digits = abs;
      decExp = abs.length - 1;
    } else {
      const int = abs.slice(0, dot);
      const frac = abs.slice(dot + 1);
      if (int === "0") {
        const lead = frac.search(/[1-9]/);
        digits = frac.slice(lead);
        decExp = -lead - 1;
      } else {
        digits = int + frac;
        decExp = int.length - 1;
      }
    }
  }
  if (decExp < -4 || decExp >= 16) {
    const trimmed = digits.replace(/0+$/, "") || "0";
    const mant = trimmed.length > 1 ? `${trimmed[0]}.${trimmed.slice(1)}` : trimmed;
    const es = decExp < 0 ? "-" : "+";
    return `${sign}${mant}e${es}${String(Math.abs(decExp)).padStart(2, "0")}`;
  }
  if (decExp >= 0) {
    const int = digits.padEnd(decExp + 1, "0");
    const frac = digits.slice(decExp + 1) || "0";
    return `${sign}${int.slice(0, decExp + 1)}.${frac}`;
  }
  return `${sign}0.${"0".repeat(-decExp - 1)}${digits}`;
}

/**
 * Python's repr() of a str, for the oracle's `{query!r}` interpolation:
 * single quotes unless the string contains a single quote and no double
 * quote; backslash, the quote character, and \n \r \t escaped. Printable
 * scope — calibration queries are plain text.
 */
function pythonStrRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    if (ch === "\\" || ch === quote) {
      out += `\\${ch}`;
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "\t") {
      out += "\\t";
    } else {
      out += ch;
    }
  }
  return out + quote;
}
