/**
 * Hybrid retrieval (oracle SC/lib/search.py): ONE SQL statement — a
 * pgvector cosine arm and a websearch_to_tsquery arm, RRF-fused
 * (sum(1.0/(60+r))), tie-broken by chunk_id everywhere. The vector arm's
 * top cosine rides out of the same statement as the abstention signal — a
 * separate top-1 query was measured redundant (2026-07-16). Takedown
 * denial is applied PRE-fusion so a denied node cannot leak by ranking.
 */

import type pg from "pg";

import { MIN_CONTENT_CHARS } from "../config.js";

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

// PER-NODE denial (exactly the listed stable_id) — the same semantic and the
// same open subtree-vs-per-node governance decision documented at read.ts
// NODE_DENY. Applied PRE-fusion so a denied node cannot leak by ranking.
const DENY = `
NOT EXISTS (
    SELECT 1 FROM takedown_denylist d
    WHERE d.tenant_id = $1 AND d.corpus_id = $2 AND d.stable_id = n.stable_id
)`;

const ARM_WHERE = `
        c.tenant_id = $1 AND c.generation = g.gen
          AND c.embedding_status = 'embedded' AND ${SERVABLE}
          AND n.status = 'published'
          AND ($5::text[] IS NULL OR n.kind = ANY($5::text[]))
          AND ${DENY}`;

const JOINS = `
        FROM chunks c
        JOIN g ON TRUE
        JOIN sources s ON s.source_id = c.source_id AND s.tenant_id = c.tenant_id
                      AND s.generation = c.generation
        JOIN content_nodes n ON n.node_id = s.node_id AND n.tenant_id = s.tenant_id`;

const HYBRID_SQL = `
WITH ${GEN_CTE},
    vec AS (
        SELECT c.chunk_id, g.gen,
               row_number() OVER (ORDER BY c.embedding <=> $3::vector, c.chunk_id) AS r,
               1 - (c.embedding <=> $3::vector) AS sim
        ${JOINS}
        WHERE ${ARM_WHERE}
        ORDER BY r LIMIT $6),
    kw AS (
        SELECT c.chunk_id, g.gen,
               row_number() OVER (ORDER BY ts_rank_cd(c.search_tsv,
                   websearch_to_tsquery('english', $4)) DESC, c.chunk_id) AS r
        ${JOINS}
        WHERE ${ARM_WHERE}
          AND c.search_tsv @@ websearch_to_tsquery('english', $4)
        ORDER BY r LIMIT $6),
    fused AS (
        SELECT chunk_id, max(gen) AS gen, sum(1.0 / (60 + r)) AS score
        FROM (SELECT chunk_id, gen, r FROM vec UNION ALL SELECT chunk_id, gen, r FROM kw) u
        GROUP BY chunk_id)
    SELECT c.chunk_id::text, c.source_id::text, n.stable_id, n.slug, c.heading_path_text,
           c.content, f.score, f.gen, n.permalink,
           (SELECT max(sim) FROM vec) AS top_vec_sim
    FROM fused f
    JOIN chunks c ON c.chunk_id = f.chunk_id AND c.tenant_id = $1 AND c.generation = f.gen
    JOIN sources s ON s.source_id = c.source_id AND s.tenant_id = c.tenant_id
                  AND s.generation = c.generation
    JOIN content_nodes n ON n.node_id = s.node_id AND n.tenant_id = s.tenant_id
    ORDER BY f.score DESC, c.chunk_id LIMIT $7`;

const KEYWORD_SQL = `
WITH ${GEN_CTE.replace("$8", "$6")}
    SELECT c.chunk_id::text, c.source_id::text, n.stable_id, n.slug, c.heading_path_text,
           c.content,
           ts_rank_cd(c.search_tsv, websearch_to_tsquery('english', $3)) AS score,
           g.gen, n.permalink
    ${JOINS}
    WHERE ${ARM_WHERE.replaceAll("$5", "$4")}
      AND c.search_tsv @@ websearch_to_tsquery('english', $3)
    ORDER BY score DESC, c.chunk_id LIMIT $5`;

/** The calibrator's standalone top-1 signal (the read path gets it free from HYBRID_SQL). */
const TOP_ONE_SQL = `
WITH ${GEN_CTE.replace("$8", "$5")}
    SELECT 1 - (c.embedding <=> $3::vector) AS score
    ${JOINS}
    WHERE ${ARM_WHERE.replaceAll("$5", "$4")}
    ORDER BY c.embedding <=> $3::vector, c.chunk_id
    LIMIT 1`;

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
}

const HIT_COLUMNS = 9;

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
}

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
    values: [scope.tenantId, scope.corpusId, query, scope.kinds, limit, scope.pinnedGeneration],
  });
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
