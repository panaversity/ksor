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
export function pasteValue(points: readonly Scored[]): [paste: number, why: string] {
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
    ];
  }
  const leak = statsAtFloor(points, hi).risk;
  return [
    hi,
    `NOT separable: max OOC ${pythonFormatFixed(lo, 3)} >= min in-corpus ${pythonFormatFixed(hi, 3)}; zero-FA floor leaks ${pythonFormatFixed(leak, 3)}`,
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
export function buildReport(
  detail: readonly ScoredQuery[],
  meta: ReportMeta,
  targetPrecision: number = 0.95,
): CalibrationReport {
  const points: Scored[] = detail.map((d) => ({ score: d.score, in_corpus: d.in_corpus }));
  const rec = recommendFloor(points, targetPrecision);
  const [paste, paste_why] = pasteValue(points);
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
export function renderReport(report: CalibrationReport): string {
  const lines: string[] = [];
  const z = report.zero_fa;
  const how = report.pinned ? "PINNED" : "served";
  // A missing generation prints as Python's None literal — the oracle's
  // bytes, kept identical because the paste line is machine-checked.
  const gen = report.generation === null ? "None" : String(report.generation);
  lines.push(
    `\nmeasured on generation ${gen} (${how}), model ${report.model}, door: ${report.door}`,
  );
  if (report.door === "queries-file") {
    lines.push(QUERIES_FILE_CAVEAT);
  }
  lines.push(`AURC = ${pythonFloatRepr(report.aurc)}  (lower = better separation)`);
  if (z) {
    lines.push(
      `zero-FA floor (never refuse a real question): ${pythonFormatFixed(z.floor, 3)} -> coverage ${pythonFormatFixed(z.coverage, 3)}, ooc leak ${pythonFormatFixed(z.risk, 3)}`,
    );
  }
  const t = report.target_precision;
  if (t) {
    // The oracle prints report.get("target", 0.95); the report dict never
    // carries "target" (calibrate() does not record it), so the label always
    // reads 0.95 whatever target was measured. Replicated as-is.
    lines.push(
      `ALT (${pythonFloatRepr(0.95)}-precision): floor = ${pythonFormatFixed(t.floor, 3)} -> coverage ${pythonFormatFixed(t.coverage, 3)}`,
    );
  }
  lines.push("weakest in-corpus queries (these set the floor):");
  for (const d of report.low_tail) {
    lines.push(`  ${pythonFormatFixed(d.score, 3)}  ${d.query}`);
  }
  lines.push(`\n${report.paste_why}`);
  lines.push(
    `Paste into instance.md:\n  vector_floor: ${pythonFormatFixed(report.paste, 3)}   # calibrated on generation ${gen}, model ${report.model}/d${report.dim}, door: ${report.door}`,
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
