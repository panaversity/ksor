/**
 * The saturation test the review asked for: a small pool under more
 * concurrent load than it has slots must SHED the excess fast (a bounded
 * PoolTimeoutError), never hang, and drain back to idle with no leaked
 * clients — the "thousands of users" axis every other db test leaves
 * uncontended. Gated on KSOR_DB_URL (its own throwaway database).
 */

import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPool, PoolTimeoutError, runScopedIn } from "./db.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";

describe.runIf(adminDsn !== "")("pool saturation", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;

  beforeAll(async () => {
    dbName = `ksor_sat_${randomBytes(4).toString("hex")}`;
    admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminDsn);
    url.pathname = `/${dbName}`;
    // max 4 slots kept warm (minSize 4), a 2s native checkout bound: with the
    // 4 connections already established, the excess sheds well inside the slow
    // query's runtime without racing a Neon cold-connect.
    // Wake the fresh database's compute with a generous one-off client first
    // (a Neon cold-connect exceeds any tight bound — that is the production
    // retry loop's job, not this test's). Then a bounded pool fills warm.
    const warm = new pg.Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 30_000,
    });
    await warm.connect();
    await warm.query("SELECT 1");
    await warm.end();
    pool = createPool(url.toString(), { maxSize: 4, minSize: 4, connectionTimeoutMs: 8_000 });
    await Promise.all(
      Array.from({ length: 4 }, () => runScopedIn(pool, {}, (c) => c.query("SELECT 1"))),
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (admin !== undefined) {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
  }, 60_000);

  it("sheds excess with a bounded PoolTimeoutError; nothing hangs; the pool drains", async () => {
    const slow = (): Promise<number> =>
      runScopedIn(
        pool,
        {},
        async (client) => {
          await client.query("SELECT pg_sleep(12)"); // holds the slot for 12s
          return 1;
        },
        { retry: false },
      );

    const started = Date.now();
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => slow()));
    const elapsed = Date.now() - started;

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const shed = results.filter(
      (r): r is PromiseRejectedResult =>
        r.status === "rejected" && (r.reason as Error) instanceof PoolTimeoutError,
    );
    const other = results.filter(
      (r): r is PromiseRejectedResult =>
        r.status === "rejected" && !((r.reason as Error) instanceof PoolTimeoutError),
    );

    // Every request resolved one way or the other — none hung (the whole
    // batch finished; a hang would have tripped the test timeout).
    expect(fulfilled.length + shed.length, JSON.stringify(other.map((o) => String(o.reason)))).toBe(
      20,
    );
    // The 4 warm slots serve the 12s query; the other 16 wait for a slot
    // and shed at the 8s checkout bound (before any 12s query frees one).
    expect(fulfilled.length, "slots that served").toBeGreaterThanOrEqual(4);
    expect(shed.length, "excess shed as PoolTimeoutError").toBeGreaterThanOrEqual(1);
    // Shedding is FAST: the whole batch finishes within a couple of query
    // rounds, not 20 × 3s serialized.
    expect(elapsed, `elapsed ${elapsed}ms`).toBeLessThan(25_000);

    // The pool drains: after everything settles, no clients remain checked
    // out (waitingCount 0, and idle ≤ pool size).
    expect(pool.waitingCount, "no waiters left").toBe(0);
    expect(pool.totalCount - pool.idleCount, "no leaked checked-out clients").toBe(0);
  }, 45_000);
});

describe.runIf(adminDsn === "")("pool saturation (gated)", () => {
  it("skipped — set KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
