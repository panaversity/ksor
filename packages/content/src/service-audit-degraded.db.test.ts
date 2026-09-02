/**
 * Issue #150 — logRead's return is discarded at all four serving call sites,
 * so an answer served without its §7 audit row is indistinguishable from one
 * with it. The shedding under saturation is correct (availability over
 * audit); only the silence is the defect.
 *
 * FOUR call sites write that row — search's hit arm, search's abstained arm,
 * `readDocument` and `outlineDocuments` — and the first version of this file
 * asserted one of them. A signal that three of four arms could drop while the
 * suite stayed green is the shape this codebase keeps finding (decision 18),
 * so every arm is driven here, on one fixture, in both states:
 *   - `audit: "degraded"` while the retrieval_log INSERT is revoked from the
 *     serving role (audit-under-saturation, without saturating the pool)
 *   - no `audit` field once the grant is restored and the row lands
 *
 * Seeding follows kernel.db.test.ts's proven shape: schema at a test
 * dimension, one document ingested through the real ingest role (grant
 * table + RLS enforced), read back through the real service functions.
 * The gateway's half — that all three output schemas PARSE the field the
 * handlers emit — is `content-gateway/src/audit-degraded.db.test.ts`.
 */

import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, RUNTIME_ROLE, runIngest } from "./db.js";
import { applySchema } from "./schema.js";
import { GATE_PREDICATE_DIGEST } from "./lib/search.js";
import { keyRingFromEnv } from "./lib/snapshot.js";
import { outlineDocuments, readDocument, search, type ServiceContext } from "./service.js";
import type { ContentInstance } from "./instance.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;
const TENANT = "audit-corp";
const CORPUS = "audit-corp-handbook";
const QUERY = "zebra compensation bands";

const PAD = " filler content well beyond the twenty-four character servable floor.";

/** A hand-normalized unit vector: 1 at `hot`, small elsewhere — kernel.db.test.ts's shape. */
function unit(hot: number): number[] {
  const v = Array.from({ length: DIM }, (_, i) => (i === hot ? 1 : 0.01));
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

describe.runIf(adminDsn !== "")("the audit-degraded signal on every serving arm (db)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;
  /** No floor: every search answers, through the hit arm. */
  let ctx: ServiceContext;
  /** A calibrated floor the query cannot reach: every search abstains. */
  let abstaining: ServiceContext;

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
    abstaining = {
      ...ctx,
      instance: {
        ...instance,
        // Measured under THIS door's predicate, so the gate is trusted — and
        // set where a near-orthogonal query (cosine ≈ 0.02) cannot reach it.
        abstain: { vectorFloor: 0.9, keywordFloor: null, floorDigest: GATE_PREDICATE_DIGEST },
      },
      embedQuery: async () => unit(DIM - 1),
    };
  }, 180_000);

  afterAll(async () => {
    await pool?.query(`GRANT INSERT ON retrieval_log TO ${RUNTIME_ROLE}`).catch(() => undefined);
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  /** The four arms, each answering with the envelope that carries `audit`. */
  const arms = {
    "search (hit arm)": async () => {
      const result = await search(ctx, QUERY, 5);
      expect(result.ok, JSON.stringify(result)).toBe(true);
      expect(result.abstained, "the hit arm must answer, not abstain").toBe(false);
      return result;
    },
    "search (abstained arm)": async () => {
      const result = await search(abstaining, QUERY, 5);
      // An abstention is `ok: false, abstained: true` — a correct answer, not
      // an error, and the one arm whose §7 row records what it declined.
      expect(result.ok, JSON.stringify(result)).toBe(false);
      expect(result.abstained, "the floor must abstain this query").toBe(true);
      return result;
    },
    readDocument: async () => {
      const result = await readDocument(ctx, "zebra");
      expect(result.slug, JSON.stringify(result)).toBe("zebra");
      return result;
    },
    outlineDocuments: async () => {
      const result = await outlineDocuments(ctx, { limit: 10 });
      expect(result.nodes.length, JSON.stringify(result)).toBeGreaterThan(0);
      return result;
    },
  } as const;
  const armNames = Object.keys(arms) as (keyof typeof arms)[];

  describe("while the §7 row cannot be written", () => {
    beforeAll(async () => {
      await pool.query(`REVOKE INSERT ON retrieval_log FROM ${RUNTIME_ROLE}`);
    });
    afterAll(async () => {
      await pool.query(`GRANT INSERT ON retrieval_log TO ${RUNTIME_ROLE}`);
    });

    it.each(armNames)('%s carries audit: "degraded" and still answers', async (arm) => {
      const result = await arms[arm]();
      expect(result.audit, `${arm} answered ${JSON.stringify(result)}`).toBe("degraded");
    });
  });

  describe("once the row lands normally", () => {
    it.each(armNames)("%s carries no audit field", async (arm) => {
      const result = await arms[arm]();
      expect(result.audit, `${arm} answered ${JSON.stringify(result)}`).toBeUndefined();
    });

    it("wrote one §7 row per arm, which is what 'landed' means", async () => {
      // Not a shape assertion: the field's absence is only honest if a row
      // exists. Read as the DSN's owner, outside any serving role.
      const { rows } = await pool.query<{ action: string; n: number }>(
        `SELECT action, count(*)::int AS n FROM retrieval_log GROUP BY action ORDER BY action`,
      );
      // The four arms above ran once each in this block; the degraded block
      // wrote nothing, which is the whole point of the revoke.
      expect(Object.fromEntries(rows.map((r) => [r.action, r.n]))).toEqual({
        content_served: 1,
        outline_served: 1,
        search_abstained: 1,
        similarity_searched: 1,
      });
    });
  });
});
