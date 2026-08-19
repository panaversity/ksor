/**
 * The kernel's database acceptance: the verbatim schema applied at a test
 * dimension, seeded through the ingest role (RLS + grant table enforced for
 * real), and read back through the one-statement hybrid search with the
 * HNSW GUCs bound — the same walk production takes. Gated on KSOR_DB_URL
 * (CI: pgvector service container; dev: local Postgres or a throwaway
 * Neon).
 */

import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest, runRead } from "./db.js";
import {
  applySchema,
  assertSchemaCompatible,
  schemaVersion,
  SchemaVersionError,
} from "./schema.js";
import { hybridSearch, keywordSearch, VECTOR_TXN_GUCS, type SearchScope } from "./lib/search.js";
import { vectorAbstains } from "./lib/abstain.js";
import { keyRingFromEnv, validate } from "./lib/snapshot.js";
import { search, type ServiceContext } from "./service.js";
import type { ContentInstance } from "./instance.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;
const TENANT = "acme";
const CORPUS = "acme-handbook";

const scope: SearchScope = {
  tenantId: TENANT,
  corpusId: CORPUS,
  kinds: null,
  pinnedGeneration: null,
};

/** A hand-normalized unit vector: 1 at `hot`, small elsewhere. */
function unit(hot: number): number[] {
  const v = Array.from({ length: DIM }, (_, i) => (i === hot ? 1 : 0.01));
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

const PAD = " filler content well beyond the twenty-four character servable floor.";

describe.runIf(adminDsn !== "")("kernel db acceptance", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;

  beforeAll(async () => {
    dbName = `ksor_t_${randomBytes(4).toString("hex")}`;
    admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminDsn);
    url.pathname = `/${dbName}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, DIM);
    // The grant table row is the ingest AUTHORIZATION (a CLI flag is not
    // authorization). The policy checks current_user AFTER the SET LOCAL
    // ROLE pin, so the row names the ingest role itself (found live: seeding
    // it with the admin user's name refused every write, 2026-08-19).
    await pool.query(
      "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', $1)",
      [TENANT],
    );

    await runIngest(pool, TENANT, async (c) => {
      await c.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $2, 1)",
        [TENANT, CORPUS],
      );
      const node = async (
        stableId: string,
        slug: string,
        status = "published",
      ): Promise<string> => {
        const r = await c.query(
          `INSERT INTO content_nodes (tenant_id, generation, stable_id, kind, slug, title, status)
           VALUES ($1, 1, $2, 'document', $3, $4, $5) RETURNING node_id`,
          [TENANT, stableId, slug, slug, status],
        );
        return String(r.rows[0].node_id);
      };
      const source = async (nodeId: string, sourceId: string): Promise<void> => {
        await c.query(
          `INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path,
                                content_hash, embedding_model, chunk_policy)
           VALUES ($1, 1, $2, $3, $2, $2, 'hash', 'fake-embed-001', 'heading-aware-1500-content-only-v5')`,
          [TENANT, sourceId, nodeId],
        );
      };
      const chunk = async (
        sourceId: string,
        ordinal: number,
        content: string,
        embedding: number[] | null,
      ): Promise<void> => {
        await c.query(
          `INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content, chunk_hash,
                               labels, embedding, embedding_status, embedding_model)
           VALUES ($1, 1, $2, $3, $4, md5($4), '{"source_type": "prose"}', $5, $6, 'fake-embed-001')`,
          [
            TENANT,
            sourceId,
            ordinal,
            content,
            embedding === null ? null : `[${embedding.join(",")}]`,
            embedding === null ? "pending" : "embedded",
          ],
        );
      };

      const zebra = await node("doc/zebra", "zebra");
      await source(zebra, "zebra:prose");
      await chunk("zebra:prose", 0, "Zebra compensation bands are reviewed yearly." + PAD, unit(0));

      const yak = await node("doc/yak", "yak");
      await source(yak, "yak:prose");
      await chunk("yak:prose", 0, "Yak onboarding checklist for new engineers." + PAD, unit(3));
      // A pending chunk must never serve, whatever its text matches.
      await chunk("yak:prose", 1, "Yak secret pending chunk about zebra bands." + PAD, null);

      const draft = await node("doc/draft", "draft-doc", "draft");
      await source(draft, "draft:prose");
      await chunk("draft:prose", 0, "Draft zebra policy nobody approved yet." + PAD, unit(0));
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (admin !== undefined) {
      if (dbName !== undefined)
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
  }, 60_000);

  it("hybrid search fuses both arms and carries the abstention signal out of the same walk", async () => {
    const { hits, topCosine } = await runRead(
      pool,
      TENANT,
      (c) => hybridSearch(c, scope, unit(0), "zebra compensation bands", 10),
      VECTOR_TXN_GUCS,
    );
    expect(hits.length, JSON.stringify(hits.map((h) => h.slug))).toBeGreaterThan(0);
    expect(hits[0]?.slug, "vector+keyword agreement must rank zebra first").toBe("zebra");
    expect(topCosine, "top cosine is the vector arm's own top-1").toBeGreaterThan(0.99);
    expect(hits[0]?.generation).toBe(1);
    expect(typeof hits[0]?.score).toBe("number");
    // A calibrated floor between the two arms' separations gates correctly.
    expect(vectorAbstains(topCosine, { vectorFloor: 0.9, keywordFloor: null })).toBe(false);
  });

  it("a far query abstains under a calibrated floor — and the draft and pending chunks never surface", async () => {
    const query = unit(6);
    const { hits, topCosine } = await runRead(
      pool,
      TENANT,
      (c) => hybridSearch(c, scope, query, "quantum blockchain weather", 10),
      VECTOR_TXN_GUCS,
    );
    const slugs = hits.map((h) => h.slug);
    expect(slugs, `draft leaked: ${slugs.join(",")}`).not.toContain("draft-doc");
    for (const hit of hits) {
      expect(hit.content, "pending chunk text must never serve").not.toContain("secret pending");
    }
    expect(
      vectorAbstains(topCosine, { vectorFloor: 0.9, keywordFloor: null }),
      `topCosine=${topCosine}`,
    ).toBe(true);
  });

  it("RLS fails closed: an unknown tenant reads zero rows, not an error", async () => {
    const { hits, topCosine } = await runRead(
      pool,
      "globex",
      (c) => hybridSearch(c, { ...scope, tenantId: "globex" }, unit(0), "zebra", 10),
      VECTOR_TXN_GUCS,
    );
    expect(hits, "another tenant must see nothing").toEqual([]);
    expect(topCosine).toBeNull();
  });

  it("takedown denial beats every generation, pre-fusion", async () => {
    await pool.query(
      "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, reason) VALUES ($1, $2, 'doc/zebra', 'test')",
      [TENANT, CORPUS],
    );
    try {
      const { hits } = await runRead(
        pool,
        TENANT,
        (c) => hybridSearch(c, scope, unit(0), "zebra compensation bands", 10),
        VECTOR_TXN_GUCS,
      );
      expect(
        hits.map((h) => h.slug),
        "denied node leaked",
      ).not.toContain("zebra");
    } finally {
      await pool.query("DELETE FROM takedown_denylist WHERE tenant_id = $1", [TENANT]);
    }
  });

  it("keyword-only degrade path serves without a vector", async () => {
    const hits = await runRead(pool, TENANT, (c) =>
      keywordSearch(c, scope, "onboarding checklist", 10),
    );
    expect(hits[0]?.slug, JSON.stringify(hits)).toBe("yak");
  });

  it("the service composes it into the typed envelope: served, abstained, audited", async () => {
    const ring = keyRingFromEnv("k1=test-secret");
    const instance: ContentInstance = {
      name: CORPUS,
      corpusId: CORPUS,
      tenantId: TENANT,
      dsnEnv: "KSOR_DB_URL",
      abstain: { vectorFloor: 0.9, keywordFloor: null },
      maximumResponseCharacters: 120_000,
      instructions: "Answer only from the record.",
      embeddingProvider: "fake",
      embeddingModel: "fake-embed-001",
      embeddingDim: DIM,
    };
    const ctx: ServiceContext = {
      pool,
      instance,
      ring,
      instanceDigest: "digest-1",
      embedQuery: async () => unit(0),
    };

    const served = await search(ctx, "zebra compensation bands", 5);
    expect(served.ok, JSON.stringify(served)).toBe(true);
    if (served.ok) {
      expect(served.hits[0]?.slug).toBe("zebra");
      expect(served.hits[0]?.provenance.generation, "citation carries the generation").toBe(1);
      const verdict = validate(ring, served.snapshot.token, {
        corpusId: CORPUS,
        tenantId: TENANT,
        instanceDigest: "digest-1",
      });
      expect(verdict, "the snapshot must validate and pin the generation").toEqual({
        generation: 1,
        reason: null,
      });
    }

    const far: ServiceContext = { ...ctx, embedQuery: async () => unit(6) };
    const abstainedResult = await search(far, "quantum blockchain weather", 5);
    expect(abstainedResult.ok).toBe(false);
    if (!abstainedResult.ok) {
      expect(abstainedResult.reason).toBe("abstained");
      expect(abstainedResult.hits).toEqual([]);
      expect("snapshot" in abstainedResult, "snapshot key is UNIFORM on abstention").toBe(true);
    }

    // Embed outage WITH a declared floor: the gate cannot be evaluated, so
    // the only honest answer is to ABSTAIN — serving ungated keyword results
    // would answer out-of-corpus questions during the outage (review finding
    // #5, 2026-08-19; ts_rank_cd does not separate in- from out-of-corpus).
    const down = async (): Promise<never> => {
      throw new Error("provider down");
    };
    const degraded: ServiceContext = { ...ctx, embedQuery: down };
    const outage = await search(degraded, "onboarding checklist", 5);
    expect(outage.ok, "declared floor + embed outage must fail closed").toBe(false);
    if (!outage.ok) {
      expect(outage.reason).toBe("abstained");
      expect(outage.degraded_reason).toBe("embed_unavailable_keyword_only");
    }

    // Embed outage with NO declared floor (gate already off): the keyword
    // degrade serves exactly what an uncalibrated corpus always serves.
    const uncalibrated: ServiceContext = {
      ...ctx,
      instance: { ...instance, abstain: { vectorFloor: null, keywordFloor: null } },
      embedQuery: down,
    };
    const kwServed = await search(uncalibrated, "onboarding checklist", 5);
    expect(kwServed.ok, "uncalibrated + embed outage serves keyword-only").toBe(true);
    if (kwServed.ok) {
      expect(kwServed.degraded_reason).toBe("embed_unavailable_keyword_only");
      expect(kwServed.hits[0]?.slug).toBe("yak");
    }

    // The §7 rows exist for every act above (admin read bypasses RLS).
    const rows = await pool.query(
      "SELECT action, count(*)::int AS n FROM retrieval_log GROUP BY action",
    );
    const byAction = Object.fromEntries(rows.rows.map((r) => [r.action, r.n]));
    expect(byAction["similarity_searched"], JSON.stringify(byAction)).toBeGreaterThanOrEqual(2);
    expect(byAction["search_abstained"], JSON.stringify(byAction)).toBeGreaterThanOrEqual(1);
  });

  it("ingest without a grant row is refused by the database, not by convention", async () => {
    await expect(
      runIngest(pool, "globex", async (c) => {
        await c.query(
          "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ('globex', 'g', 1)",
        );
      }),
    ).rejects.toThrowError();
  });

  it("assertSchemaCompatible refuses a database OLDER than this build (fail-closed boot)", async () => {
    // At the applied version it passes.
    await expect(assertSchemaCompatible(pool, TENANT)).resolves.toBeUndefined();
    // Simulate a stale database: an older schema_version. A newer gateway must
    // refuse to boot (SchemaVersionError → exit 3) rather than error
    // per-request on the missing takedown scope column (review 2026-08-19).
    await pool.query("UPDATE schema_meta SET schema_version = '2.0'");
    try {
      const err = await assertSchemaCompatible(pool, TENANT).catch((e: unknown) => e);
      expect(err, "must refuse the stale schema").toBeInstanceOf(SchemaVersionError);
      expect((err as Error).message).toMatch(/2\.0.*requires >= /s);
    } finally {
      await pool.query(`UPDATE schema_meta SET schema_version = '${schemaVersion()}'`);
    }
  });
});

describe.runIf(adminDsn === "")("kernel db acceptance (gated)", () => {
  it("skipped — set KSOR_DB_URL to run against Postgres + pgvector", () => {
    expect(adminDsn).toBe("");
  });
});
