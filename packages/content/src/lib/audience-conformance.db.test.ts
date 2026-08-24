/**
 * The kernel's SQL predicate, asserted row-by-row against the shared overlap
 * table (record spec §2.4). `OVERLAP_CASES` is the rule; this file proves the
 * SQL implements it, and `audience-overlap.test.ts` proves the TypeScript half
 * the site copies. The predicate is exercised THROUGH Postgres — the GUC bound
 * exactly as `runRead` binds it — because the SQL is where the rule runs; a
 * TypeScript reimplementation asserted here would be a third place to drift.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scopedTxn } from "@panaversity/ksor-postgres";
import { contentPool } from "../db.js";
import { audienceAllowed, audienceGucs, WHOLE_RECORD_SCOPE } from "./audience.js";
import { OVERLAP_CASES } from "./audience-conformance.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_audience_conformance";

describe.runIf(adminDsn !== "")("the overlap decision table, in SQL (db)", () => {
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
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  // The document is a one-row VALUES list aliased `n`, so the predicate under
  // test is the SAME string the serving queries splice in.
  const sql = `SELECT ${audienceAllowed("n")} AS visible FROM (SELECT $1::text[] AS audience) AS n`;

  it.each(OVERLAP_CASES)("$name", async (c) => {
    const visible = await scopedTxn(pool, audienceGucs(c.viewer), async (client) => {
      const r = await client.query(sql, [c.audience]);
      return r.rows[0].visible as boolean;
    });
    expect(visible, `viewer=[${c.viewer.join(", ")}] audience=[${c.audience.join(", ")}]`).toBe(
      c.visible,
    );
  });

  it("a NULL audience (a pre-2.5 row that declared nothing) is served to nobody", async () => {
    const visible = await scopedTxn(pool, audienceGucs(["public"]), async (client) => {
      const r = await client.query(sql, [null]);
      return r.rows[0].visible as boolean | null;
    });
    expect(visible).not.toBe(true);
  });

  it("an UNBOUND viewer scope matches nothing — fail closed", async () => {
    const r = await pool.query(sql, [["public"]]);
    expect(r.rows[0].visible).not.toBe(true);
  });

  it("the whole-record scope is a stated value that admits every list", async () => {
    const visible = await scopedTxn(pool, WHOLE_RECORD_SCOPE, async (client) => {
      const r = await client.query(sql, [["board"]]);
      return r.rows[0].visible as boolean;
    });
    expect(visible).toBe(true);
  });

  it("covers every case in the shared table", () => {
    expect(OVERLAP_CASES.length, "the table must not shrink silently").toBeGreaterThanOrEqual(11);
  });
});

describe.runIf(adminDsn === "")("overlap decision table (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
