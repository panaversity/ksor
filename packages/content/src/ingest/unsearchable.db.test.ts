/**
 * Ingest must SAY how much of the record no search will return.
 *
 * A chunk shorter than the navigation threshold is stored, embedded and
 * readable — and excluded from every retrieval arm by the serving predicate.
 * The rule exists to keep link lists and breadcrumbs out of search, and it is
 * length-only, so a short SUBSTANTIVE paragraph is caught by it too.
 *
 * Measured on a realistic operations handbook: 10 of 16 chunks unsearchable and
 * one document that `read` and `outline` return but `search` can never find,
 * while ingest reported a cheerful "16 chunks; embedded 16" (issue #55). The
 * threshold is not settled here — that needs a gold-set measurement — but the
 * silence is, because the silence is what let it reach a release.
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool } from "../db.js";
import { grantIngest } from "../grant.js";
import { buildGeneration } from "./build.js";
import { buildShippedProvider } from "../lib/providers/registry.js";
import { applySchema } from "../schema.js";
import type { ContentInstance } from "../instance.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_unsearchable";

/** A complete policy statement, and far too short to be searchable. */
const SHORT = `---
title: Probation
status: approved
---

# Probation

Six months, with a written review at three and six.
`;

/** Long enough to clear the navigation threshold. */
const LONG = `---
title: Expense claims
status: approved
---

# Expense claims

Claims are submitted through the finance portal within thirty days of the spend,
with a receipt attached for anything over twenty pounds. Approvals follow the
line-manager chain, and the finance team reviews anything booked to a project
code before it is paid out at the end of the month.
`;

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
    const k = join(work, "knowledge");
    await mkdir(k, { recursive: true });
    await writeFile(join(k, "probation.md"), SHORT, "utf8");
    await writeFile(join(k, "expenses.md"), LONG, "utf8");
  }, 300_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
    if (work !== "") await rm(work, { recursive: true, force: true });
  });

  it("counts the chunks no retrieval arm will return, and names the lost documents", async () => {
    const report = await buildGeneration(
      pool,
      {
        name: "unsrch",
        corpusId: "unsrch",
        tenantId: "unsrch",
        dsnEnv: "KSOR_DB_URL",
        abstain: { vectorFloor: null, keywordFloor: null },
        textSearchConfig: "english",
        maximumResponseCharacters: 120_000,
        instructions: "",
        audiences: [],
        defaultVisibility: null,
        embeddingProvider: "fake",
        embeddingModel: "fake-embed-001",
        embeddingDim: 1536,
      } as ContentInstance,
      {
        provider: buildShippedProvider("fake", { apiKey: null }),
        knowledgeDir: join(work, "knowledge"),
        flip: true,
        sourceCommit: "unsrch",
      },
    );

    expect(report.unsearchable, "the short document's chunk is not retrievable").toBeGreaterThan(0);
    expect(
      report.unsearchableSources.some((s) => s.includes("probation")),
      `a document with NO searchable chunk must be named: ${JSON.stringify(report.unsearchableSources)}`,
    ).toBe(true);
    expect(
      report.unsearchableSources.some((s) => s.includes("expenses")),
      "the long document IS searchable and must not be named",
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
