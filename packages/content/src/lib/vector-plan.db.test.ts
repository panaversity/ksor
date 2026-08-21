/**
 * What the serving query's PLAN does — pinned, because it is currently wrong.
 *
 * `idx_chunks_hnsw` is built, maintained, and **not opened** by the query
 * `ksor serve` sends. The arm's filters are expressions Postgres cannot
 * estimate (`labels->>'source_type'`, a `regexp_replace` length) and its
 * generation comes from a join, so the ordered scan is priced as a near-full
 * traversal and a sequential scan plus top-N heapsort wins. Measured at 20,001
 * chunks on PG 17.7 / pgvector 0.8.2: **814 ms** with the index absent from the
 * plan, against **1.2 ms** for the same rows from the same index when the query
 * is simple. Issue #59.
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
 * `HYBRID_SQL`, never of a query written for the test. An earlier attempt at a
 * fix measured a simplified query instead and looked like it worked; this file
 * is what proved it had not.
 *
 * Vectors are random, which is unfavourable to HNSW in 1536 dimensions. That
 * makes it a conservative bed for the direction being asserted here.
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
      "INSERT INTO content_nodes (tenant_id, generation, stable_id, slug, title, kind, position, status)" +
        " VALUES ($1, 1, 'n', 'n', 'N', 'document', 1, 'published')",
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
});
