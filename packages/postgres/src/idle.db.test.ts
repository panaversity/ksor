/**
 * How many connections a quiet server holds, proven rather than assumed.
 *
 * Two settings decide it together and pg-pool couples them in a way that is
 * easy to get backwards: it reaps an idle connection ONLY while the pool is
 * above `min` (pg-pool index.js:409). So a non-zero `min` does not prewarm —
 * it pins that many sockets open forever. The predecessor's psycopg pool DID
 * prewarm, which is why it could default `min` to 2; ksor inherited the number
 * without the mechanism and got the cost with none of the benefit.
 *
 * These tests pin both halves: the default holds NOTHING, and the opt-in dial
 * actually opens what it says.
 */

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPool, prewarmPool } from "./db.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = `ksor_idle_test_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;

describe.runIf(adminDsn !== "")("idle connection policy (db)", () => {
  let admin: pg.Pool;
  let dsn = "";
  const pools: pg.Pool[] = [];

  const track = (p: pg.Pool): pg.Pool => {
    pools.push(p);
    return p;
  };
  const settle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  /** Backends this database actually has open, counted from Postgres itself. */
  const backends = async (): Promise<number> => {
    const r = await admin.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1",
      [DB],
    );
    return r.rows[0].n as number;
  };

  /**
   * Wait for Postgres's own count to reach `want`, then answer with what it
   * actually reached — so a failure still prints the number seen.
   *
   * `pool.end()` resolves when the CLIENT socket closes; pg_stat_activity drops
   * the row only once the server-side backend process exits, and those are not
   * the same instant. Sampling the server once, immediately, raced that gap:
   * this suite went red in CI on a branch that changed nothing but a document,
   * because the previous test's three closing backends were still listed.
   */
  const backendsSettleTo = async (want: number, timeoutMs = 5_000): Promise<number> => {
    const deadline = Date.now() + timeoutMs;
    let seen = await backends();
    while (seen !== want && Date.now() < deadline) {
      await settle(50);
      seen = await backends();
    }
    return seen;
  };

  // Each test states what a quiet database holds, so each must START from one.
  // Without this the suite is order-coupled through the server, and the coupling
  // is invisible until it fails somewhere unrelated.
  beforeEach(async () => {
    if (dsn === "") return;
    expect(await backendsSettleTo(0), "a previous test's backends never drained").toBe(0);
  });

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    dsn = url.toString();
  }, 180_000);

  afterAll(async () => {
    for (const p of pools) await p.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("the DEFAULT shape holds ZERO connections once quiet", async () => {
    // min 0 + a short idle window, which is ksor's default shape with the
    // clock turned down so the test does not wait 10s.
    const pool = track(createPool(dsn, { maxSize: 10, minSize: 0, idleTimeoutMs: 300 }));
    await pool.query("SELECT 1");
    expect(pool.totalCount, "a query opens one").toBe(1);

    await settle(1200);
    expect(pool.totalCount, "…and it is released when idle").toBe(0);
    expect(await backends(), "Postgres agrees the socket is gone").toBe(0);
  });

  it("a NON-ZERO min pins connections open forever — the inherited default's real effect", async () => {
    const pool = track(createPool(dsn, { maxSize: 10, minSize: 2, idleTimeoutMs: 300 }));
    await Promise.all([pool.query("SELECT 1"), pool.query("SELECT 1")]);
    await settle(1200);
    // Not reaped: pg-pool only reaps while ABOVE min.
    expect(pool.totalCount, "min pins them open").toBe(2);
    await pool.end();
  });

  it("min does NOT prewarm on its own — the number without the mechanism", async () => {
    const pool = track(createPool(dsn, { maxSize: 10, minSize: 5, idleTimeoutMs: 60_000 }));
    await settle(600);
    expect(pool.totalCount, "pg-pool opens nothing eagerly").toBe(0);
    expect(await backends()).toBe(0);
  });

  it("prewarmPool opens exactly what was asked for", async () => {
    const pool = track(createPool(dsn, { maxSize: 10, minSize: 3, idleTimeoutMs: 60_000 }));
    const opened = await prewarmPool(pool, 3);
    expect(opened).toBe(3);
    expect(pool.totalCount).toBe(3);
    expect(await backends()).toBe(3);
    await pool.end();
  });

  it("prewarmPool is a no-op at 0, so the default boot opens nothing", async () => {
    const pool = track(createPool(dsn, { maxSize: 10, minSize: 0, idleTimeoutMs: 60_000 }));
    expect(await prewarmPool(pool, 0)).toBe(0);
    expect(pool.totalCount).toBe(0);
    expect(await backends()).toBe(0);
  });

  it("prewarm never fails the boot when the database refuses the connections", async () => {
    const bad = new URL(dsn);
    bad.pathname = "/definitely_not_a_database";
    const pool = track(
      createPool(bad.toString(), { maxSize: 4, minSize: 2, idleTimeoutMs: 60_000 }),
    );
    // Warns, returns what it managed, does not throw — an unreachable store at
    // boot is already tolerated and a cold first request beats refusing to start.
    await expect(prewarmPool(pool, 2)).resolves.toBe(0);
  });
});

describe.runIf(adminDsn === "")("idle connection policy (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
