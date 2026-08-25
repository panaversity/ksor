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
  "ksor-one-line-form",
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
  "ksor-instant-form",
  "ksor-footnote-unkeyed",
  "ksor-reserved-name",
  "ksor-index-stale",
  "ksor-attachment-frontmatter",
  "ksor-attachment-orphan",
  "ksor-attachment-of-index",
  "ksor-link-widens",
  "ksor-supersession-strands",
  "ksor-takedown-unauthorised",
  "ksor-takedown-dangling",
  "ksor-takedown-readded",
  "ksor-ledger-shrank",
  "ksor-ledger-amended",
  "ksor-ledger-invalid",
  "ksor-ledger-empty",
  "ksor-policy-missing",
  "ksor-policy-invalid",
  "ksor-legacy-key",
  "ksor-ksor-key-unknown",
  "ksor-key-near-miss",
  "ksor-key-misplaced",
  "ksor-derived-key",
  "ksor-instance-format",
  "ksor-migrate-underivable",
  // Hygiene (record spec §6, ported from the scaffold's hand-written checker).
  "ksor-record-empty",
  "ksor-symlink",
  "ksor-name-unportable",
  "ksor-name-collides",
  "ksor-file-type",
  "ksor-asset-corrupt",
  "ksor-attachment-near-miss",
  "ksor-link-dead",
  "ksor-link-escapes",
  // The project around the record (`pnpm check` only).
  "ksor-pointer-changed",
  "ksor-skill-copy-diverged",
  "ksor-site-holds-content",
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

/**
 * The line format the scaffold's checker has always printed — where, what,
 * why, fix — kept byte-stable because adopters' CI logs and skills read it.
 * `problem:` carries the slug so a reader can grep for the rule.
 */
export function formatRefusal(r: Refusal): string {
  // A remedy is OBEYED, not read — the scaffold's own skill tells the adopter to
  // "obey the printed fix literally", so a `fix:` line is a paste target. A
  // remedy that needs more than one line therefore has to ARRIVE as more than
  // one line: two of them printed the characters `\` and `n` where they meant a
  // break, and obeying either wrote a one-line file that the same rule refused
  // again with the same remedy — a loop whose only advice was the thing that
  // made it (first-hour walkthrough, 2026-08-26).
  //
  // Continuations are indented under the value column so the paste is
  // unambiguous about where the remedy starts and stops. A single-line remedy
  // is byte-identical to what it was, because adopters' CI logs read this shape.
  const fix = r.fix.split("\n").join(`\n${" ".repeat("    fix: ".length)}`);
  return `${r.path}\n    problem: ${r.slug}\n    why: ${r.why}\n    fix: ${fix}`;
}
