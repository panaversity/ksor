/**
 * The read path — slug resolution, document chunks, unit tree, outline
 * (oracle SC/lib/read.py; v2 semantics: generation pinning, `slug_aliases`
 * flattening on read, and the takedown predicate — outline and direct slug
 * resolution are ARMS in the generations inventory).
 *
 * Resolution carries the legacy contract: a document address is a bare slug
 * or a '/'-path; candidates match on the LEAF slug; an ambiguous leaf fails
 * LOUDLY naming each candidate's path-qualified address; every read keys on
 * node_id (duplicate slugs are routine in a deep tree).
 *
 * Every op takes an already-scoped client (runRead binds tenant GUC + role);
 * this module owns no pools and no tenancy.
 */

import type pg from "pg";

import { admitted, ADMITTED, ADMITTED_CTE, admittedCte } from "./admit.js";
import {
  GOVERNANCE_COLUMN_COUNT,
  governanceColumns,
  governanceFromRow,
  type NodeGovernance,
} from "./search.js";
import { DENIED_CTE, deniedCte, DENY } from "./takedown.js";
import { type DocumentChunk } from "./windowing.js";

const GEN = `
g AS (
    SELECT COALESCE(
        $3::bigint,
        (SELECT active_generation FROM corpora
          WHERE tenant_id = $1 AND corpus_id = $2)
    ) AS gen
),
-- The generation the record is on RIGHT NOW, which decides governance even when
-- content is served from a pinned one.
--
-- A snapshot pin exists so a citation keeps resolving to the same bytes. It used
-- to decide the audience question too, by evaluating visibility on the pinned
-- row — so a document restricted after the token was issued kept reading in full
-- for the token's life, while outline, search and an unpinned read all
-- refused it in the same second. servableGenerations could not catch it: a
-- flip sets rollback_generation to the generation just superseded, so a pre-flip
-- pin IS the rollback pointer and is servable by design (issue #87).
--
-- Pins yield. A citation may stop resolving within the token's life, which is
-- what "the record changed" should look like — the alternative is a window in
-- which a withdrawal is not a withdrawal, and decision 19 says a surface that
-- refuses must refuse everywhere, which includes its own fourth route.
--
-- When nothing is pinned this is the SAME generation as g, so the join is an
-- identity and no unpinned read changes behaviour.
live AS (
    SELECT active_generation AS gen FROM corpora
     WHERE tenant_id = $1 AND corpus_id = $2
)`;

// Takedown denial is SCOPED (decision 14): per-node by default, whole subtree
// when a row says so — the shared `denied` set from takedown.js, bound on every
// resolution + outline arm (search.ts and calibrate/run.ts bind the same seam).

/**
 * Admission (`lib/admit.ts`) decided on the LIVE generation, not the pinned
 * one — the same reasoning as the `now` join above and for the same three
 * guarantees now instead of one: a pin exists so a citation keeps resolving to
 * the same bytes, never so a document that has since been restricted,
 * deprecated, expired or de-verified goes on reading in full for the token's
 * life. Outline judges on the generation it walks, which is the generation its
 * rows describe.
 */
const DENIED_LIVE_CTE = deniedCte("denied_live", "live");
const ADMITTED_LIVE_CTE = `${DENIED_LIVE_CTE},
${admittedCte("admitted_live", "live", "denied_live")}`;
const ADMITTED_LIVE = admitted("now", "admitted_live");

/**
 * The governance a read carries out, taken from the LIVE row (`now`) and never
 * from the pinned one — the same reasoning as the admission above. A pin exists
 * so a citation keeps resolving to the same bytes; it must not also freeze the
 * record's position ON those bytes, or a document de-verified this morning
 * would go on reading as human-reviewed for the token's life.
 */
const GOVERNANCE = governanceColumns("now");

