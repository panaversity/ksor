/**
 * Hybrid retrieval (oracle SC/lib/search.py): ONE SQL statement — a
 * pgvector cosine arm and a websearch_to_tsquery arm, RRF-fused
 * (sum(1.0/(60+r))), tie-broken by chunk_id everywhere. The vector arm's
 * top cosine rides out of the same statement as the abstention signal — a
 * separate top-1 query was measured redundant (2026-07-16). Takedown
 * denial is applied PRE-fusion so a denied node cannot leak by ranking.
 */

import { createHash } from "node:crypto";

import type pg from "pg";

import { MIN_CONTENT_CHARS, RRF_K } from "../config.js";
import { ADMITTED, ADMITTED_CTE } from "./admit.js";
import { DENIED_CTE, DENY } from "./takedown.js";

/**
 * Every vector transaction must bind these txn-locally: tenant and
 * generation are POST-filters on the HNSW walk, and a plain filtered walk
 * silently under-returns for a small tenant. hybridSearch trusts its caller
 * folded them into the transaction's own set_config round trip (runRead's
 * extraGucs) — the test-enforced pairing from the oracle.
 */
export const VECTOR_TXN_GUCS: Readonly<Record<string, string>> = {
  "hnsw.iterative_scan": "relaxed_order",
  "hnsw.ef_search": "100",
};

const SERVABLE = `c.labels->>'source_type' = 'prose' AND length(regexp_replace(c.content, '\\s', '', 'g')) >= ${MIN_CONTENT_CHARS}`;

const GEN_CTE = `
g AS (
    SELECT COALESCE(
        $8::bigint,
        (SELECT active_generation FROM corpora
          WHERE tenant_id = $1 AND corpus_id = $2)
    ) AS gen
)`;

// Scoped takedown denial (decision 14): the shared `denied` set — per-node by
// default, whole subtree when a row says so — bound PRE-fusion so a denied node
// cannot leak by ranking. Definition lives in takedown.ts (one seam).
/**
 * The arm predicate, built for the parameter numbering of the query that uses
 * it — a FUNCTION, not a string the caller renumbers afterwards.
 *
 * It used to be derived with `ARM_WHERE.replaceAll("$5", "$4")`, which works
 * only while the predicate happens to contain exactly one placeholder and no
 * other text matching it. Adding any second parameter to the predicate breaks
 * every derived query silently — and when it breaks, the failure arrives as a
 * driver error that the serving layer correctly reduces to "content store
 * temporarily unavailable", which tells you nothing about the cause. Found by
 * tripping over it while trying a fix for issue #59; taking the number as an
 * argument makes the coupling visible instead of textual.
 */
const armWhere = (kindsParam: string): string => `
        c.tenant_id = $1 AND c.generation = g.gen
          AND c.embedding_status = 'embedded' AND ${SERVABLE}
          AND n.status = 'published'
          AND (${kindsParam}::text[] IS NULL OR n.kind = ANY(${kindsParam}::text[]))
          AND ${DENY}
          AND ${ADMITTED}`;

/**
 * The EXACT text the abstention signal is measured through — the candidate set
 * a top-1 cosine is the top of.
 *
 * A floor is a threshold inside one predicate. Change the predicate and the
 * same question reaches a different candidate set, so the measured separation
 * the number encodes is no longer the separation the door has: the floor stays
 * plausible and stops meaning what it said. `ksor calibrate` records this
 * digest beside the floor and the door compares it at boot (service.ts), which
 * is the only way a predicate change can be made to show up as anything other
 * than quietly different answers.
 *
 * The kinds parameter is spelled `$k` rather than its real number, so
 * renumbering a statement is not mistaken for a change in what it selects.
 */
export const GATE_PREDICATE: string = [DENIED_CTE, ADMITTED_CTE, armWhere("$k"), SERVABLE].join(
  "\n",
);

/** Short enough to paste beside a number in `instance.md`, long enough to collide with nothing. */
export const GATE_PREDICATE_DIGEST: string = createHash("sha256")
  .update(GATE_PREDICATE)
  .digest("hex")
  .slice(0, 12);

