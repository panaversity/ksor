/**
 * The shape every rule in the record module speaks: what is wrong, where, why
 * the rule exists, and how to fix it — product principle 4 ("errors are
 * documentation"). `slug` is the stable machine-readable name the CLI prints
 * on its first stderr line; the set is enumerated in record spec §6.
 */
export interface Refusal {
  readonly slug: string;
  /** Record-relative path (`knowledge/x.md`, `.ksor/governance.yaml`, `instance.md`). */
  readonly path: string;
  readonly why: string;
  readonly fix: string;
}

/** Sorted by path, then slug, then why — so two runs print one order. */
export function sortRefusals(refusals: readonly Refusal[]): Refusal[] {
  return [...refusals].sort(
    (a, b) => compare(a.path, b.path) || compare(a.slug, b.slug) || compare(a.why, b.why),
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