/** Candidates by LEAF slug ($4), each with its full root path (for suffix disambiguation). */
export const NODE_BY_SLUG_SQL: string = `
WITH RECURSIVE ${GEN},
${DENIED_CTE},
${ADMITTED_LIVE_CTE},
-- The walk exists to BUILD PATHS, so it does not gate by audience; the
-- RESOLVED node does, below. Gating every ancestor made an internal parent
-- prune its public children, so a document that search had just returned --
-- and told the agent to read -- came back "no document with slug": citable and
-- unreachable at once. Visibility is a property of a DOCUMENT, not of its
-- container; the site stages per file, AUDIENCE_CASES is per document, and
-- NODE_BY_STABLE_ID_SQL below already resolved this way (round-9 review of
-- PR 43).
tree AS (
    SELECT n.node_id, n.parent_id, n.slug, n.title, n.stable_id, n.generation, n.permalink,
           n.slug::text AS path
    FROM content_nodes n JOIN g ON n.generation = g.gen
    WHERE n.tenant_id = $1 AND n.parent_id IS NULL AND n.status = 'published'
  UNION ALL
    SELECT n.node_id, n.parent_id, n.slug, n.title, n.stable_id, n.generation, n.permalink,
           t.path || '/' || n.slug
    FROM content_nodes n
    JOIN tree t ON n.parent_id = t.node_id
    WHERE n.tenant_id = $1 AND n.generation = t.generation AND n.status = 'published'
)
SELECT n.node_id, n.slug, n.title, n.stable_id, n.path, n.generation, n.permalink,
       ${GOVERNANCE}
FROM tree n
JOIN content_nodes self ON self.node_id = n.node_id AND self.tenant_id = $1
                       AND self.generation = n.generation
-- INNER join, so a document the record no longer contains cannot be
-- resurrected by a pin either: no live row, no read.
JOIN live ON TRUE
JOIN content_nodes now ON now.tenant_id = $1 AND now.generation = live.gen
                      AND now.stable_id = self.stable_id
WHERE n.slug = $4 AND ${DENY} AND ${ADMITTED_LIVE}
ORDER BY n.path`;

export const ALIAS_SQL: string = `
WITH ${GEN}
SELECT a.canonical_slug FROM slug_aliases a JOIN g ON a.generation = g.gen
WHERE a.tenant_id = $1 AND a.alias_slug = $4`;

/**
 * Exact canonical stable_id match ($4) — for callers that hold a node's
 * stable_id (a path-form id like 'getting-started/foundations') rather than
 * its resolvable slug path. The deny predicate binds on this arm too
 * (oracle self-review A1: a denied node must hide from stable_id-exact
 * resolution as well).
 */
export const NODE_BY_STABLE_ID_SQL: string = `
WITH RECURSIVE ${GEN}, ${DENIED_CTE}, ${ADMITTED_LIVE_CTE}
SELECT n.node_id, n.slug, n.title, n.stable_id, n.stable_id::text AS path, n.generation, n.permalink,
       ${GOVERNANCE}
FROM content_nodes n JOIN g ON n.generation = g.gen
JOIN live ON TRUE
JOIN content_nodes now ON now.tenant_id = $1 AND now.generation = live.gen
                      AND now.stable_id = n.stable_id
WHERE n.tenant_id = $1 AND n.stable_id = $4 AND n.status = 'published' AND ${DENY}
  AND ${ADMITTED_LIVE}`;

export const DOCUMENT_CHUNKS_SQL: string = `
WITH ${GEN}
SELECT c.ordinal, COALESCE(c.heading_path_text, ''), c.content
FROM chunks c
JOIN g ON c.generation = g.gen
JOIN sources s ON s.source_id = c.source_id AND s.tenant_id = c.tenant_id
              AND s.generation = c.generation
WHERE c.tenant_id = $1 AND s.node_id = $4 AND s.modality = 'prose'
ORDER BY c.source_id, c.ordinal`;

/**
 * The document's frontmatter, byte-exact as its author wrote it.
 *
 * Its own statement rather than a column on DOCUMENT_CHUNKS_SQL: that query
 * returns one row per chunk, and a document with a hundred chunks would carry
 * a hundred copies of the same block across the driver for one use.
 *
 * `ORDER BY source_id LIMIT 1` because a node's frontmatter is its FILE's, and
 * the plain-tree adapter gives a concept exactly one prose source. If a future
 * adapter gives a node several, this returns the first deterministically
 * rather than picking one at random — and that is the point at which "which
 * file's frontmatter" becomes a question worth answering properly.
 */
