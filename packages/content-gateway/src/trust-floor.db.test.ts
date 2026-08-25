/**
 * The trust floor, as a caller and a deployment can both name it.
 *
 * `ServiceContext.minTrustTier` was a seam nothing on the wire could reach: a
 * record could carry `verified` and an agent had no way to say "answer me only
 * from what a human reviewed". This drives the TOOL, through real Postgres,
 * because the floor is an arm predicate in SQL — a JS filter over the hits
 * would pass a shape test and still let a lower-tier passage decide what the
 * answer was by ranking above the ones that survive.
 *
 * The rule under test is the one that is easy to get backwards: configuration
 * may TIGHTEN and never loosen. A door configured for `human-reviewed` must not
 * be talked down to `unverified` by an argument, and a door configured for
 * `unverified` must still honour a caller asking for more.
 */

import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applySchema,
  buildShippedProvider,
  contentPool,
  embedInput,
  embedIntent,
  keyRingFromEnv,
  runIngest,
  vectorLiteral,
  type ContentInstance,
  type EmbeddingProvider,
  type ServiceContext,
  type TrustTier,
} from "@panaversity/ksor-content";

import { searchHandler, type SearchArgs } from "./tools.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;
const TENANT = "trust-corp";
const QUERY = "how are compensation bands reviewed";

/** One document per tier, all public, all stable, all about the same thing. */
const DOCS = [
  {
    stableId: "policies/human-reviewed",
    slug: "human-reviewed",
    title: "Compensation bands, reviewed by a person",
    tier: 2,
    verified: [{ by: "human:kim", at: "2026-08-22T09:00:00Z" }],
    content:
      "Compensation bands are reviewed every fiscal year by the compensation committee and published to all staff.",
  },
  {
    stableId: "policies/machine-confirmed",
    slug: "machine-confirmed",
    title: "Compensation bands, confirmed by a process",
    tier: 1,
    verified: [{ by: "process:nightly-finance", at: "2026-08-22T09:00:00Z" }],
    content:
      "Compensation band figures are confirmed nightly against the finance ledger and published to all staff.",
  },
  {
    stableId: "policies/unverified",
    slug: "unverified",
    title: "Compensation bands, unverified",
    tier: 0,
    verified: null,
    content:
      "Compensation bands for every level are listed here and reviewed whenever the committee meets.",
  },
] as const;

