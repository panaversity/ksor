/**
 * The abstention gates (oracle SC/lib/abstain.py, exact). "Not in this
 * corpus" is a correct answer, never an error, never a licence to fall back
 * on model knowledge.
 *
 * Floors come from the instance frontmatter, never module globals, and are
 * calibrated per corpus per embedding space — never copy a calibrated
 * constant between corpora.
 */

export interface AbstainConfig {
  /**
   * A calibrated number gates (abstain below it); `null` = no gate declared,
   * honest absence surfaced on /health; `"uncalibrated"` = a floor was
   * DECLARED but not measured, which REFUSES every serve until it is pasted
   * (the "fail closed once a floor is declared" invariant, representable).
   */
  readonly vectorFloor: number | null | "uncalibrated";
  /**
   * Degraded-path ts_rank_cd floor; null = abstain only on zero matches.
   * Recorded negative result (oracle, measured on 416 in-corpus gold + 38
   * OOC probes): ts_rank_cd does NOT separate in/out-of-corpus — every
   * leak-stopping floor false-abstained 67–98% (0.1333 → FA 255/379;
   * 0.7 → FA 355/379). The shipped instance keeps keyword_floor null;
   * never set one by intuition, recalibrate per corpus.
   */
  readonly keywordFloor: number | null;
  /**
   * The digest of the retrieval predicate {@link vectorFloor} was MEASURED
   * under (`GATE_PREDICATE_DIGEST`), or null on a record that declares none.
   *
   * A number alone cannot say which candidate set it separated, so a floor
   * carried across a predicate change reads as calibrated while gating a set
   * it was never measured on. The door compares this at boot and refuses on a
   * mismatch — the declared-but-uncalibrated state, not `gate: off`.
   */
  readonly floorDigest: string | null;
}

/**
 * The signal is the top-1 cosine similarity from the SAME HNSW walk that
 * ranked the hits (a separate top-1 query was measured redundant,
 * 2026-07-16). Strictly-less-than the floor abstains; null (no vector
 * candidate at all) abstains when calibrated.
 */
export function vectorAbstains(topCosine: number | null, config: AbstainConfig): boolean {
  if (config.vectorFloor === null) return false;
  if (config.vectorFloor === "uncalibrated") return true; // defensive; search refuses first
  return topCosine === null || topCosine < config.vectorFloor;
}

export function keywordAbstains(topRank: number | null, config: AbstainConfig): boolean {
  if (config.keywordFloor === null) return topRank === null;
  return topRank === null || topRank < config.keywordFloor;
}
