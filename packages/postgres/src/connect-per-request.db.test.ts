/**
 * `KSOR_DB_CONNECT_PER_REQUEST=1` closes the connection when the call finishes.
 *
 * The DEFAULT is a pool with a floor of zero, and it is the default because it
 * measures better: a quiet server already holds nothing, and inside a burst the
 * handshake is paid once (decision 17). But that decision names the deployment
 * that would want the other posture — one where per-request connection is
 * genuinely cheaper, a local pooler sidecar or a runtime that reuses no process
 * — and the owner of such a deployment should not have to patch the kernel.
 *
 * So both are asserted here: the option does what it says, the default does
 * what it says, and the cost difference is measured rather than assumed.
 */

import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createPool, withGuardedClient } from "./db.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = `ksor_per_request_test_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;

describe.runIf(adminDsn !== "")("connect-per-request (db)", () => {
  let admin: pg.Pool;
  let dsn: string;
  const pools: pg.Pool[] = [];
  const track = (p: pg.Pool): pg.Pool => {
    pools.push(p);
    return p;
  };
  const settle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    dsn = url.toString();
  }, 180_000);

  afterEach(() => {
    delete process.env["KSOR_DB_CONNECT_PER_REQUEST"];
  });

  afterAll(async () => {
    for (const p of pools) await p.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("ON: the connection is gone the moment the call returns", async () => {
    process.env["KSOR_DB_CONNECT_PER_REQUEST"] = "1";
    // A long idle timeout, so ONLY the per-request teardown can close it.
    const pool = track(createPool(dsn, { maxSize: 4, minSize: 0, idleTimeoutMs: 60_000 }));

    await withGuardedClient(pool, async (c) => c.query("SELECT 1"));
    expect(pool.idleCount, "nothing was returned to the pool").toBe(0);
    expect(pool.totalCount, "…and nothing is held open").toBe(0);

    // Still usable: the next call opens a fresh connection.
    const again = await withGuardedClient(pool, async (c) =>
      Number((await c.query("SELECT 42 AS n")).rows[0].n),
    );
    expect(again).toBe(42);
    expect(pool.totalCount, "and closes that one too").toBe(0);
  }, 60_000);

  it("OFF (the default): the connection is REUSED, then expires on the idle clock", async () => {
    const pool = track(createPool(dsn, { maxSize: 4, minSize: 0, idleTimeoutMs: 500 }));

    await withGuardedClient(pool, async (c) => c.query("SELECT 1"));
    expect(pool.idleCount, "returned to the pool for the next call").toBe(1);
    await withGuardedClient(pool, async (c) => c.query("SELECT 1"));
    expect(pool.totalCount, "the SAME connection served both").toBe(1);

    // …and a quiet server still ends up holding nothing. That is the property
    // "connections are closed" asks for, obtained by expiry.
    await settle(1500);
    expect(pool.totalCount, "a quiet server holds nothing either way").toBe(0);
  }, 60_000);

  it("MEASURES what the option costs, so the default is a choice and not a habit", async () => {
    const rounds = 12;
    const time = async (perRequest: boolean): Promise<number> => {
      if (perRequest) process.env["KSOR_DB_CONNECT_PER_REQUEST"] = "1";
      else delete process.env["KSOR_DB_CONNECT_PER_REQUEST"];
      const pool = track(createPool(dsn, { maxSize: 4, minSize: 0, idleTimeoutMs: 60_000 }));
      await withGuardedClient(pool, async (c) => c.query("SELECT 1")); // warm the path
      const started = process.hrtime.bigint();
      for (let i = 0; i < rounds; i += 1) {
        await withGuardedClient(pool, async (c) => c.query("SELECT 1"));
      }
      const ms = Number(process.hrtime.bigint() - started) / 1e6 / rounds;
      await pool.end().catch(() => undefined);
      return ms;
    };

    const perRequest = await time(true);
    const pooled = await time(false);
    console.error(
      `[measured] per-request ${perRequest.toFixed(2)}ms/call · pooled ${pooled.toFixed(2)}ms/call ` +
        `(loopback, no TLS — a remote endpoint widens this)`,
    );
    // The DIRECTION is the assertion, not a threshold: reusing a connection
    // cannot be slower than opening one, and if it ever is, the default is
    // wrong and this test should say so.
    expect(
      pooled,
      `pooled ${pooled.toFixed(2)}ms was not faster than per-request ${perRequest.toFixed(2)}ms — ` +
        "decision 17's default rests on this being true",
    ).toBeLessThan(perRequest);
  }, 120_000);
});

describe.runIf(adminDsn === "")("connect-per-request (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
