/**
 * What the serving query's PLAN does — pinned, because it is currently wrong.
 *
 * `idx_chunks_hnsw` is built, maintained, and **not opened** by the query
 * `ksor serve` sends. Issue #59.
 *
 * WHY — measured 2026-08-22, PG 17.7 / pgvector 0.8.2, 20,000 chunks of
 * 1536 dimensions with real cluster structure. The earlier explanation in this
 * header (joins, and predicates Postgres cannot estimate) was INCOMPLETE and
 * partly wrong; each clause was tested on its own and the result is a cost
 * mispricing with three compounding contributors:
 *
 *   1. Postgres prices a full sequential pass over 20,000 chunks — including
 *      20,000 × 1536-dimension distance computations — at cost **1904**. That
 *      pass actually takes ~130 ms. The HNSW scan's STARTUP cost alone is
 *      2137, so the index can only win at small LIMITs. This is the root: the
 *      distance operator is costed as if it were nearly free.
 *   2. The ordered scan must therefore touch `chunks` with ESTIMABLE
 *      predicates only. Moving `SERVABLE` (a `labels->>` lookup and a
 *      `regexp_replace` length) inside it flips the plan back to sequential:
 *      **478 ms with it inside, 2.3 ms with it outside** — same rows.
 *   3. `hnsw.ef_search = 100` (set in VECTOR_TXN_GUCS) raises the scan's cost
 *      further, and the ceiling is SIZE-DEPENDENT: at 20,000 rows the index is
 *      chosen up to ef_search 80 and lost at 90; at 5,000 rows it is never
 *      chosen at any setting, which is CORRECT there because a sequential pass
 *      over 5,000 rows is both fast and exact.
 *
 * So today's behaviour is EXACT and slow in proportion to corpus size — not
 * wrong. That matters for how it may be fixed: HNSW is approximate, and on the
 * bed above, `ef_search` at its default missed the true nearest neighbour for
 * **1 query in 100**, with the top-1 similarity falling by 0.99. This record's
 * measured in-corpus/out-of-corpus separation is ~0.01
 * (`behavioural.db.test.ts`), so a miss of that size would flip an ABSTENTION:
 * the corpus holds the answer and the door would say it does not. Trading
 * exactness for speed here is a governance decision, not a tuning one.
 *
 * The measured shape of a fix, for whoever takes it: order over `chunks` alone,
 * overfetch ≤ ~100 (at 20,000 rows the crossover is between 100 and 150), then
 * join and apply governance filtering — **36 ms against 648 ms**, the same
 * rows. It needs BOTH halves: with `ef_search` at the shipped 100 the
 * restructured query still plans sequentially (355 ms), and at 64 it still does
 * (124 ms). Only pgvector's default opens the index — and that is the setting
 * whose top-1 miss is measured above, so the two halves cannot be separated:
 * taking the speed means taking the approximation.
 *
 * A second cost is recall UNDER FILTERING. Today the filters sit inside the
 * scan, so `hnsw.iterative_scan = relaxed_order` keeps scanning until k rows
 * survive; a fixed overfetch cannot. A corpus whose top-100 is mostly denied,
 * unpublished, or out-of-audience would return fewer hits — and an empty result
 * is an abstention. An adaptive fallback (retry with filters inside when
 * survivors < k) fixes THAT half, at one extra round trip in the rare case. It
 * does not fix the top-1 miss, which happens inside the index scan where no
 * later step can see it.
 *
 * This is a CHARACTERIZATION test, not a guard on correct behaviour. It asserts
 * today's plan so that a fix — or a further regression — arrives as a red test
 * with the plan printed, rather than silently. **When you fix #59, this test
 * fails; invert it and record the measurement.**
 *
 * It exists because the same defect was announced as fixed once before (the
 * previous fix removed a window function from the ORDER BY) and returned
 * through the WHERE clause, since nothing ever asserted the outcome. A timing
 * threshold would be flaky and would not have caught it either. The plan is the
 * property that matters, so the plan is what is asserted — of the REAL
 * `HYBRID_SQL`, never of a query written for the test. Two separate attempts at
 * a fix measured a simplified query instead and looked like they worked; this
 * file is what proved they had not.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runRead } from "../db.js";
import { applySchema } from "../schema.js";
import { HYBRID_SQL, VECTOR_TXN_GUCS } from "./search.js";
import { WHOLE_RECORD_SCOPE } from "./audience.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_vector_plan";
const TENANT = "planned";
/** Enough rows that a sequential scan is genuinely the wrong answer. */
const ROWS = 20_000;