export const DOCUMENT_FRONTMATTER_SQL: string = `
WITH ${GEN}
SELECT s.frontmatter
FROM sources s
JOIN g ON s.generation = g.gen
WHERE s.tenant_id = $1 AND s.node_id = $4 AND s.modality = 'prose'
ORDER BY s.source_id
LIMIT 1`;

export const UNIT_TREE_SQL: string = `
WITH ${GEN}
SELECT DISTINCT ON (hp) hp, first_ordinal FROM (
    SELECT COALESCE(c.heading_path_text, '') AS hp, min(c.ordinal) AS first_ordinal
    FROM chunks c
    JOIN g ON c.generation = g.gen
    JOIN sources s ON s.source_id = c.source_id AND s.tenant_id = c.tenant_id
                  AND s.generation = c.generation
    WHERE c.tenant_id = $1 AND s.node_id = $4 AND s.modality = 'prose'
    GROUP BY hp
) u ORDER BY hp, first_ordinal`;

/**
 * Resolve a NAMED outline anchor ($4) to its ROOT-ABSOLUTE place: climb
 * parents to the root, accumulating the slug breadcrumb. The wire contract
 * says outline rows are root-absolute and self-locating — a drill-down's
 * children must not restart at depth 0.
 */
export const UP_WALK_SQL: string = `
WITH RECURSIVE ${GEN},
up AS (
    SELECT n.node_id, n.parent_id, n.generation, n.slug::text AS path, 0 AS climbed
    FROM content_nodes n JOIN g ON n.generation = g.gen
    WHERE n.tenant_id = $1 AND n.node_id = $4 AND n.status = 'published'
  UNION ALL
    SELECT up.node_id, p.parent_id, up.generation, p.slug || '/' || up.path, up.climbed + 1
    FROM content_nodes p
    JOIN up ON p.node_id = up.parent_id AND p.generation = up.generation
    WHERE p.tenant_id = $1
)
SELECT path, climbed FROM up WHERE parent_id IS NULL ORDER BY path LIMIT 1`;

/** Anchor $4 (uuid, NULL = browse roots), depth bound $5, limit $6, offset $7. */
export const OUTLINE_SQL: string = `
WITH RECURSIVE ${GEN},
${DENIED_CTE},
${ADMITTED_CTE},
walk AS (
    SELECT n.node_id, n.parent_id, n.slug, n.kind, n.title, n.position, n.stable_id,
           n.generation, n.permalink, 0 AS depth, ARRAY[n.position] AS sort_key,
           n.slug::text AS heading_path
    -- The SEED does not gate either, for the same reason the recursive arm
    -- does not: a root the caller may not see must still be descended THROUGH,
    -- or its visible children vanish from the record. The anchor case is
    -- different -- drilling INTO a node the caller cannot see is resolved
    -- before this query runs -- so only DENY binds here.
    FROM content_nodes n JOIN g ON n.generation = g.gen
    WHERE n.tenant_id = $1 AND n.status = 'published'
      AND (($4::uuid IS NULL AND n.parent_id IS NULL)
           OR ($4::uuid IS NOT NULL AND n.node_id = $4 AND ${DENY}))
  UNION ALL
    SELECT n.node_id, n.parent_id, n.slug, n.kind, n.title, n.position, n.stable_id,
           n.generation, n.permalink, w.depth + 1, w.sort_key || n.position,
           w.heading_path || '/' || n.slug
    FROM content_nodes n
    JOIN walk w ON n.parent_id = w.node_id AND n.generation = w.generation
    -- Descends WITHOUT gating: an internal parent must not prune its public
    -- children, or a document search returns is absent from the outline that
    -- the error message tells the caller to consult. The final WHERE below
    -- gates each row on its OWN visibility (round-9 review of PR 43).
    WHERE n.tenant_id = $1 AND n.status = 'published' AND w.depth < $5
)
-- The rank among the siblings THIS CALLER CAN SEE, not the stored one.
--
-- content_nodes.position is the rank in the whole record, so a tier that
-- cannot see a sibling saw a GAP where it sat -- 1, 3, 4 -- which discloses
-- that a document exists and roughly where, to a caller the record refuses to
-- show it to. The same row's child_count was already computed over visible
-- children only, so one response object disagreed with itself about whether
-- hidden siblings are disclosed (found live 2026-08-21).
--
-- Computed as a WINDOW over the filtered set: window functions run after WHERE
-- and before LIMIT/OFFSET, so the rank is the true visible sibling rank on
-- every page and at every depth. Doing it in JS would have to renumber a page
-- at a time -- which is how this query already produced two paging defects.
SELECT w.slug, w.kind, w.title, w.heading_path,
       row_number() OVER (PARTITION BY w.parent_id ORDER BY w.sort_key)::int AS position,
       w.depth,
       (SELECT count(*) FROM content_nodes ch
         WHERE ch.tenant_id = $1 AND ch.generation = w.generation
           AND ch.parent_id = w.node_id AND ch.status = 'published'
           AND ${admitted("ch")}
           AND ch.node_id NOT IN (SELECT node_id FROM denied)) AS child_count,
       EXISTS (SELECT 1 FROM sources s
                WHERE s.tenant_id = $1 AND s.generation = w.generation
                  AND s.node_id = w.node_id) AS has_content,
       w.permalink,
       w.generation
FROM walk w
JOIN content_nodes n ON n.node_id = w.node_id AND n.tenant_id = $1
                    AND n.generation = w.generation
-- A drill-down returns CHILDREN, so the depth-0 anchor is excluded HERE rather
-- than stripped after the window. It used to ride inside LIMIT/OFFSET and be
-- filtered afterwards, which cost one row on the FIRST page only: the caller
-- computed next_offset from the post-strip count, so every later page started
-- one row early and repeated its predecessor's last row (round-9 review of
-- PR 43).
WHERE ${DENY} AND ${ADMITTED} AND ($4::uuid IS NULL OR w.depth > 0)
ORDER BY w.sort_key
LIMIT $6 OFFSET $7`;

