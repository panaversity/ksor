/**
 * A caller-caused, PERMANENT failure must not wear the transient message.
 *
 * A NUL byte in any argument that becomes a bind parameter makes Postgres raise
 * SQLSTATE 22021 (`invalid byte sequence for encoding "UTF8": 0x00`) — a
 * class-22 data exception. It is deterministic, it is about the request, and it
 * does NOT damage the connection. Every read failure was sanitized through
 * `ContentStoreError`, whose message is fixed at "content store temporarily
 * unavailable", so an agent with one malformed slug was told the store was
 * down — and the tool guidance this door hands every agent says `unavailable`
 * means "retry later; never report it as 'not in the record'". The retry can
 * never succeed, and the store is answering everyone else (protocol-QA walk,
 * 2026-08-25).
 *
 * This codebase already decided this question twice: `SchemaVersionError` and
 * `SchemaStateError` exist ONLY to escape the same wrapper, because mapping a
 * permanent condition to the transient class tells someone to chase
 * connectivity for "something that will never fix itself". Same shape, reached
 * from caller input instead of operator state.
 *
 * Driven against a real database rather than a constructed error, because the
 * claim is about what Postgres actually raises and what it does to the
 * connection afterwards — neither of which a hand-built error can show.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ContentInputError, ContentStoreError, contentPool, runRead } from "./db.js";
import { applySchema } from "./schema.js";
import { WHOLE_RECORD_SCOPE } from "./lib/audience.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_input_error";
const TENANT = "input-corp";
const NUL = String.fromCharCode(0);

describe.runIf(adminDsn !== "")("a malformed argument is not an outage (db)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    pool = contentPool(url.toString(), 2);
    await applySchema(pool, 8);
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  const readWithNul = (): Promise<unknown> =>
    runRead(
      pool,
      TENANT,
      (c) => c.query("SELECT $1::text AS t", [`returns-policy${NUL} x`]),
      WHOLE_RECORD_SCOPE,
    );

  it("is raised as a PERMANENT input error, never as the store being unavailable", async () => {
    const error = await readWithNul().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ContentInputError);
    const message = (error as Error).message;
    expect(message, "the word an agent reads as 'wait and try again'").not.toContain(
      "temporarily unavailable",
    );
    expect(message, "it is about the request").toMatch(/request|argument|as written/i);
    expect(message, "and it must not invite a retry that can never succeed").toMatch(
      /will not|do not retry|unchanged/i,
    );
  }, 60_000);

  it("still subclasses ContentStoreError, so every caller's classification holds", () => {
    // The gateway's exit contract and refusal body key on ContentStoreError —
    // exactly how SchemaVersionError escapes the message without escaping the
    // taxonomy.
    expect(new ContentInputError("22021")).toBeInstanceOf(ContentStoreError);
  });

  it("leaks no driver text — the SQLSTATE and nothing else", async () => {
    const error = (await readWithNul().catch((e: unknown) => e)) as Error;
    expect(error.message).toContain("22021");
    for (const leak of ["invalid byte sequence", "localhost", TENANT, "sor_content_runtime"]) {
      expect(error.message, `must not carry ${leak}`).not.toContain(leak);
    }
  }, 60_000);

  it("the store was never unhealthy: the very next read answers", async () => {
    await readWithNul().catch(() => undefined);
    const ok = await runRead(
      pool,
      TENANT,
      async (c) => (await c.query("SELECT 1 AS ok")).rows[0],
      WHOLE_RECORD_SCOPE,
    );
    expect(ok, "a data exception does not damage the connection").toEqual({ ok: 1 });
  }, 60_000);

  it("a genuine outage still reads as transient", async () => {
    // The other half: narrowing must not turn a connection failure into an
    // input error. 08006 is the connection-exception class.
    const dead = contentPool("postgresql://ksor:ksor@127.0.0.1:1/none", 1);
    try {
      const error = (await runRead(dead, TENANT, async (c) => c.query("SELECT 1")).catch(
        (e: unknown) => e,
      )) as Error;
      expect(error).toBeInstanceOf(ContentStoreError);
      expect(error).not.toBeInstanceOf(ContentInputError);
      expect(error.message).toContain("temporarily unavailable");
    } finally {
      await dead.end().catch(() => undefined);
    }
  }, 60_000);
});

describe.runIf(adminDsn === "")("malformed argument (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