/**
 * The governance columns every hit carries out with it (record spec §2).
 *
 * Projected in the SAME statement as the passage rather than fetched per hit
 * afterwards: an agent decides whether to rely on a sentence by deciding about
 * the DOCUMENT it came from, and a second query would let the two disagree
 * across a flip. `n` is the node alias both arms' final SELECT uses.
 */
const GOVERNANCE_COLUMNS = `n.doc_status, n.trust_tier, n.verified, n.approval,
           n.effective_from, n.stale_after`;

const JOINS = `
        FROM chunks c
        JOIN g ON TRUE
        JOIN sources s ON s.source_id = c.source_id AND s.tenant_id = c.tenant_id
                      AND s.generation = c.generation
        JOIN content_nodes n ON n.node_id = s.node_id AND n.tenant_id = s.tenant_id`;

/**
 * Exported ONLY so a test can EXPLAIN the real thing.
 *
 * The index regression this fixes was announced as fixed once before, and came
 * back through a different clause, because nothing ever asserted the RESULT —
 * that the plan opens `idx_chunks_hnsw`. A timing threshold would be flaky and
 * would not have caught it either; the plan shape is the property that matters
 * (issue #59).
 */
export const HYBRID_SQL: string = `
WITH RECURSIVE ${GEN_CTE}, ${DENIED_CTE}, ${ADMITTED_CTE},
    -- The top-k is taken by a PLAIN \`ORDER BY <distance> LIMIT\`, and the rank
    -- is numbered OUTSIDE it. Ordering by a window column instead made the
    -- HNSW index unusable: a window function must see every row in its
    -- partition before it can number anything, so Postgres computed the
    -- distance for every chunk in the generation and sorted — measured on
    -- PG 17.7 / pgvector 0.8.2 at 6,667 rows: 1180 ms seq-scan+quicksort here
    -- versus 14 ms via the index, with idx_chunks_hnsw built and maintained
    -- but never used (review 2026-08-20). The arm's filters stay INSIDE the
    -- ordered scan on purpose: hnsw.iterative_scan = relaxed_order (bound in
    -- VECTOR_TXN_GUCS) is what keeps recall honest when a predicate rejects
    -- candidates, which is the whole reason that knob is set.
    vec AS (
        SELECT chunk_id, gen,
               row_number() OVER (ORDER BY dist, chunk_id) AS r,
               1 - dist AS sim
        FROM (
            SELECT c.chunk_id, g.gen, (c.embedding <=> $3::vector) AS dist
            ${JOINS}
            WHERE ${armWhere("$5")}
            ORDER BY c.embedding <=> $3::vector, c.chunk_id
            LIMIT $6
        ) ranked),
    kw AS (
        SELECT c.chunk_id, g.gen,
               row_number() OVER (ORDER BY ts_rank_cd(c.search_tsv,
                   websearch_to_tsquery($9::regconfig, $4)) DESC, c.chunk_id) AS r
        ${JOINS}
        WHERE ${armWhere("$5")}
          AND c.search_tsv @@ websearch_to_tsquery($9::regconfig, $4)
        ORDER BY r LIMIT $6),
    fused AS (
        SELECT chunk_id, max(gen) AS gen, sum(1.0 / (${RRF_K} + r)) AS score
        FROM (SELECT chunk_id, gen, r FROM vec UNION ALL SELECT chunk_id, gen, r FROM kw) u
        GROUP BY chunk_id)
    SELECT c.chunk_id::text, c.source_id::text, n.stable_id, n.slug, c.heading_path_text,
           c.content, f.score, f.gen, n.permalink,
           ${GOVERNANCE_COLUMNS},
           (SELECT max(sim) FROM vec) AS top_vec_sim
    FROM fused f
    JOIN chunks c ON c.chunk_id = f.chunk_id AND c.tenant_id = $1 AND c.generation = f.gen
    JOIN sources s ON s.source_id = c.source_id AND s.tenant_id = c.tenant_id
                  AND s.generation = c.generation
    JOIN content_nodes n ON n.node_id = s.node_id AND n.tenant_id = s.tenant_id
    ORDER BY f.score DESC, c.chunk_id LIMIT $7`;

