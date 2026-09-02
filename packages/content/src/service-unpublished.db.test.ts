/**
 * README.md promises `reason: "unpublished"` on a record nothing has been
 * ingested into. `search` embedded the query BEFORE asking whether anything was
 * published, so with the provider down an EMPTY record reported the provider's
 * outage (`unavailable`) instead of its own emptiness — and with the provider
 * up, it was paid for a question no row could ever match. The emptiness must
 * be asked first, and the provider never asked at all (found live,
 * 2026-09-02).
 *
 * Seeding follows service-audit-degraded.db.test.ts's proven shape: schema at
 * a test dimension, the real service function, a hand-built context.
 */

import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest } from "./db.js";
import { applySchema } from "./schema.js";
import { keyRingFromEnv } from "./lib/snapshot.js";
import { search, type ServiceContext } from "./service.js";
import type { ContentInstance } from "./instance.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;
const TENANT = "unpublished-corp";
const CORPUS = "unpublished-corp-handbook";

describe.runIf(adminDsn !== "")("search on a record with nothing published (db)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;
  let ctx: ServiceContext;
  /** How many times the provider was asked to embed — the number this suite exists to hold at 0. */
  let embedCalls = 0;

  beforeAll(async () => {
    dbName = `ksor_unpublished_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
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
      description: "The never-ingested test record.",
      toolchain: null,
      embeddingProvider: "fake",
      embeddingModel: "fake-embed-001",
      embeddingDim: DIM,
    };
    ctx = {
      pool,
      instance,
      ring: keyRingFromEnv("k1=test-secret"),
      instanceDigest: "digest-1",
      // A provider that is DOWN: the state a first-hour walk with a rejected
      // key is in, and the state that used to mask the record's emptiness.
      embedQuery: async () => {
        embedCalls += 1;
        throw new Error("provider unreachable");
      },
    };
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it('answers reason: "unpublished" — not the provider\'s outage — and never asks the provider', async () => {
    // No corpora row at all: the record was provisioned and never ingested,
    // which is where `ksor init`'s next steps leave an adopter who skipped
    // `refresh`.
    const result = await search(ctx, "how long does a buyer have to send something back", 5);
    // Emptiness is not an abstention: the record did not decline, it has nothing.
    expect(result, JSON.stringify(result)).toMatchObject({
      ok: false,
      reason: "unpublished",
      abstained: false,
      hits: [],
    });
    expect(embedCalls, "the provider must not be asked about a record with no rows").toBe(0);
  });

  it("asks the provider once a generation IS active — the order is published, then embed", async () => {
    await runIngest(pool, TENANT, (c) =>
      c.query("INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $2, 1)", [
        TENANT,
        CORPUS,
      ]),
    );
    const result = await search(ctx, "how long does a buyer have to send something back", 5);
    expect(embedCalls, "a published record's query is embedded").toBe(1);
    // …and with the provider down, THAT is now the honest reason.
    expect(result, JSON.stringify(result)).toMatchObject({ ok: false, reason: "unavailable" });
  });
});
