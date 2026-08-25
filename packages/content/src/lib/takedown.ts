/**
 * The takedown deny seam — one definition shared by every statement that
 * serves content (search, read, outline, calibration). Denial is SCOPED
 * (decision 14):
 *
 * - `node` (default): exactly the listed stable_id is denied. Identity — the
 *   thing stays down wherever it is filed and in whatever generation; immune
 *   to reorganization; the denied set is a frozen, auditable list.
 * - `subtree`: the listed node AND every descendant are denied, resolved HERE
 *   at serving time by a recursive `parent_id` walk — NOT a stable_id prefix
 *   match (a frontmatter `sor_id` override decouples stable_id from the path,
 *   so a prefix leaks), and NOT a write-time expansion (the denylist has no
 *   generation column by design, so a descendant added by a FUTURE re-ingest
 *   must be covered too).
 *
 * A row is IN FORCE while `revoked_at IS NULL` (schema 2.5, record spec §5).
 * The row is the state and `.ksor/takedowns.yaml` is the history, so a
 * revocation marks the row rather than deleting it — and both EXISTS clauses
 * below must read the mark, the membership one and the cascade one, because
 * they drift independently.
 *
 * A statement composes {@link DENIED_CTE} into its `WITH RECURSIVE` and
 * {@link DENY} into its `WHERE`. Requirements on the host statement: it defines
 * the `g` generation CTE and binds $1 = tenant_id, $2 = corpus_id. The CTE
 * seeds from directly-listed nodes and cascades only through the children of
 * `subtree`-scoped roots, so an empty denylist yields an empty seed and the
 * recursion terminates at once — the ungoverned hot path pays nothing.
 */

/**
 * The CTE named `name`, over the generation CTE named `gen` — every node_id
 * that must not be served: directly-listed nodes (any scope), plus every
 * descendant of a `subtree`-scoped node. Must appear in a `WITH RECURSIVE`,
 * after `gen`.
 *
 * Parameterised on both for the reason `admittedCte` is: the read path decides
 * governance on the LIVE generation while serving content from a pinned one,
 * and a denied set is node_ids, which are per-generation. A denial itself is
 * not — `takedown_denylist` matches on `stable_id` and has no generation column
 * by design — so the two sets name the same withdrawals through different rows.
 */
export function deniedCte(name: string, gen: string): string {
  return `
${name} AS (
    SELECT n.node_id,
           EXISTS (SELECT 1 FROM takedown_denylist s
                    WHERE s.tenant_id = n.tenant_id AND s.corpus_id = $2
                      AND s.stable_id = n.stable_id AND s.scope = 'subtree'
                      AND s.revoked_at IS NULL) AS cascade
    FROM content_nodes n
    JOIN ${gen} ON n.generation = ${gen}.gen
    WHERE n.tenant_id = $1
      AND EXISTS (SELECT 1 FROM takedown_denylist d
                   WHERE d.tenant_id = n.tenant_id AND d.corpus_id = $2
                     AND d.stable_id = n.stable_id
                     AND d.revoked_at IS NULL)
  UNION
    SELECT c.node_id, TRUE
    FROM content_nodes c
    JOIN ${gen} ON c.generation = ${gen}.gen
    JOIN ${name} p ON c.parent_id = p.node_id
    WHERE c.tenant_id = $1 AND p.cascade
)`;
}

/** The set every serving statement binds, over the generation CTE `g`. */
export const DENIED_CTE: string = deniedCte("denied", "g");

/**
 * The deny predicate for a node aliased `n`. node_id is NOT NULL (a PK), so
 * `NOT IN` is safe (no NULL-swallow). For a different alias, spell it inline
 * against the same set: `<alias>.node_id NOT IN (SELECT node_id FROM denied)`.
 */
export const DENY = `n.node_id NOT IN (SELECT node_id FROM denied)`;
