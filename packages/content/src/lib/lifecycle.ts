/**
 * The lifecycle seam — the MACHINE column of record spec §2.5, in SQL.
 *
 * A concept reaches a machine surface (`llms.txt`, the twins, `/md/`,
 * `server.json`, bundles and the door) only while it is `stable`, effective
 * and unexpired. A draft never does; a deprecated one never does; one before
 * its `effective_from` or past its `stale_after` does not either — those two
 * are the states a human page still shows, with a badge.
 *
 * `lib/lifecycle-rule.ts` is the same rule in TypeScript for the site, and
 * `LIFECYCLE_CASES` is the decision table both are asserted against — the
 * decision-18 arrangement, applied to the second guarantee two surfaces must
 * both honour.
 *
 * The instant is an EXPRESSION, not a hard-coded `now()`: static output is
 * judged at the build's `as_of` and the door at request time, the two can
 * disagree across a boundary (a disclosed row in the table), and with `now()`
 * spliced in there is no instant a test could name to assert the two equality
 * rows at all. Serving passes nothing and gets `now()`.
 */

/** The predicate for a node aliased `alias`, evaluated at `at`. */
export function lifecycleAdmits(alias: string, at = "now()"): string {
  return `(
    ${alias}.doc_status = 'stable'
    AND (${alias}.effective_from IS NULL OR ${alias}.effective_from <= ${at})
    AND (${alias}.stale_after IS NULL OR ${alias}.stale_after > ${at})
)`;
}

/** The predicate for the usual `n` alias, at request time. */
export const LIFECYCLE_ADMITS: string = lifecycleAdmits("n");
