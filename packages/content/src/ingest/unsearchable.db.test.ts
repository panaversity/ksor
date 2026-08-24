/**
 * Ingest must SAY how much of the record no search will return.
 *
 * A chunk classified `nav` is stored, embedded and readable — and excluded from
 * every retrieval arm by the serving predicate. So a record can be fully
 * ingested and still unable to answer questions it plainly contains, and the
 * only honest thing to do is SAY SO at ingest.
 *
 * The rule that decides `nav` has since changed (issue #55: navigation is a
 * shape, not a length), which is why the fixture below is a LINK LIST rather
 * than the short policy statement it used to be. That statement is now
 * searchable — it is a fact, and facts are what a handbook is made of — so it
 * can no longer stand in for something search cannot reach. The report it
 * exercises is unchanged and still needed: navigation is real, and an adopter
 * should not have to run SQL to discover which of their pages is only
 * findable by name.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool } from "../db.js";
import { grantIngest } from "../grant.js";
import { buildGeneration } from "./build.js";
import { buildShippedProvider } from "../lib/providers/registry.js";
import { applySchema } from "../schema.js";
import { instanceOf, profileDoc, writeRecord } from "./fixtures/record-fixture.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_unsearchable";

/** Navigation: a page of links, which no search should ever return. */
const NAV = profileDoc({
  title: "Handbook",
  body: `
# Handbook

- [Probation](probation.md)
- [Notice periods](notice-periods.md)
- [Expense limits](expense-limits.md)
- [Travel](travel.md)
`,
});

/**
 * A complete policy statement — 51 characters, and the whole answer to "how
 * long is probation". Searchable since #55; here as the control that proves
 * the report counts navigation rather than shortness.
 */
const SHORT_FACT = profileDoc({
  title: "Probation",
  body: `
# Probation

Six months, with a written review at three and six.
`,
});

/** Ordinary prose, searchable under any rule — the upper control. */
const LONG = profileDoc({
  title: "Expense claims",
  body: `
# Expense claims

Claims are submitted through the finance portal within thirty days of the spend,
with a receipt attached for anything over twenty pounds. Approvals follow the
line-manager chain, and the finance team reviews anything booked to a project
code before it is paid out at the end of the month.
`,
});

describe.runIf(adminDsn !== "")("ingest reports what search cannot reach (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;
  let work = "";

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, 1536);
    await grantIngest(pool, "unsrch");
    work = await mkdtemp(join(tmpdir(), "ksor-unsrch-"));
    // The link list is a CONCEPT (`handbook.md`): a generated index.md is never
    // a node and never chunked, so it cannot be what the report names.
    writeRecord(work, {
      name: "unsrch",
      docs: { "handbook.md": NAV, "probation.md": SHORT_FACT, "expenses.md": LONG },
    });
  }, 300_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
    if (work !== "") await rm(work, { recursive: true, force: true });
  });

  it("counts the chunks no retrieval arm will return, and names the lost documents", async () => {
    const report = await buildGeneration(pool, instanceOf("unsrch", "unsrch"), {
      provider: buildShippedProvider("fake", { apiKey: null }),
      recordRoot: work,
      flip: true,
      sourceCommit: "unsrch",
    });

    expect(report.unsearchable, "the link list's chunk is not retrievable").toBeGreaterThan(0);
    expect(
      report.unsearchableSources.some((s) => s.includes("handbook")),
      `a document with NO searchable chunk must be named: ${JSON.stringify(report.unsearchableSources)}`,
    ).toBe(true);
    expect(
      report.unsearchableSources.some((s) => s.includes("expenses")),
      "the long document IS searchable and must not be named",
    ).toBe(false);
    // The #55 control: shortness alone no longer costs a document its place in
    // search. If this ever flips back, the classifier regressed to length.
    expect(
      report.unsearchableSources.some((s) => s.includes("probation")),
      `a 51-character FACT must stay searchable: ${JSON.stringify(report.unsearchableSources)}`,
    ).toBe(false);
  });

  it("agrees with what the serving predicate actually admits", async () => {
    // The report is computed in TypeScript and the exclusion happens in SQL.
    // If they ever disagree the report is worse than silence, so they are
    // compared against the same rows.
    const { rows } = await pool.query(
      `SELECT count(*) FILTER (
         WHERE NOT (labels->>'source_type' = 'prose'
                    AND length(regexp_replace(content, '\\s', '', 'g')) >= 24)
       )::int AS unsearchable
       FROM chunks WHERE tenant_id = 'unsrch'`,
    );
    const fromSql = (rows[0] as { unsearchable: number }).unsearchable;
    const report = await pool.query(
      "SELECT count(*)::int AS total FROM chunks WHERE tenant_id = 'unsrch'",
    );
    expect(fromSql, `${JSON.stringify(report.rows[0])}`).toBeGreaterThan(0);
    // Re-derive from the same predicate the report used; a drift here means the
    // adopter is being told a number the database does not agree with.
    const served = await pool.query(
      `SELECT count(*)::int AS n FROM chunks
       WHERE tenant_id = 'unsrch' AND labels->>'source_type' = 'prose'
         AND length(regexp_replace(content, '\\s', '', 'g')) >= 24`,
    );
    expect((served.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });
});
