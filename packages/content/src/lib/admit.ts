/**
 * ADMISSION — the one set every serving statement joins against: which nodes
 * this viewer, at this instant, above this trust floor, may be answered from.
 *
 * Three predicates compose here rather than at five call sites:
 *
 *   `lib/audience.ts`   the overlap rule (record spec §2.4)
 *   `lib/lifecycle.ts`  the machine column of the §2.5 table
 *   `lib/trust.ts`      the floor under `verified` (§2.3)
 *
 * and denial stays separate (`lib/takedown.ts`), because it is a governance
 * act against an identity rather than a property of the document.
 *
 * It is a SET and not a row predicate because of the SECTION branch. A section
 * has no body and declares no governance of its own (record spec §1), so there
 * is nothing on its row to judge: it is admitted iff a descendant is visible,
 * resolved here by a recursive `parent_id` walk — the shape `takedown.ts` uses
 * for a subtree denial, for the same reason (a `stable_id` prefix is not the
 * tree). Ingest's union-of-descendants `audience` answered that for audience
 * and could never answer it for the rest: a section whose every document is a
 * draft, past its review date, or below the floor would still carry their
 * audience lists, and would have gone on advertising an empty shelf.
 *
 * A statement composes {@link ADMITTED_CTE} into its `WITH RECURSIVE` (after
 * the generation CTE it names) and {@link ADMITTED} into its `WHERE`.
 * Requirements on the host statement: $1 = tenant_id, and a generation CTE
 * exposing `gen`.
 */

import { AUDIENCE_ALLOWED } from "./audience.js";
import { LIFECYCLE_ADMITS } from "./lifecycle.js";
import { TRUST_ADMITS } from "./trust.js";

/**
 * The CTE named `name`, over the generation CTE named `gen`.
 *
 * Parameterised on both because the read path needs TWO: content is served
 * from the pinned generation while governance is decided on the LIVE one
 * (issue #87 — a pin must not freeze a withdrawal), so `read.ts` binds
 * `admitted_live` over `live` beside the ordinary one.
 */
export function admittedCte(name: string, gen: string): string {
  return `
${name} AS (
    SELECT n.node_id, n.parent_id
    FROM content_nodes n
    JOIN ${gen} ON n.generation = ${gen}.gen
    WHERE n.tenant_id = $1 AND n.status = 'published' AND n.kind <> 'section'
      AND ${AUDIENCE_ALLOWED} AND ${LIFECYCLE_ADMITS} AND ${TRUST_ADMITS}
  UNION
    SELECT p.node_id, p.parent_id
    FROM content_nodes p
    JOIN ${gen} ON p.generation = ${gen}.gen
    JOIN ${name} a ON a.parent_id = p.node_id
    WHERE p.tenant_id = $1 AND p.status = 'published' AND p.kind = 'section'
)`;
}

/** The membership predicate for a node aliased `alias`, against the set `name`. */
export function admitted(alias: string, name = "admitted"): string {
  return `${alias}.node_id IN (SELECT node_id FROM ${name})`;
}

/** The set every serving statement binds, over the generation CTE `g`. */
export const ADMITTED_CTE: string = admittedCte("admitted", "g");

/** The predicate for the usual `n` alias. */
export const ADMITTED: string = admitted("n");