describe.runIf(adminDsn !== "")("the serving query opens the vector index (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, 1536);

    await pool.query(
      "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 1)",
      [TENANT],
    );
    await pool.query(
      "INSERT INTO content_nodes (tenant_id, generation, stable_id, slug, title, kind, position, status, audience, doc_status)" +
        " VALUES ($1, 1, 'n', 'n', 'N', 'document', 1, 'published', ARRAY['public'], 'stable')",
      [TENANT],
    );
    await pool.query(
      "INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path," +
        " content_hash, embedding_model, chunk_policy, source_commit)" +
        " SELECT $1, 1, 's', node_id, 'N', 'n.md', 'h', 'fake', 'p', 'c'" +
        " FROM content_nodes WHERE tenant_id = $1 AND generation = 1",
      [TENANT],
    );
    // Random unit-ish vectors: a conservative bed, see the header.
    await pool.query(
      `INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content, chunk_hash,
                           heading_path, embedding, embedding_status, labels)
       SELECT $1, 1, 's', g, repeat('servable prose filler sentence ', 9), md5(g::text), '[]'::jsonb,
              (SELECT ('[' || string_agg((random() - 0.5)::text, ',') || ']')::vector
                 FROM generate_series(1, 1536)),
              'embedded', '{"source_type":"prose"}'::jsonb
       FROM generate_series(1, ${ROWS}) g`,
      [TENANT],
    );
    await pool.query("VACUUM ANALYZE chunks");
  }, 900_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it(`the vector arm does NOT open idx_chunks_hnsw at ${ROWS} chunks — issue #59`, async () => {
    const zero = `[${Array.from({ length: 1536 }, () => "0.001").join(",")}]`;
    const plan = await runRead(
      pool,
      TENANT,
      async (client) => {
        const r = await client.query<{ "QUERY PLAN": string }>(`EXPLAIN ${HYBRID_SQL}`, [
          TENANT,
          TENANT,
          zero,
          "widgets",
          null,
          30,
          10,
          null,
          "english",
        ]);
        return r.rows.map((row) => row["QUERY PLAN"]).join("\n");
      },
      { ...VECTOR_TXN_GUCS, ...WHOLE_RECORD_SCOPE },
    );

    // The defect, pinned. Read the header before changing this.
    expect(
      plan.includes("idx_chunks_hnsw"),
      "the vector arm now OPENS the index — issue #59 is fixed. Invert this " +
        `assertion and record the measurement beside it.\nPlan:\n${plan}`,
    ).toBe(false);

    // …and it is a scan, which is the shape that makes search O(corpus).
    expect(plan, `Plan:\n${plan}`).toMatch(/Seq Scan on chunks/);
  }, 300_000);

  /**
   * The diagnosis, executable — so it cannot rot into a comment that used to be
   * true. The header explains WHY the index is refused; this asserts the one
   * change that lifts the refusal, which is the fix path anyone takes next.
   *
   * If this ever goes red, the planner or pgvector has changed and the whole
   * header needs re-measuring before it is trusted again.
   */
  it("…and it OPENS the index only with BOTH changes: chunks-alone scan AND default ef_search", async () => {
    const zero = `[${Array.from({ length: 1536 }, () => "0.001").join(",")}]`;
    // Identical rows, identical filters, identical k. The ONLY difference is
    // that the unestimable governance predicates are applied AFTER the ordered
    // scan instead of inside it.
    const restructured = `
      WITH cand AS (
        SELECT c.chunk_id, c.source_id, c.generation, (c.embedding <=> $2::vector) AS dist
        FROM chunks c
        WHERE c.tenant_id = $1 AND c.generation = 1 AND c.embedding_status = 'embedded'
        ORDER BY c.embedding <=> $2::vector
        LIMIT 100)
      SELECT cand.chunk_id FROM cand
      JOIN chunks c ON c.chunk_id = cand.chunk_id AND c.tenant_id = $1
      JOIN sources s ON s.source_id = cand.source_id AND s.tenant_id = $1
                    AND s.generation = cand.generation
      JOIN content_nodes n ON n.node_id = s.node_id AND n.tenant_id = s.tenant_id
      WHERE n.status = 'published'
        AND c.labels->>'source_type' = 'prose'
        AND length(regexp_replace(c.content, '\\s', '', 'g')) >= 24
      ORDER BY cand.dist, cand.chunk_id LIMIT 30`;

    const plan = await runRead(
      pool,
      TENANT,
      async (client) => {
        const r = await client.query<{ "QUERY PLAN": string }>(`EXPLAIN ${restructured}`, [
          TENANT,
          zero,
        ]);
        return r.rows.map((row) => row["QUERY PLAN"]).join("\n");
      },
      // NOTE the missing `hnsw.ef_search`. Restructuring alone is NOT enough:
      // with the shipped value of 100 this same query still plans sequentially
      // (355 ms), and at 64 it still does (124 ms). Only at pgvector's default
      // does the index open (36 ms) — which is also the setting where a top-1
      // miss was measured, and that is exactly why the fix is a governance
      // decision rather than a tuning one.
      { "hnsw.iterative_scan": "relaxed_order", ...WHOLE_RECORD_SCOPE },
    );

    expect(
      plan.includes("idx_chunks_hnsw"),
      "the restructured arm no longer opens the index either — the header's " +
        `measurements are stale and must be re-taken before they are trusted.\nPlan:\n${plan}`,
    ).toBe(true);
  }, 300_000);
});
