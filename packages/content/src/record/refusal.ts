/**
 * The shape every rule in the record module speaks: what is wrong, where, why
 * the rule exists, and how to fix it — product principle 4 ("errors are
 * documentation"). `slug` is the stable machine-readable name the CLI prints
 * on its first stderr line; the set is enumerated in record spec §6 and
 * `refusal-slugs.integration.test.ts` fails when the two lists differ.
 */
export const REFUSAL_SLUGS = [
  "ksor-frontmatter-invalid",
  "ksor-missing-key",
  "ksor-status-unknown",
  "ksor-audience-missing",
  "ksor-audience-unregistered",
  "ksor-stable-ungenerated",
  "ksor-stable-unapproved",
  "ksor-approver-unauthorised",
  "ksor-generated-after-approval",
  "ksor-deprecated-unattributed",
  "ksor-deprecator-unauthorised",
  "ksor-reserved-type-unsourced",
  "ksor-reserved-type-unowned",
  "ksor-source-unresourced",
  "ksor-actor-form",
  "ksor-footnote-unkeyed",
  "ksor-reserved-name",
  "ksor-index-stale",
  "ksor-attachment-frontmatter",
  "ksor-attachment-orphan",
  "ksor-link-widens",
  "ksor-supersession-strands",
  "ksor-takedown-unauthorised",
  "ksor-takedown-dangling",
  "ksor-takedown-readded",
  "ksor-ledger-shrank",
  "ksor-ledger-invalid",
  "ksor-policy-missing",
  "ksor-policy-invalid",
  "ksor-legacy-key",
  "ksor-instance-format",
  "ksor-migrate-underivable",
] as const;

export type RefusalSlug = (typeof REFUSAL_SLUGS)[number];

export interface Refusal {
  readonly slug: RefusalSlug;
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