const KEYWORD_SQL = `
WITH RECURSIVE ${GEN_CTE.replace("$8", "$6")}, ${DENIED_CTE}, ${ADMITTED_CTE}
    SELECT c.chunk_id::text, c.source_id::text, n.stable_id, n.slug, c.heading_path_text,
           c.content,
           ts_rank_cd(c.search_tsv, websearch_to_tsquery($7::regconfig, $3)) AS score,
           g.gen, n.permalink,
           ${GOVERNANCE_COLUMNS}
    ${JOINS}
    WHERE ${armWhere("$4")}
      AND c.search_tsv @@ websearch_to_tsquery($7::regconfig, $3)
    ORDER BY score DESC, c.chunk_id LIMIT $5`;

/** The calibrator's standalone top-1 signal (the read path gets it free from HYBRID_SQL). */
const TOP_ONE_SQL = `
WITH RECURSIVE ${GEN_CTE.replace("$8", "$5")}, ${DENIED_CTE}, ${ADMITTED_CTE}
    SELECT 1 - (c.embedding <=> $3::vector) AS score
    ${JOINS}
    WHERE ${armWhere("$4")}
    ORDER BY c.embedding <=> $3::vector, c.chunk_id
    LIMIT 1`;

/** An act the record records: who, and when (ISO 8601, as the row holds it). */
export interface HitAct {
  readonly by: string;
  readonly at: string;
}

export interface Hit {
  readonly chunkId: string;
  readonly sourceId: string;
  readonly stableId: string;
  readonly slug: string;
  readonly headingPath: string | null;
  readonly content: string;
  /** Postgres NUMERIC arrives as a string from pg — coerced here, because the MCP wire would otherwise carry a JSON string. */
  readonly score: number;
  readonly generation: number;
  readonly permalink: string | null;
  /**
   * The governance the passage's DOCUMENT declared. Carried on the hit because
   * that is the unit an agent judges: a per-response summary cannot say which
   * of several hits was the reviewed one.
   *
   * Nullable throughout, because a section row and a pre-2.5 carried row hold
   * NULL — such a generation is refused at boot (GOVERNANCE_SINCE), so these
   * are never the shape a SERVED hit has, but the parse must not invent values
   * for them either.
   */
  readonly docStatus: string | null;
  readonly trustTier: number | null;
  readonly verified: readonly HitAct[] | null;
  readonly approval: HitAct | null;
  readonly effectiveFrom: string | null;
  readonly staleAfter: string | null;
}

const HIT_COLUMNS = 15;

/** Serialize a query vector as a pgvector literal. */
export function vectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}

function toNumber(value: unknown, column: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError(`column ${column} produced a non-number: ${JSON.stringify(value)}`);
  }
  return n;
}

/**
 * A TIMESTAMPTZ as the wire carries it. `pg` parses the column into a Date, so
 * the instant is re-rendered rather than stringified — `String(date)` would put
 * a local-timezone human string on an MCP response.
 */
function toInstant(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/** A JSONB act, shaped or dropped — never half-built from a row that holds something else. */
function toAct(value: unknown): HitAct | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const act = value as Record<string, unknown>;
  if (typeof act["by"] !== "string" || typeof act["at"] !== "string") return null;
  return { by: act["by"], at: act["at"] };
}

function toActs(value: unknown): HitAct[] | null {
  if (!Array.isArray(value)) return null;
  const acts = value.map(toAct).filter((a): a is HitAct => a !== null);
  return acts.length === 0 ? null : acts;
}

function rowToHit(row: readonly unknown[]): Hit {
  return {
    chunkId: String(row[0]),
    sourceId: String(row[1]),
    stableId: String(row[2]),
    slug: String(row[3]),
    headingPath: row[4] === null ? null : String(row[4]),
    content: String(row[5]),
    score: toNumber(row[6], "score"),
    generation: toNumber(row[7], "generation"),
    permalink: row[8] === null ? null : String(row[8]),
    docStatus: row[9] === null ? null : String(row[9]),
    trustTier: row[10] === null ? null : toNumber(row[10], "trust_tier"),
    verified: toActs(row[11]),
    approval: toAct(row[12]),
    effectiveFrom: toInstant(row[13]),
    staleAfter: toInstant(row[14]),
  };
}

/**
 * The one place that knows HYBRID_SQL's projection (the oracle's
 * split_hits drift guard): Hit's fields in order, then top_vec_sim. A NULL
 * top_vec_sim is a legitimate abstain signal (keyword-only fused rows); a
 * non-number there RAISES rather than degrading into a silent abstention.
 */
