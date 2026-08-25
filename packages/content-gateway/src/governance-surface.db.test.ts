/**
 * What the door SAYS about a hit's governance, and what it ENFORCES.
 *
 * Two halves of one guarantee, on one fixture: every hit carries the
 * governance its document declared (status, trust tier, the latest
 * verification, effectivity, and an approval that says what it was checked
 * against), and the trust floor decides which hits exist at all.
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

/** The half of a hit this suite is about. */
interface WireHit {
  readonly slug: string;
  readonly governance: {
    readonly status: string;
    readonly trust_tier: string;
    readonly verified: { readonly by: string; readonly at: string } | null;
    readonly effective_from: string | null;
    readonly stale_after: string | null;
    readonly approval: {
      readonly by: string;
      readonly at: string;
      readonly checked: string;
    } | null;
  };
}

describe.runIf(adminDsn !== "")("the governance surface of `search` (db)", () => {
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

  /** Call the TOOL, the way the registration does. */
  const searchAs = async (
    ctx: ServiceContext,
    args: Omit<SearchArgs, "query" | "k"> = {},
  ): Promise<{ ok: boolean; hits?: WireHit[] }> => {
    const reply = await searchHandler(ctx)({ query: QUERY, k: 10, ...args });
    expect(reply.isError, JSON.stringify(reply)).not.toBe(true);
    return reply.structuredContent as { ok: boolean; hits?: WireHit[] };
  };

  const slugsFrom = async (
    ctx: ServiceContext,
    args: Omit<SearchArgs, "query" | "k"> = {},
  ): Promise<string[]> => ((await searchAs(ctx, args)).hits ?? []).map((h) => h.slug).sort();

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

  it("carries every hit's governance — status, tier, verification, effectivity, approval", async () => {
    // Governance travels WITH the passage, not on the envelope: an agent
    // deciding whether to rely on a sentence is deciding about the document
    // that sentence came from, and a per-response summary cannot say which of
    // several hits was the reviewed one.
    const hits = (await searchAs(doorAt(undefined))).hits ?? [];
    const byslug = new Map(hits.map((h) => [h.slug, h.governance]));

    expect(byslug.get("human-reviewed")).toEqual({
      status: "stable",
      trust_tier: "human-reviewed",
      // The acts are JSONB: the instant is the one the AUTHOR wrote, byte-exact.
      verified: { by: "human:kim", at: "2026-08-22T09:00:00Z" },
      effective_from: "2026-08-21T00:00:00.000Z",
      stale_after: null,
      // `effective_from` is a TIMESTAMPTZ column, so it is the instant Postgres
      // holds, normalised — not the authored text. The two forms are the two
      // storage shapes, and both are the same instant.
      // `checked: "policy"` is the honest half: the approver was checked
      // against the Governance Policy's authority list, and NOT yet against
      // change control (phase B). The envelope says which it is, the way
      // `gate` says whether the record can abstain at all.
      approval: { by: "human:cfo", at: "2026-08-21T09:00:00Z", checked: "policy" },
    });
    expect(byslug.get("machine-confirmed")?.trust_tier).toBe("machine-confirmed");
    expect(byslug.get("machine-confirmed")?.verified).toEqual({
      by: "process:nightly-finance",
      at: "2026-08-22T09:00:00Z",
    });
    // Unverified is a REAL state, not a missing one: the tier is named and the
    // verification is null. Reporting it as absent would let an agent read
    // "unknown" where the record says "nobody has reviewed this".
    expect(byslug.get("unverified")?.trust_tier).toBe("unverified");
    expect(byslug.get("unverified")?.verified).toBeNull();
  });

  it("reports the LATEST verification when a document carries several", async () => {
    await pool.query(
      "UPDATE content_nodes SET verified = $2::jsonb WHERE tenant_id = $1 AND slug = 'unverified'",
      [
        TENANT,
        JSON.stringify([
          { by: "process:old", at: "2026-01-02T00:00:00Z" },
          { by: "process:newest", at: "2026-06-01T00:00:00Z" },
          { by: "process:middle", at: "2026-03-04T00:00:00Z" },
        ]),
      ],
    );
    try {
      const hits = (await searchAs(doorAt(undefined))).hits ?? [];
      const hit = hits.find((h) => h.slug === "unverified");
      // Authored order is not chronological order, and the newest act is the
      // one that says how current the review is.
      expect(hit?.governance.verified).toEqual({
        by: "process:newest",
        at: "2026-06-01T00:00:00Z",
      });
    } finally {
      await pool.query(
        "UPDATE content_nodes SET verified = NULL WHERE tenant_id = $1 AND slug = 'unverified'",
        [TENANT],
      );
    }
  });

  it("records the SCOPE of every act in retrieval_log — and never its content", async () => {
    // R20/§8.3.1: the trail must say what the act was allowed to see, or an
    // auditor cannot tell a public answer from an internal one after the fact.
    // And it must stay a trail: telemetry that carried the passages back would
    // be a second, ungoverned copy of the record — one with no audience
    // predicate, no takedown seam and no generation pointer.
    await pool.query("DELETE FROM retrieval_log WHERE tenant_id = $1", [TENANT]);
    await searchAs(doorAt("machine-confirmed"), { min_trust_tier: "human-reviewed" });

    const rows = await pool.query<{
      action: string;
      generation: string | null;
      detail: Record<string, unknown>;
    }>(
      "SELECT action, generation, detail FROM retrieval_log WHERE tenant_id = $1 ORDER BY created_at",
      [TENANT],
    );
    expect(rows.rows.length, JSON.stringify(rows.rows)).toBe(1);
    const row = rows.rows[0]!;
    expect(row.action).toBe("similarity_searched");
    expect(row.generation, "the generation the act answered from").toBe("1");
    expect(row.detail["audience"]).toEqual(["public"]);
    // The floor that ACTUALLY applied, not the one the caller asked for: the
    // deployment's is machine-confirmed, the request raised it to
    // human-reviewed, and the row has to say which one decided the answer.
    expect(row.detail["min_trust_tier"]).toBe("human-reviewed");
    expect(row.detail["abstained"]).toBe(false);
    expect(row.detail["result_count"]).toBe(1);

    const serialized = JSON.stringify(row.detail);
    // The query text and the passages, by the two things they would contain.
    expect(serialized).not.toContain("compensation");
    expect(serialized).not.toContain(QUERY);
  });

  it("an abstention records the same scope, and says it abstained", async () => {
    // A floor nothing in the record satisfies: the arms return nothing, so the
    // honest answer is the abstention — and the row has to say that, or an
    // operator reading the trail cannot tell "we declined" from "we answered".
    await pool.query("UPDATE content_nodes SET trust_tier = 0 WHERE tenant_id = $1", [TENANT]);
    try {
      await pool.query("DELETE FROM retrieval_log WHERE tenant_id = $1", [TENANT]);
      const body = await searchAs(doorAt(undefined), { min_trust_tier: "human-reviewed" });
      expect(body.ok, JSON.stringify(body)).toBe(false);

      const rows = await pool.query<{ action: string; detail: Record<string, unknown> }>(
        "SELECT action, detail FROM retrieval_log WHERE tenant_id = $1 ORDER BY created_at",
        [TENANT],
      );
      const row = rows.rows[0]!;
      expect(row.action).toBe("search_abstained");
      expect(row.detail["audience"]).toEqual(["public"]);
      expect(row.detail["min_trust_tier"]).toBe("human-reviewed");
      expect(row.detail["abstained"]).toBe(true);
      expect(row.detail["result_count"]).toBe(0);
      expect(JSON.stringify(row.detail)).not.toContain("compensation");
    } finally {
      await pool.query(
        "UPDATE content_nodes SET trust_tier = CASE slug WHEN 'human-reviewed' THEN 2 WHEN 'machine-confirmed' THEN 1 ELSE 0 END WHERE tenant_id = $1",
        [TENANT],
      );
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

describe.runIf(adminDsn === "")("the governance surface of `search` (gated)", () => {
  it("skipped — set KSOR_DB_URL to run the governance-surface walk", () => {
    expect(adminDsn).toBe("");
  });
});
