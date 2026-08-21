/**
 * The kernel's SQL predicate, asserted row-by-row against the shared table.
 *
 * `AUDIENCE_CASES` is the rule. This file proves the SQL implements it; the
 * scaffold's conformance suite proves the site's `visibleInBuild` implements
 * the same rows. Before the table existed, the two surfaces implemented the
 * rule twice and drifted four separate times, each side's own tests staying
 * green throughout because each side was internally consistent.
 *
 * The predicate is exercised THROUGH Postgres — the GUCs bound exactly as
 * `runRead` binds them — because the SQL is where the rule actually runs. A
 * TypeScript reimplementation asserted here would be a fifth place to drift.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scopedTxn } from "@panaversity/ksor-postgres";
import { contentPool } from "../db.js";
import { audienceAllowed, audienceGucs } from "./audience.js";
import { AUDIENCE_CASES } from "./audience-conformance.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_audience_conformance";

describe.runIf(adminDsn !== "")("the audience decision table, in SQL (db)", () => {
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

  it.each(AUDIENCE_CASES)("$name", async (testCase) => {
    const gucs = audienceGucs(
      { audiences: testCase.audiences, defaultVisibility: testCase.defaultVisibility },
      testCase.viewer,
    );
    // The document is a one-row VALUES list aliased `n`, so the predicate under
    // test is the SAME string the serving queries splice in.
    const sql = `SELECT ${audienceAllowed("n")} AS visible
                   FROM (SELECT $1::text AS visibility) AS n`;
    const visible = await scopedTxn(pool, gucs, async (client) => {
      const r = await client.query(sql, [testCase.visibility]);
      return r.rows[0].visible as boolean;
    });
    expect(
      visible,
      `viewer=${JSON.stringify(testCase.viewer)} document=${JSON.stringify(testCase.visibility)} ` +
        `model=[${testCase.audiences.join(", ")}] default=${JSON.stringify(testCase.defaultVisibility)}`,
    ).toBe(testCase.visible);
  });

  it("covers every case in the shared table", () => {
    expect(AUDIENCE_CASES.length, "the table must not shrink silently").toBeGreaterThanOrEqual(15);
  });
});

describe.runIf(adminDsn === "")("audience decision table (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