describe.runIf(adminDsn !== "")("the trust floor on `search` (db)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;
  let instance: ContentInstance;
  let provider: EmbeddingProvider;

  /** A door serving the whole public record at the configured floor. */
  const doorAt = (configured: TrustTier | number | undefined): ServiceContext => ({
    pool,
    instance,
    ring: keyRingFromEnv(undefined),
    instanceDigest: "trust-floor-suite",
    embedQuery: async (query: string) => {
      const [vector] = await embedIntent([query], { provider, intent: "query" });
      return vectorLiteral(vector ?? []);
    },
    viewer: ["public"],
    ...(configured === undefined ? {} : { minTrustTier: configured }),
  });

  /** Call the TOOL, the way the registration does, and read the slugs back. */
  const slugsFrom = async (
    ctx: ServiceContext,
    args: Omit<SearchArgs, "query" | "k"> = {},
  ): Promise<string[]> => {
    const reply = await searchHandler(ctx)({ query: QUERY, k: 10, ...args });
    const body = reply.structuredContent as { ok: boolean; hits?: { slug: string }[] };
    expect(reply.isError, JSON.stringify(reply)).not.toBe(true);
    return (body.hits ?? []).map((h) => h.slug).sort();
  };

  beforeAll(async () => {
    dbName = `ksor_trust_${randomBytes(4).toString("hex")}`;
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

    provider = buildShippedProvider("fake", { apiKey: null, dim: DIM });
    await runIngest(pool, TENANT, async (c) => {
      await c.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 1)",
        [TENANT],
      );
      for (const doc of DOCS) {
        const node = await c.query(
          `INSERT INTO content_nodes (tenant_id, generation, stable_id, corpus_id, kind, slug, title,
                                      audience, doc_status, trust_tier, verified, approval, generated,
                                      effective_from, stale_after)
           VALUES ($1, 1, $2, $1, 'document', $3, $4, ARRAY['public'], 'stable', $5, $6::jsonb, $7::jsonb,
                   $8::jsonb, '2026-08-21T00:00:00Z', NULL) RETURNING node_id`,
          [
            TENANT,
            doc.stableId,
            doc.slug,
            doc.title,
            doc.tier,
            doc.verified === null ? null : JSON.stringify(doc.verified),
            JSON.stringify({ by: "human:cfo", at: "2026-08-21T09:00:00Z" }),
            JSON.stringify({ by: "fixture/1", at: "2026-08-20T09:00:00Z" }),
          ],
        );
        await c.query(
          `INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path,
                                content_hash, embedding_model, chunk_policy)
           VALUES ($1, 1, $2, $3, $4, $2, 'hash', 'fake-embed-001', 'heading-aware-1500-content-only-v6')`,
          [TENANT, `${doc.slug}:prose`, node.rows[0].node_id, doc.title],
        );
        const [vector] = await embedIntent([embedInput(doc.title, "", doc.content)], {
          provider,
          intent: "document",
        });
        await c.query(
          `INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content, chunk_hash,
                               labels, embedding, embedding_status, embedding_model)
           VALUES ($1, 1, $2, 0, $3, md5($3), '{"source_type": "prose"}', $4, 'embedded', 'fake-embed-001')`,
          [TENANT, `${doc.slug}:prose`, doc.content, vectorLiteral(vector ?? [])],
        );
      }
    });

    instance = {
      name: TENANT,
      corpusId: TENANT,
      tenantId: TENANT,
      title: "Trust corp",
      description: "The trust-floor record.",
      toolchain: null,
      dsnEnv: "KSOR_DB_URL",
      // No declared floor: this suite is about the TRUST floor, and a cosine
      // gate would decide membership before the trust arm ever ran.
      abstain: { vectorFloor: null, keywordFloor: null, floorDigest: null },
      textSearchConfig: "english",
      maximumResponseCharacters: 120_000,
      instructions: "",
      embeddingProvider: "fake",
      embeddingModel: "fake-embed-001",
      embeddingDim: DIM,
    };
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (admin !== undefined) {
      if (dbName !== undefined)
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
  });

  it("defaults to unverified — an argument-less call sees every tier", async () => {
    expect(await slugsFrom(doorAt(undefined))).toEqual([
      "human-reviewed",
      "machine-confirmed",
      "unverified",
    ]);
  });

  it("honours a caller's floor: machine-confirmed drops the unverified document", async () => {
    expect(await slugsFrom(doorAt(undefined), { min_trust_tier: "machine-confirmed" })).toEqual([
      "human-reviewed",
      "machine-confirmed",
    ]);
  });

  it("human-reviewed is never satisfied by a machine-confirmed hit, under ANY configuration", async () => {
    // The claim decision 26 makes about this tool, asserted across the whole
    // configuration space rather than at one convenient point.
    for (const configured of [
      undefined,
      "unverified",
      "machine-confirmed",
      "human-reviewed",
    ] as const) {
      const slugs = await slugsFrom(doorAt(configured), { min_trust_tier: "human-reviewed" });
      expect(slugs, `configured floor ${String(configured)}`).toEqual(["human-reviewed"]);
    }
  });

  it("configuration TIGHTENS and never loosens — a lower request gets the deployment's floor", async () => {
    // The half that is easy to get backwards: `Math.max`, not "the argument wins".
    expect(
      await slugsFrom(doorAt("human-reviewed"), { min_trust_tier: "unverified" }),
      "a door configured for human-reviewed cannot be talked down by an argument",
    ).toEqual(["human-reviewed"]);
    expect(
      await slugsFrom(doorAt("machine-confirmed")),
      "the deployment's floor applies when the caller names none",
    ).toEqual(["human-reviewed", "machine-confirmed"]);
  });
});

describe.runIf(adminDsn === "")("the trust floor on `search` (gated)", () => {
  it("skipped — set KSOR_DB_URL to run the trust-floor walk", () => {
    expect(adminDsn).toBe("");
  });
});
