/**
 * The takedown write plane, and the manifest that carries a denial to the site.
 *
 * Two halves of one finding. The denial mechanism was complete on the serving
 * side and had no door: the only way to impose one was a superuser psql prompt,
 * with no row proving who did it. And because it lived only in the database,
 * the site kept publishing a withdrawn document — `llms.txt` included.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool } from "./db.js";
import { grantIngest } from "./grant.js";
import {
  applyTakedown,
  denylistManifest,
  listTakedowns,
  readLedger,
  revokeTakedown,
} from "./takedown-ops.js";
import { applySchema } from "./schema.js";
import type { ContentInstance } from "./instance.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_takedown_ops_test";
const TENANT = "takedown-corp";

const instance: ContentInstance = {
  name: TENANT,
  corpusId: TENANT,
  tenantId: TENANT,
  dsnEnv: "KSOR_DB_URL",
  abstain: { vectorFloor: null, keywordFloor: null },
  maximumResponseCharacters: 120_000,
  instructions: "",
  audiences: [],
  defaultVisibility: null,
  embeddingProvider: "fake",
  embeddingModel: "fake-embed-001",
  embeddingDim: 1536,
};

describe.runIf(adminDsn !== "")("takedown write plane (db)", () => {
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
    await grantIngest(pool, TENANT);
    await pool.query(
      "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 1)",
      [TENANT],
    );
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("denies a node through the ingest role — no superuser psql required", async () => {
    const out = await applyTakedown(pool, instance, {
      stableId: "knowledge/withdrawn",
      scope: "node",
      reason: "legal request 2026-08",
      actor: "ops@example.com",
    });
    expect(out.changed).toBe(true);
    expect((await listTakedowns(pool, instance)).map((r) => r.stableId)).toEqual([
      "knowledge/withdrawn",
    ]);
  });

  it("writes the §7 row that proves WHO denied it, and the ledger can be READ", async () => {
    // Both halves matter: the row exists, and a shipped role can read it back.
    // Before schema 2.3 retrieval_log had FORCE RLS, an INSERT policy, and no
    // SELECT policy or grant — write-only under every credential ksor ships.
    const rows = await readLedger(pool, instance, 10);
    const act = rows.find((r) => r.action === "takedown_applied");
    expect(act, "the act left a row").toBeDefined();
    expect(act?.actor).toBe("ops@example.com");
    expect(act?.detail.stable_id).toBe("knowledge/withdrawn");
    expect(act?.detail.reason).toBe("legal request 2026-08");
  });

  it("is idempotent, and says so rather than pretending it changed something", async () => {
    const again = await applyTakedown(pool, instance, {
      stableId: "knowledge/withdrawn",
      scope: "node",
      reason: "legal request 2026-08",
      actor: "ops@example.com",
    });
    expect(again.changed).toBe(false);
  });

  it("widening a denial to a subtree is a change, not a no-op", async () => {
    const widened = await applyTakedown(pool, instance, {
      stableId: "knowledge/withdrawn",
      scope: "subtree",
      reason: "legal request 2026-08",
      actor: "ops@example.com",
    });
    expect(widened.changed).toBe(true);
    expect((await listTakedowns(pool, instance))[0]?.scope).toBe("subtree");
  });

  it("exports a manifest the site build can read", async () => {
    const rows = await listTakedowns(pool, instance);
    const manifest = denylistManifest(TENANT, rows, new Date("2026-08-21T00:00:00Z"));
    expect(manifest.source).toBe("database");
    expect(manifest.denied).toEqual([{ stable_id: "knowledge/withdrawn", scope: "subtree" }]);
  });

  it("lifts a denial and records THAT act too", async () => {
    const lifted = await revokeTakedown(pool, instance, {
      stableId: "knowledge/withdrawn",
      actor: "ops@example.com",
    });
    expect(lifted.changed).toBe(true);
    expect(await listTakedowns(pool, instance)).toEqual([]);
    const rows = await readLedger(pool, instance, 20);
    expect(
      rows.some((r) => r.detail.change === "revoked"),
      "the lift is on the record",
    ).toBe(true);
  });

  it("lifting something that was never denied is honest about it", async () => {
    const none = await revokeTakedown(pool, instance, {
      stableId: "knowledge/never",
      actor: "ops@example.com",
    });
    expect(none.changed).toBe(false);
  });
});

describe.runIf(adminDsn === "")("takedown write plane (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