export function splitHits(result: pg.QueryArrayResult): { hits: Hit[]; topCosine: number | null } {
  const fields = result.fields;
  if (fields.length !== HIT_COLUMNS + 1 || fields[HIT_COLUMNS]?.name !== "top_vec_sim") {
    throw new TypeError(
      `hybrid projection drift: expected ${HIT_COLUMNS + 1} columns ending in top_vec_sim, ` +
        `got ${fields.length} ending in ${JSON.stringify(fields.at(-1)?.name)}`,
    );
  }
  const hits = result.rows.map(rowToHit);
  const raw = result.rows[0]?.[HIT_COLUMNS] ?? null;
  const topCosine = raw === null ? null : toNumber(raw, "top_vec_sim");
  return { hits, topCosine };
}

export interface SearchScope {
  readonly tenantId: string;
  readonly corpusId: string;
  readonly kinds: readonly string[] | null;
  readonly pinnedGeneration: number | null;
  /**
   * The Postgres text-search configuration to stem the QUERY with — it must
   * match the one `chunks.search_tsv` was generated with, or the arms disagree
   * about what a word is.
   *
   * PARAMETERISED as `$n::regconfig`, never spliced: the value comes from
   * instance.md, and a configuration name reaching DDL-shaped SQL by
   * concatenation is the one place this file would be injectable. Omitted =
   * `english`, which is what every record built before the key existed has.
   */
  readonly textSearchConfig?: string;
}

/** What a scope that names no configuration means. */
const DEFAULT_TS_CONFIG = "english";

/** Caller MUST have bound VECTOR_TXN_GUCS into this transaction (see above). */
export async function hybridSearch(
  client: pg.PoolClient,
  scope: SearchScope,
  queryVector: readonly number[] | string,
  query: string,
  limit: number,
  poolPerArm = 30,
): Promise<{ hits: Hit[]; topCosine: number | null }> {
  const result = await client.query({
    text: HYBRID_SQL,
    rowMode: "array",
    values: [
      scope.tenantId,
      scope.corpusId,
      typeof queryVector === "string" ? queryVector : vectorLiteral(queryVector),
      query,
      scope.kinds,
      poolPerArm,
      limit,
      scope.pinnedGeneration,
      scope.textSearchConfig ?? DEFAULT_TS_CONFIG,
    ],
  });
  return splitHits(result);
}

/** The embed-outage degrade: same predicates, no vector arm, never a 500. */
export async function keywordSearch(
  client: pg.PoolClient,
  scope: SearchScope,
  query: string,
  limit: number,
): Promise<Hit[]> {
  const result = await client.query({
    text: KEYWORD_SQL,
    rowMode: "array",
    values: [
      scope.tenantId,
      scope.corpusId,
      query,
      scope.kinds,
      limit,
      scope.pinnedGeneration,
      scope.textSearchConfig ?? DEFAULT_TS_CONFIG,
    ],
  });
  // The same projection guard the hybrid arm gets via splitHits. Without it a
  // dropped or reordered KEYWORD_SQL column silently mis-maps score /
  // generation / permalink on the EMBED-OUTAGE path — the least-exercised
  // read path, where a wrong generation would be least likely to be noticed
  // (review, 2026-08-20).
  if (result.fields.length !== HIT_COLUMNS) {
    throw new TypeError(
      `keyword projection drift: expected ${HIT_COLUMNS} columns, got ${result.fields.length} ` +
        `ending in ${JSON.stringify(result.fields.at(-1)?.name)}`,
    );
  }
  return result.rows.map(rowToHit);
}

/** Calibration-plane top-1 cosine; denial applied pre-scoring so takedown cannot leak via the abstain path. */
export async function topOneScore(
  client: pg.PoolClient,
  scope: SearchScope,
  queryVector: readonly number[] | string,
): Promise<number | null> {
  const result = await client.query({
    text: TOP_ONE_SQL,
    rowMode: "array",
    values: [
      scope.tenantId,
      scope.corpusId,
      typeof queryVector === "string" ? queryVector : vectorLiteral(queryVector),
      scope.kinds,
      scope.pinnedGeneration,
    ],
  });
  const raw = result.rows[0]?.[0];
  return raw === undefined || raw === null ? null : toNumber(raw, "score");
}
