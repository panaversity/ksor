/**
 * Issue #150 — logRead's return is discarded at all four serving call sites,
 * so an answer served without its §7 audit row is indistinguishable from one
 * with it. The shedding under saturation is correct (availability over
 * audit); only the silence is the defect.
 *
 * This asserts search's `audit` field is:
 *   - "degraded" when the retrieval_log write is refused (INSERT revoked
 *     from the serving role, simulating audit-under-saturation without
 *     needing to actually saturate the pool)
 *   - absent when the write lands normally
 *
 * Seeding follows kernel.db.test.ts's proven shape: schema at a test
 * dimension, one document ingested through the real ingest role (grant
 * table + RLS enforced), read back through the real service function.
 */

import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, RUNTIME_ROLE, runIngest } from "./db.js";
import { applySchema } from "./schema.js";
import { keyRingFromEnv } from "./lib/snapshot.js";
import { search, type ServiceContext } from "./service.js";
import type { ContentInstance } from "./instance.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;
const TENANT = "audit-corp";
const CORPUS = "audit-corp-handbook";

const PAD = " filler content well beyond the twenty-four character servable floor.";

/** A hand-normalized unit vector: 1 at `hot`, small elsewhere — kernel.db.test.ts's shape. */
function unit(hot: number): number[] {
  const v = Array.from({ length: DIM }, (_, i) => (i === hot ? 1 : 0.01));
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

describe.runIf(adminDsn !== "")("search's audit-degraded signal (db)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;
  let ctx: ServiceContext;

  beforeAll(async () => {
    dbName = `ksor_audit_degraded_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
    admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminDsn);
    url.pathname = `/${dbName}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, DIM);

    await pool.query(
      "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', $1)",
      [TENANT],
    );

    await runIngest(pool, TENANT, async (c) => {
      await c.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $2, 1)",
        [TENANT, CORPUS],
      );
      const r = await c.query(
        `INSERT INTO content_nodes (tenant_id, generation, stable_id, kind, slug, title, status,
             audience, doc_status)
         VALUES ($1, 1, 'doc/zebra', 'document', 'zebra', 'zebra', 'published',
                 ARRAY['public'], 'stable') RETURNING node_id`,
        [TENANT],
      );
      const nodeId = String(r.rows[0].node_id);
      await c.query(
        `INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path,
                              content_hash, embedding_model, chunk_policy)
         VALUES ($1, 1, 'zebra:prose', $2, 'zebra:prose', 'zebra:prose', 'hash', 'fake-embed-001',
                 'heading-aware-1500-content-only-v5')`,
        [TENANT, nodeId],
      );
      await c.query(
        `INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content, chunk_hash,
                             labels, embedding, embedding_status, embedding_model)
         VALUES ($1, 1, 'zebra:prose', 0, $2, md5($2), '{"source_type": "prose"}', $3::vector,
                 'embedded', 'fake-embed-001')`,
        [TENANT, "Zebra compensation bands are reviewed yearly." + PAD, `[${unit(0).join(",")}]`],
      );
    });

    const ring = keyRingFromEnv("k1=test-secret");
    const instance: ContentInstance = {
      name: CORPUS,
      corpusId: CORPUS,
      tenantId: TENANT,
      dsnEnv: "KSOR_DB_URL",
      abstain: { vectorFloor: null, keywordFloor: null, floorDigest: null },
      textSearchConfig: "english",
      maximumResponseCharacters: 120_000,
      instructions: "Answer only from the record.",
      title: CORPUS,
      description: "The audit-degraded test record.",
      toolchain: null,
      embeddingProvider: "fake",
      embeddingModel: "fake-embed-001",
      embeddingDim: DIM,
    };
    ctx = {
      pool,
      instance,
      ring,
      instanceDigest: "digest-1",
      embedQuery: async () => unit(0),
    };
  }, 180_000);

  afterAll(async () => {
    await pool?.query(`GRANT INSERT ON retrieval_log TO ${RUNTIME_ROLE}`).catch(() => undefined);
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it('carries audit: "degraded" when the §7 row could not be written', async () => {
    await pool.query(`REVOKE INSERT ON retrieval_log FROM ${RUNTIME_ROLE}`);
    try {
      const result = await search(ctx, "zebra compensation bands", 5);
      // The shedding stays: the answer still arrives.
      expect(result.ok, JSON.stringify(result)).toBe(true);
      expect(result.audit).toBe("degraded");
    } finally {
      await pool.query(`GRANT INSERT ON retrieval_log TO ${RUNTIME_ROLE}`);
    }
  });

  it("carries no audit field when the row lands normally", async () => {
    const result = await search(ctx, "zebra compensation bands", 5);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.audit).toBeUndefined();
  });
});
