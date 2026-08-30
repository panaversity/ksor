/**
 * A connection that dies WHILE CHECKED OUT must not kill the process.
 *
 * pg-pool 3.14 removes the client's own 'error' listener for the duration of a
 * checkout (`_acquireClient`: `client.removeListener('error', idleListener)`,
 * re-attached only in `_release`). So between checkout and release a pg Client
 * has ZERO error listeners, and pg's `Client._handleErrorEvent` emits 'error'
 * unconditionally — which Node turns into an UNCAUGHT EXCEPTION and exits the
 * process with code 1.
 *
 * The pool-level listener in db.ts does NOT cover this: pg-pool only forwards
 * to the pool for IDLE clients. That is why one deployment shows two different
 * endings — an idle-time drop logs "idle client error … connection discarded"
 * and serves on, while a drop during a query takes the whole server down. On a
 * serverless endpoint that suspends its compute, the second is the FIRST
 * request after an idle period.
 *
 * These tests kill the backend mid-statement and assert the operation rejects
 * cleanly with no uncaught exception — vitest fails the file on one, so the
 * assertion is the run itself.
 */

import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createPool, scopedTxn } from "./db.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = `ksor_checkout_error_test_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;

describe.runIf(adminDsn !== "")("a checked-out client losing its socket (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;
  let dsn: string;
  const uncaught: unknown[] = [];
  const onUncaught = (error: unknown): void => {
    uncaught.push(error);
  };

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    dsn = url.toString();
    pool = createPool(dsn, { maxSize: 4, minSize: 0 });
    // Node's default for an unhandled 'error' event is to throw; capture it so
    // the assertion can name what happened instead of the worker dying.
    process.on("uncaughtException", onUncaught);
  }, 180_000);

  afterEach(() => {
    uncaught.length = 0;
  });

  afterAll(async () => {
    process.removeListener("uncaughtException", onUncaught);
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  /** Terminate the backend running the statement this checkout holds. */
  const killBackendOf = async (pid: number): Promise<void> => {
    const { Pool } = (await import("pg")).default;
    const killer = new Pool({ connectionString: dsn });
    try {
      await killer.query("SELECT pg_terminate_backend($1)", [pid]);
    } finally {
      await killer.end().catch(() => undefined);
    }
  };

  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 400));

  it("rejects the operation instead of taking the process down", async () => {
    const failed = await scopedTxn(pool, {}, async (client) => {
      const pid = Number((await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      setTimeout(() => void killBackendOf(pid), 150);
      await client.query("SELECT pg_sleep(5)");
      return "completed";
    }).then(
      () => "completed",
      (error: unknown) => (error instanceof Error ? "rejected" : "rejected-nonerror"),
    );

    await settle();
    expect(failed, "the transaction must reject").toBe("rejected");
    expect(
      uncaught.map((e) => (e instanceof Error ? e.message : String(e))),
      "no uncaught exception may escape a checked-out connection dying",
    ).toEqual([]);
  });

  it("survives a drop that arrives AFTER the statement already rejected", async () => {
    // pg can emit 'error' on the client a tick after the query rejects; the
    // guard must still be attached at that moment, not removed with the query.
    await scopedTxn(pool, {}, async (client) => {
      const pid = Number((await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      setTimeout(() => void killBackendOf(pid), 100);
      await client.query("SELECT pg_sleep(3)");
    }).catch(() => undefined);

    await settle();
    expect(uncaught, "a late socket error must not escape either").toEqual([]);
  });

  it("keeps the pool usable afterwards — the broken client is discarded, not reused", async () => {
    const ok = await scopedTxn(pool, {}, async (client) => {
      const r = await client.query("SELECT 42 AS answer");
      return Number(r.rows[0].answer);
    });
    expect(ok).toBe(42);
    expect(uncaught).toEqual([]);
  });

  it("still surfaces an ordinary SQL error as a rejection, unchanged", async () => {
    await expect(
      scopedTxn(pool, {}, async (client) => client.query("SELECT * FROM no_such_table")),
    ).rejects.toThrow(/no_such_table/);
    await settle();
    expect(uncaught).toEqual([]);
  });
});

describe.runIf(adminDsn === "")("checked-out client errors (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
