/**
 * The MACHINE half of record spec §2.5, asserted row-by-row against real
 * Postgres. `LIFECYCLE_CASES` is the rule and `lifecycle-rule.test.ts` proves
 * the TypeScript half the site copies; this file proves the SQL the door
 * serves through, because a table that only one of the two surfaces is
 * measured against is the drift decision 18 exists to stop.
 *
 * The predicate takes its instant as an EXPRESSION rather than always reading
 * `now()`, so the two equality rows ("effective_from equal to as_of is
 * effective", "stale_after equal to as_of is already stale") are assertable at
 * all — with `now()` spliced in there is no instant a test can name. Serving
 * uses the default; the build passes its `as_of`.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool } from "../db.js";
import { LIFECYCLE_CASES } from "./lifecycle-conformance.js";
import { lifecycleAdmits } from "./lifecycle.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_lifecycle_conformance";

describe.runIf(adminDsn !== "")("the lifecycle decision table, in SQL (db)", () => {
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
  const sql = `SELECT ${lifecycleAdmits("n", "$4::timestamptz")} AS admitted FROM (
      SELECT $1::text AS doc_status, $2::timestamptz AS effective_from, $3::timestamptz AS stale_after
  ) AS n`;

  const iso = (ms: number | null): string | null =>
    ms === null ? null : new Date(ms).toISOString();

  it.each(LIFECYCLE_CASES)("$name", async (c) => {
    const r = await pool.query(sql, [
      c.doc.status,
      iso(c.doc.effectiveFrom),
      iso(c.doc.staleAfter),
      new Date(c.at).toISOString(),
    ]);
    expect(
      r.rows[0].admitted,
      `status=${c.doc.status} effective_from=${iso(c.doc.effectiveFrom)} stale_after=${iso(c.doc.staleAfter)} at=${new Date(c.at).toISOString()}`,
    ).toBe(c.machine);
  });

  it("the build-vs-request boundary: the SAME row answers differently on either side of it", async () => {
    const at = Date.parse("2026-08-25T12:00:00Z");
    const row = ["stable", new Date(at + 1).toISOString(), null];
    const before = await pool.query(sql, [...row, new Date(at).toISOString()]);
    const after = await pool.query(sql, [...row, new Date(at + 1).toISOString()]);
    expect(before.rows[0].admitted, "a build at as_of excludes it").toBe(false);
    expect(after.rows[0].admitted, "a request one millisecond later admits it").toBe(true);
  });

  it("defaults to now() when no instant is named — the shape serving splices", () => {
    expect(lifecycleAdmits("n")).toContain("now()");
  });

  it("covers every line of the §2.5 table", () => {
    expect(LIFECYCLE_CASES.length, "the table must not shrink silently").toBeGreaterThanOrEqual(10);
  });
});

describe.runIf(adminDsn === "")("lifecycle decision table (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