/**
 * A TYPED not-found — composition roots relabel it for their own door by
 * TYPE, never by matching this module's prose (oracle sixth-pass review
 * 2026-08-16: a bridge string-matched "no lesson with slug", which any
 * legal reword would have silently disabled).
 */
export class UnknownSlug extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownSlug";
  }
}

export interface DocumentNode extends NodeGovernance {
  readonly nodeId: string;
  readonly slug: string;
  readonly title: string;
  readonly stableId: string;
  readonly path: string;
  readonly generation: number;
  /**
   * The CONFIRMED site route for this node (e.g. /docs/getting-started),
   * or null when no page URL was proven at publish. The service joins it
   * onto the site base URL to serve an absolute URL.
   */
  readonly permalink: string | null;
}

export interface ReadScope {
  readonly tenantId: string;
  readonly corpusId: string;
  readonly pinnedGeneration: number | null;
}

function toNumber(value: unknown, column: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError(`column ${column} produced a non-number: ${JSON.stringify(value)}`);
  }
  return n;
}

/** Both node lookups project exactly these columns, in this order. */
export const NODE_COLUMNS: number = 7 + GOVERNANCE_COLUMN_COUNT;

/**
 * Width-guarded row parse. The oracle's scar: its star-unpack silently
 * truncated when a projection lost a column (the defaulted trailing
 * permalink absorbed the shortfall), so a six-column fixture sat green
 * against seven-column queries. A count mismatch here RAISES instead.
 */
export function nodeRows(result: pg.QueryArrayResult): DocumentNode[] {
  if (result.fields.length !== NODE_COLUMNS) {
    throw new TypeError(
      `node projection drift: expected ${NODE_COLUMNS} columns, got ${result.fields.length} ` +
        `(${result.fields.map((f) => f.name).join(", ")})`,
    );
  }
  return result.rows.map((row: readonly unknown[]) => ({
    nodeId: String(row[0]),
    slug: String(row[1]),
    title: String(row[2]),
    stableId: String(row[3]),
    path: String(row[4]),
    generation: toNumber(row[5], "generation"),
    permalink: row[6] === null ? null : String(row[6]),
    ...governanceFromRow(row, 7),
  }));
}

