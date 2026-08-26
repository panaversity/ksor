/**
 * The decision table for the trust tier (record spec §2.3), one row per rule
 * and one per way the rule has been got wrong.
 *
 * This is decision 18's shape: the tier has TWO implementations — the kernel
 * derives it in `record/profile.ts`'s `toConcept`, the site derives it again in
 * `system/site/lib/governance.ts`'s `trustTierOf` — and the site cannot import
 * the kernel, whose package carries pg and the embedding providers. They agreed
 * when this table was written and nothing asserted that they did.
 *
 * The tier is not cosmetic on either side. It is stamped into every `/md/`
 * twin and into `llms-full.txt`, and it is stored as `content_nodes.trust_tier`
 * where the SQL serving floor (`min_trust_tier`) compares against it — so the
 * two surfaces disagreeing means the website vouching for a document to a
 * different standard than the door applies to it.
 *
 * Rows are the RULE, so both halves are asserted against these and not against
 * hand-written expectations that can drift row by row:
 * `record/profile.test.ts` runs the kernel's, `packages/ksor/src/
 * site-governance.test.ts` runs the site's.
 */

/** A verification act, in the shape both implementations accept. */
export interface TrustAct {
  readonly by: string;
  readonly at: string;
}

export interface TrustCase {
  readonly name: string;
  readonly verified: readonly TrustAct[];
  readonly tier: "unverified" | "machine-confirmed" | "human-reviewed";
}

const AT = "2026-08-20T00:00:00Z";

export const TRUST_CASES: readonly TrustCase[] = [
  { name: "nobody has said anything", verified: [], tier: "unverified" },
  {
    name: "a process only",
    verified: [{ by: "process:nightly", at: AT }],
    tier: "machine-confirmed",
  },
  {
    name: "a tool only — a producer/version actor is a machine, not a person",
    verified: [{ by: "claude-code/1.0", at: AT }],
    tier: "machine-confirmed",
  },
  { name: "a human", verified: [{ by: "human:kim", at: AT }], tier: "human-reviewed" },
  {
    name: "a human anywhere in the list outranks any number of machines",
    verified: [
      { by: "process:nightly", at: AT },
      { by: "human:kim", at: AT },
    ],
    tier: "human-reviewed",
  },
  {
    name: "and the human need not be last",
    verified: [
      { by: "human:kim", at: AT },
      { by: "process:nightly", at: AT },
    ],
    tier: "human-reviewed",
  },
  {
    // `startsWith("human:")` is the rule on both sides, so an actor whose
    // PRODUCER merely contains the word is a machine. Written down because a
    // prefix test is the kind of thing a reimplementation turns into a
    // substring test, and nothing about the output would look wrong. Note
    // `not-human:kim` is NOT a row here: it matches no actor form at all, so
    // the schema refuses it before any tier is derived.
    name: "a producer that merely contains `human` is still a machine",
    verified: [{ by: "human-review-bot/2.1", at: AT }],
    tier: "machine-confirmed",
  },
];
