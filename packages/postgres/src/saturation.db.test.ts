/**
 * A cold burst is not saturation, and the difference decides whether a request
 * is retried or thrown away.
 *
 * `acquire` splits a connect timeout two ways: a pool whose connections are
 * established and all busy is SATURATED (shed it — retrying aims a thundering
 * herd at the component already drowning), while a pool with room whose
 * CONNECT timed out is a cold start (retry it — that is the ordinary first
 * request against a compute that suspends).
 *
 * The split was first written against `pool.totalCount`, which cannot express
 * it: pg-pool pushes a client into `_clients` before its connect resolves
 * (3.14 index.js:242), so twenty sockets mid-handshake report a full pool.
 * A burst arriving at a waking database was therefore classified as load and
 * shed permanently — the exact requests the split exists to keep (round-4
 * review of #43).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectedCount, createPool, ConnectTimeoutError, PoolTimeoutError } from "./db.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_saturation_test";

/**
 * TEST-NET-1 (RFC 5737), reserved for documentation and not routable: packets
 * are DROPPED, so every connect runs to its timeout. A refused port would not
 * do — ECONNREFUSED is instant and is not a timeout at all.
 */
const BLACK_HOLE = "postgresql://nobody@192.0.2.1:5432/nothing";

describe.runIf(adminDsn !== "")("connect timeout: saturation vs cold start (db)", () => {
  let admin: pg.Pool;
  let dsn: string;
  const pools: pg.Pool[] = [];
  const track = (p: pg.Pool): pg.Pool => {
    pools.push(p);
    return p;
  };

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
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

  it("counts CONNECTED clients, not sockets that are still handshaking", async () => {
    const pool = track(
      createPool(BLACK_HOLE, { maxSize: 2, minSize: 0, connectionTimeoutMs: 400 }),
    );
    const attempts = [pool.connect(), pool.connect()].map((p) => p.catch(() => null));
    // Mid-handshake against an address that answers nothing: pg-pool already
    // calls the pool full, and NOTHING is connected.
    expect(pool.totalCount, "pg-pool counts the handshaking sockets").toBeGreaterThan(0);
    expect(connectedCount(pool), "…and none of them is a working connection").toBe(0);
    await Promise.all(attempts);
  }, 60_000);

  it("a COLD BURST at a black-holed endpoint is retryable, never shed", async () => {
    // maxSize 2 with 4 callers: two handshake, two queue. Under the old rule
    // the two that queued got PoolTimeoutError (never retried) purely because
    // they arrived second.
    const pool = track(
      createPool(BLACK_HOLE, { maxSize: 2, minSize: 0, connectionTimeoutMs: 400 }),
    );
    const { runScopedIn } = await import("./db.js");
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        runScopedIn(pool, {}, async (c) => c.query("SELECT 1"), { retry: false }).then(
          () => "ok",
          (error: unknown) => (error as Error).constructor.name,
        ),
      ),
    );
    expect(
      results.filter((r) => r === PoolTimeoutError.name),
      `nothing was saturated — every failure here is a failed CONNECT: ${JSON.stringify(results)}`,
    ).toEqual([]);
    expect(
      results.every((r) => r === ConnectTimeoutError.name),
      `all four must be retryable connect failures: ${JSON.stringify(results)}`,
    ).toBe(true);
  }, 60_000);

  it("a genuinely BUSY pool still sheds — the classification did not just invert", async () => {
    // Real connections, all checked out and held: this IS saturation.
    const pool = track(createPool(dsn, { maxSize: 1, minSize: 0, connectionTimeoutMs: 400 }));
    const held = await pool.connect();
    try {
      expect(connectedCount(pool), "one live connection, checked out").toBe(1);
      const { runScopedIn } = await import("./db.js");
      const verdict = await runScopedIn(pool, {}, async (c) => c.query("SELECT 1"), {
        retry: false,
      }).then(
        () => "ok",
        (error: unknown) => (error as Error).constructor.name,
      );
      expect(verdict, "a full pool of WORKING connections sheds").toBe(PoolTimeoutError.name);
    } finally {
      held.release();
    }
  }, 60_000);
});

describe.runIf(adminDsn === "")("connect timeout classification (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