export function leafSlug(address: string): string {
  const trimmed = address.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

/** Pick THE node by full-path suffix match; ambiguity fails loudly with qualified addresses. */
export function resolveDocumentNode(
  candidates: readonly DocumentNode[],
  requested: string,
): DocumentNode {
  const want = requested.replace(/^\/+|\/+$/g, "");
  let matches = candidates.filter((c) => c.path === want || c.path.endsWith("/" + want));
  if (matches.length === 0 && candidates.length === 1 && !want.includes("/")) {
    matches = [...candidates];
  }
  const only = matches[0];
  if (only === undefined) {
    throw new UnknownSlug(
      `no document with slug ${JSON.stringify(requested)} — use the outline tool to list slugs`,
    );
  }
  if (matches.length > 1) {
    const addresses = shortestUnique(matches).join(", ");
    throw new Error(`slug ${JSON.stringify(requested)} is ambiguous — qualify it: ${addresses}`);
  }
  return only;
}

function shortestUnique(matches: readonly DocumentNode[]): string[] {
  const out: string[] = [];
  for (const m of matches) {
    const parts = m.path.split("/");
    let found: string | null = null;
    for (let i = 2; i <= parts.length; i += 1) {
      const suffix = parts.slice(parts.length - i).join("/");
      if (matches.filter((o) => o.path.endsWith(suffix)).length === 1) {
        found = suffix;
        break;
      }
    }
    out.push(found ?? m.path);
  }
  return out;
}

type QueryArgs = { text: string; values: readonly unknown[] };

async function arrayQuery(client: pg.PoolClient, args: QueryArgs): Promise<pg.QueryArrayResult> {
  return client.query({ text: args.text, values: args.values as unknown[], rowMode: "array" });
}

/**
 * Resolve an address: an exact canonical stable_id first, then
 * alias-flatten the leaf + resolve by slug suffix.
 */
export async function findDocument(
  client: pg.PoolClient,
  scope: ReadScope,
  address: string,
): Promise<DocumentNode> {
  const base = [scope.tenantId, scope.corpusId, scope.pinnedGeneration];
  const exact = await arrayQuery(client, {
    text: NODE_BY_STABLE_ID_SQL,
    values: [...base, address],
  });
  const exactNode = nodeRows(exact)[0];
  if (exactNode !== undefined) return exactNode;
  let leaf = leafSlug(address);
  const alias = await arrayQuery(client, { text: ALIAS_SQL, values: [...base, leaf] });
  const aliasRow = alias.rows[0];
  if (aliasRow !== undefined) {
    leaf = String(aliasRow[0]);
    address = address.includes("/")
      ? address.slice(0, address.lastIndexOf("/")) + "/" + leaf
      : leaf;
  }
  const candidates = await arrayQuery(client, { text: NODE_BY_SLUG_SQL, values: [...base, leaf] });
  return resolveDocumentNode(nodeRows(candidates), address);
}

export async function documentChunks(
  client: pg.PoolClient,
  scope: ReadScope,
  nodeId: string,
): Promise<DocumentChunk[]> {
  const result = await arrayQuery(client, {
    text: DOCUMENT_CHUNKS_SQL,
    values: [scope.tenantId, scope.corpusId, scope.pinnedGeneration, nodeId],
  });
  return result.rows.map((row: readonly unknown[]) => ({
    ordinal: toNumber(row[0], "ordinal"),
    headingPath: String(row[1]),
    content: String(row[2]),
  }));
}

/** The document's frontmatter block, or null when the file carried none. */
export async function documentFrontmatter(
  client: pg.PoolClient,
  scope: ReadScope,
  nodeId: string,
): Promise<string | null> {
  const result = await arrayQuery(client, {
    text: DOCUMENT_FRONTMATTER_SQL,
    values: [scope.tenantId, scope.corpusId, scope.pinnedGeneration, nodeId],
  });
  const value = result.rows[0]?.[0];
  return value === undefined || value === null ? null : String(value);
}

/**
 * A node's UNIT TREE: every distinct heading path, in CURRICULUM order.
 * Empty for a node with only front-matter (no headed prose).
 */
export async function unitTree(
  client: pg.PoolClient,
  scope: ReadScope,
  nodeId: string,
): Promise<string[]> {
  const result = await arrayQuery(client, {
    text: UNIT_TREE_SQL,
    values: [scope.tenantId, scope.corpusId, scope.pinnedGeneration, nodeId],
  });
  // UNIT_TREE_SQL's DISTINCT ON emits hp-alphabetical; re-sort by
  // first_ordinal for curriculum order.
  const rows = result.rows.map((row: readonly unknown[]) => ({
    hp: String(row[0]),
    firstOrdinal: toNumber(row[1], "first_ordinal"),
  }));
  rows.sort((a, b) => a.firstOrdinal - b.firstOrdinal);
  return rows.filter((r) => r.hp !== "").map((r) => r.hp);
}

export interface OutlineRow {
  readonly slug: string;
  readonly kind: string;
  readonly title: string;
  readonly headingPath: string;
  readonly position: number;
  readonly depth: number;
  readonly childCount: number;
  readonly hasContent: boolean;
  /**
   * Column index 8 of OUTLINE_SQL. In the oracle the drill-down re-base
   * rebuilt an 8-tuple and dropped it, so every production drill-down died
   * with "tuple index out of range" (found live 2026-07-31) — the exact
   * call the tool description instructs the model to make. Here the width
   * guard in outlineRows makes that drift a loud TypeError, and the
   * re-base copies whole rows so a new column cannot be lost in one branch.
   */
  readonly permalink: string | null;
  /**
   * Column index 9. The act's own generation, so the §7 audit row can pin what
   * it served from — `similarity_searched` and `content_served` both did and
   * `outline_served` wrote NULL, leaving the one act that hands an agent the
   * SHAPE of the record unjoinable to the publication it described (#19).
   * Carried on the row rather than re-queried: `walk` already selects it.
   */
  readonly generation: number;
}

export const OUTLINE_COLUMNS = 10;

export function outlineRows(result: pg.QueryArrayResult): OutlineRow[] {
  if (result.fields.length !== OUTLINE_COLUMNS) {
    throw new TypeError(
      `outline projection drift: expected ${OUTLINE_COLUMNS} columns, got ${result.fields.length} ` +
        `(${result.fields.map((f) => f.name).join(", ")})`,
    );
  }
  return result.rows.map((row: readonly unknown[]) => ({
    slug: String(row[0]),
    kind: String(row[1]),
    title: String(row[2]),
    headingPath: String(row[3]),
    position: toNumber(row[4], "position"),
    depth: toNumber(row[5], "depth"),
    childCount: toNumber(row[6], "child_count"),
    hasContent: Boolean(row[7]),
    permalink: row[8] === null ? null : String(row[8]),
    generation: toNumber(row[9], "generation"),
  }));
}

/**
 * Re-base each child breadcrumb to ROOT-ABSOLUTE (pure — unit-testable
 * without a DB). OUTLINE_SQL builds a row's heading_path from the ANCHOR's
 * OWN bare slug downward, so the prefix is absPath with its last segment
 * (the anchor slug) removed — derived from absPath itself, NOT from the
 * caller's `root` string. `root` may be a bare slug OR a full '/'-path,
 * and keying the prefix off its length would collapse to '' for a path
 * address and under-prefix every child. The anchor slug is always
 * absPath's last segment. Every other field — permalink included — is
 * carried whole (see OutlineRow.permalink for the prod scar).
 */
export function rebaseOutlineRows(
  rows: readonly OutlineRow[],
  absPath: string,
  absDepth: number,
): OutlineRow[] {
  const anchorSlug = absPath.slice(absPath.lastIndexOf("/") + 1);
  const prefix = absPath.slice(0, absPath.length - anchorSlug.length);
  return rows
    .filter((r) => r.depth !== 0) // the anchor row — the contract returns CHILDREN, a leaf yields []
    .map((r) => ({ ...r, headingPath: prefix + r.headingPath, depth: absDepth + r.depth }));
}

/**
 * The largest outline a caller may ASK for. The tool schema and the service
 * both derive from it, so the ceiling is one number rather than three
 * hand-copied ones.
 */
export const MAX_OUTLINE_LIMIT = 5000;

/**
 * The ceiling this function actually clamps to, which is deliberately HIGHER.
 * Callers add a probe row on top of the caller's limit — `service.ts` asks for
 * `limit + 1` to DETECT truncation. Clamping those away made `has_more`
 * always false at exactly the maximum, which is where truncation is most
 * likely and least visible (round-3 review of #43).
 */
const OUTLINE_CEILING = MAX_OUTLINE_LIMIT + 2;

export interface OutlineOptions {
  readonly root?: string | null;
  readonly depth?: number;
  readonly limit?: number;
  /**
   * Rows to skip, so a truncated outline has a way to continue.
   *
   * `has_more` told a caller the list was partial and nothing let them see the
   * rest: the only recourse was re-asking with a larger `limit`, and above the
   * maximum the tail was unreachable at all. An agent that cannot reach the
   * tail concludes the record does not contain it — the false "not in the
   * record" the truncation probe exists to prevent (round-6 review of #43).
   */
  readonly offset?: number;
}

/**
 * Browse (root=null): the top-level sections, depth already root-absolute.
 * Drill-down (root=slug or '/'-path): the node's CHILDREN, re-based to
 * ROOT-ABSOLUTE depth + breadcrumb (the wire contract: rows are
 * self-locating; a leaf with no children returns an empty list — the
 * anchor itself is never echoed back).
 */
export async function outline(
  client: pg.PoolClient,
  scope: ReadScope,
  options: OutlineOptions = {},
): Promise<OutlineRow[]> {
  const root = options.root ?? null;
  const depth = Math.max(0, options.depth ?? 0);
  const limit = Math.max(1, Math.min(options.limit ?? 200, OUTLINE_CEILING));
  const offset = Math.max(0, options.offset ?? 0);
  let pinned = scope.pinnedGeneration;
  let anchor: string | null = null;
  if (root !== null) {
    // Resolve the anchor to a SINGLE node_id — accepting a BARE slug OR a
    // '/'-path address via the SAME leaf-slug + path-suffix resolution the
    // read tools use. outline EMITS root-absolute '/'-paths (each row's
    // headingPath), so a breadcrumb copied from an earlier outline row must
    // resolve here instead of erroring (oracle field test #2). Unknown →
    // loud; an unqualified slug matching >1 node → the loud ambiguity error
    // naming the qualified addresses to retry with, instead of silently
    // merging their subtrees under one arbitrary base.
    const cands = await arrayQuery(client, {
      text: NODE_BY_SLUG_SQL,
      values: [scope.tenantId, scope.corpusId, pinned, leafSlug(root)],
    });
    const candidates = nodeRows(cands);
    if (candidates.length === 0) {
      throw new Error(
        `no node with slug ${JSON.stringify(root)} — browse from the root with outline() (omit node=)`,
      );
    }
    const node = resolveDocumentNode(candidates, root);
    anchor = node.nodeId;
    // Pin the subtree walk + up-walk to the generation the anchor RESOLVED
    // into: node_id is per-generation, so if a flip commits between this
    // resolve and OUTLINE_SQL/UP_WALK_SQL (READ COMMITTED), re-resolving
    // active_generation would query a gen-N node_id against gen N+1 and
    // spuriously return no children / raise "no node with slug". A token
    // pin still wins.
    if (pinned === null) pinned = node.generation;
  }

  const result = await arrayQuery(client, {
    text: OUTLINE_SQL,
    // The anchor row is excluded by the query itself now, so the window holds
    // only CHILDREN and `limit`/`offset` mean the same thing on every page.
    values: [scope.tenantId, scope.corpusId, pinned, anchor, depth, limit, offset],
  });
  const rows = outlineRows(result);
  if (root === null) return rows;

  const up = await arrayQuery(client, {
    text: UP_WALK_SQL,
    values: [scope.tenantId, scope.corpusId, pinned, anchor],
  });
  const anchorRow = up.rows[0];
  if (anchorRow === undefined) {
    // A denied anchor (resolved node_id exists but the takedown deny hides
    // its children): browse returned []; keep this as a loud guard so an
    // impossible state never silently mis-bases.
    throw new Error(
      `no node with slug ${JSON.stringify(root)} — browse from the root with outline() (omit node=)`,
    );
  }
  return rebaseOutlineRows(rows, String(anchorRow[0]), toNumber(anchorRow[1], "climbed"));
}
