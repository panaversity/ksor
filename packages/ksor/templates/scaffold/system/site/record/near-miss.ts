/**
 * "Did you mean" for a closed key set — ONE implementation.
 *
 * Two closed key sets refuse an unknown key and offer the nearest allowed one:
 * the concept's profile keys and the Governance Policy's. Each carried its own
 * byte-identical Levenshtein loop, in sibling modules of one directory, so
 * tuning one (a different cap, transpositions) would have moved one refusal
 * family and not the other with nothing red.
 */

/** Edit distance. Only a NEAR miss earns a refusal, so a genuine extension key is kept. */
export function distance(a: string, b: string): number {
  let previous = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[b.length] ?? 0;
}

/** The allowed key nearest to `key`, within `max` edits; null when none is close. */
export function nearest(key: string, allowed: readonly string[], max: number): string | null {
  let best: readonly [string, number] | null = null;
  for (const candidate of allowed) {
    if (candidate === key) return null;
    const d = distance(candidate, key);
    if (d <= max && (best === null || d < best[1])) best = [candidate, d];
  }
  return best === null ? null : best[0];
}
