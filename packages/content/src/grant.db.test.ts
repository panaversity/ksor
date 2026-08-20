/**
 * Acceptance for `ksor grant` (specs/ksor/grant/spec.md), written red-first.
 *
 * The test is the ROUND TRIP, not the row: a grant must make a previously
 * refused ingest succeed, and a revoke must make it refused again. Counting
 * rows would pass on a verb that wrote the right row to the wrong place.
 */

import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest } from "./db.js";
import { applySchema } from "./schema.js";
import { grantIngest, revokeIngest, type GrantOutcome } from "./grant.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;
const TENANT = "acme-grant";

/** The act the grant authorizes: a write into the tenant's corpus. */
async function ingestAllowed(pool: pg.Pool): Promise<boolean> {
  try {
    await runIngest(pool, TENANT, async (c) => {
      await c.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 1) ON CONFLICT DO NOTHING",
        [TENANT],
      );
    });
    return true;
  } catch {
    return false;
  }
}

describe.runIf(adminDsn !== "")("ksor grant — acceptance", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;

  beforeAll(async () => {
    dbName = `ksor_grant_${randomBytes(4).toString("hex")}`;
    admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminDsn);
    url.pathname = `/${dbName}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, DIM);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (admin !== undefined) {
      if (dbName !== undefined)
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
  }, 60_000);

  it("authorizes a refused ingest, and revoking refuses it again", async () => {
    // Before: row-level security refuses the write — no grant row exists.
    expect(await ingestAllowed(pool), "ingest must be refused before the grant").toBe(false);

    const granted: GrantOutcome = await grantIngest(pool, TENANT);
    expect(granted, "the first grant establishes authorization").toBe("granted");
    expect(await ingestAllowed(pool), "the grant must authorize the write").toBe(true);

    const revoked: GrantOutcome = await revokeIngest(pool, TENANT);
    expect(revoked, "the first revoke withdraws it").toBe("revoked");
    expect(await ingestAllowed(pool), "revoking must refuse the write again").toBe(false);
  }, 120_000);

  it("is idempotent in both directions, reporting the state it found", async () => {
    // Re-running must be safe and HONEST: a second grant is not an error and
    // not a silent "ok" — it says the authorization was already there.
    await grantIngest(pool, TENANT);
    expect(await grantIngest(pool, TENANT), "granting twice").toBe("already-granted");
    expect(await ingestAllowed(pool), "still authorized after a repeat grant").toBe(true);

    await revokeIngest(pool, TENANT);
    expect(await revokeIngest(pool, TENANT), "revoking twice").toBe("not-granted");
    expect(await ingestAllowed(pool), "still refused after a repeat revoke").toBe(false);
  }, 120_000);
});

describe.runIf(adminDsn === "")("ksor grant — acceptance (gated)", () => {
  it("skipped — set KSOR_DB_URL to run against Postgres", () => {
    expect(adminDsn).toBe("");
  });
});
