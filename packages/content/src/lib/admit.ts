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
 * and DENIAL (`lib/takedown.ts`) binds here as well as on the row being served.
 * It is not a property of the document — it is a governance act against an
 * identity — but the section branch has to see it, because a section is
 * admitted through its descendants and a node-scoped denial of a document never
 * denies its parent. Without it a section whose every descendant was withdrawn
 * stayed in the door's `outline` with `child_count: 0` while the site's staging
 * pruned the directory completely: decision 19's forbidden state, and — since a
 * section with no documents is never admitted at all — a zero that told an
 * agent something had been withdrawn from a container it could name.
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
 * The CTE named `name`, over the generation CTE named `gen` and the denied set
 * named `denied` — which must be declared before it and walk the SAME
 * generation, or its node_ids name rows this set never sees.
 *
 * Parameterised because the read path needs TWO of each: content is served
 * from the pinned generation while governance is decided on the LIVE one
 * (issue #87 — a pin must not freeze a withdrawal), so `read.ts` binds
 * `admitted_live` over `live` and `denied_live` beside the ordinary pair.
 */
export function admittedCte(name: string, gen: string, denied = "denied"): string {
  return `
${name} AS (
    SELECT n.node_id, n.parent_id
    FROM content_nodes n
    JOIN ${gen} ON n.generation = ${gen}.gen
    WHERE n.tenant_id = $1 AND n.status = 'published' AND n.kind <> 'section'
      AND n.node_id NOT IN (SELECT node_id FROM ${denied})
      AND ${AUDIENCE_ALLOWED} AND ${LIFECYCLE_ADMITS} AND ${TRUST_ADMITS}
  UNION
    SELECT p.node_id, p.parent_id
    FROM content_nodes p
    JOIN ${gen} ON p.generation = ${gen}.gen
    JOIN ${name} a ON a.parent_id = p.node_id
    WHERE p.tenant_id = $1 AND p.status = 'published' AND p.kind = 'section'
      AND p.node_id NOT IN (SELECT node_id FROM ${denied})
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
