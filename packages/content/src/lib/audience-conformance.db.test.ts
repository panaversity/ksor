/**
 * The kernel's SQL, asserted row-by-row against the shared audience table
 * (record spec §2.4). `AUDIENCE_CASES` is the rule; this file proves the SQL
 * implements it, and `audience-overlap.test.ts` proves the TypeScript half the
 * site copies. The predicate is exercised THROUGH Postgres — the GUC bound
 * exactly as `runRead` binds it — because the SQL is where the rule runs; a
 * TypeScript reimplementation asserted here would be a third place to drift.
 *
 * Two kinds of row, both asserted here rather than one of them taken on trust:
 *
 * - a CONCEPT row runs against the bare overlap predicate on a one-row VALUES
 *   list, which is the same string the serving statements splice in;
 * - a SECTION row runs against the real `admitted` CTE over a real tree,
 *   because a section is admitted by a recursive `parent_id` walk and there is
 *   no predicate on its own row that could be asked instead.
 *
 * A row carrying `refusal` is a state the checker refuses, so it cannot be
 * authored. It is asserted anyway: a rule that only the validator enforces is
 * one hand-written INSERT away from being served.
 */

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scopedTxn } from "@panaversity/ksor-postgres";
import { contentPool } from "../db.js";
import { admitted, ADMITTED_CTE } from "./admit.js";
import { DENIED_CTE } from "./takedown.js";
import { audienceAllowed, audienceGucs, WHOLE_RECORD_SCOPE } from "./audience.js";
import { AUDIENCE_CASES, type AudienceCase } from "./audience-conformance.js";
import { REFUSAL_SLUGS } from "../record/refusal.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = `ksor_audience_conformance_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
const TENANT = "t-audience";

describe.runIf(adminDsn !== "")("the audience decision table, in SQL (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    const { renderSchema } = await import("../schema.js");
    const boot = new Pool({ connectionString: url.toString() });
    await boot.query(renderSchema(8));
    await boot.end();
    pool = contentPool(url.toString(), 4);
    await pool.query(
      "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, 'c', 1)",
      [TENANT],
    );
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  // The concept is a one-row VALUES list aliased `n`, so the predicate under
  // test is the SAME string the serving queries splice in.
  const conceptSql = `SELECT ${audienceAllowed("n")} AS visible FROM (SELECT $1::text[] AS audience) AS n`;

  const sectionSql = `
WITH RECURSIVE g AS (SELECT active_generation AS gen FROM corpora WHERE tenant_id = $1 AND corpus_id = 'c'),
${DENIED_CTE},
${ADMITTED_CTE}
SELECT ${admitted("n")} AS visible FROM content_nodes n JOIN g ON n.generation = g.gen
WHERE n.tenant_id = $1 AND n.stable_id = $3`;

  /** One section + its descendants, unique per row so the rows cannot interact. */
  let built = 0;
  const buildSection = async (lists: readonly (readonly string[])[]): Promise<string> => {
    const id = `sec-${(built += 1)}`;
    const parent = await pool.query<{ node_id: string }>(
      `INSERT INTO content_nodes (tenant_id, corpus_id, generation, stable_id, kind, slug, title)
       VALUES ($1, 'c', 1, $2, 'section', $2, $2) RETURNING node_id`,
      [TENANT, id],
    );
    for (const [i, list] of lists.entries()) {
      await pool.query(
        `INSERT INTO content_nodes (tenant_id, corpus_id, generation, stable_id, parent_id, kind,
             slug, title, audience, doc_status)
         VALUES ($1, 'c', 1, $2, $3, 'document', $2, $2, $4::text[], 'stable')`,
        [TENANT, `${id}/d${i}`, String(parent.rows[0]?.node_id), list],
      );
    }
    return id;
  };

  const decide = async (c: AudienceCase): Promise<boolean> =>
    scopedTxn(pool, { "app.tenant_id": TENANT, ...audienceGucs(c.viewer) }, async (client) => {
      if (c.section !== undefined) {
        const id = await buildSection(c.section.descendants);
        // $2 is corpus_id — the deny seam binds it, and the admission set now
        // binds the deny seam.
        const r = await client.query(sectionSql, [TENANT, "c", id]);
        // An empty section has no row of its own to be absent from; the query
        // returns the section row, and `visible` is the admission verdict.
        return r.rows[0]?.visible === true;
      }
      const r = await client.query(conceptSql, [c.audience]);
      return r.rows[0].visible === true;
    });

  it.each(AUDIENCE_CASES)("$name", async (c) => {
    expect(
      await decide(c),
      `viewer=[${c.viewer.join(", ")}] audience=${c.audience === null ? "NULL" : `[${c.audience.join(", ")}]`}` +
        (c.section === undefined
          ? ""
          : ` section descendants=${JSON.stringify(c.section.descendants)}`),
    ).toBe(c.visible);
  });

  it("an UNBOUND viewer scope matches nothing — fail closed", async () => {
    const r = await pool.query(conceptSql, [["public"]]);
    expect(r.rows[0].visible).not.toBe(true);
  });

  it("the whole-record scope is a stated value that admits every list", async () => {
    const visible = await scopedTxn(pool, WHOLE_RECORD_SCOPE, async (client) => {
      const r = await client.query(conceptSql, [["board"]]);
      return r.rows[0].visible as boolean;
    });
    expect(visible).toBe(true);
  });

  it("covers every case in the shared table", () => {
    expect(AUDIENCE_CASES.length, "the table must not shrink silently").toBeGreaterThanOrEqual(15);
  });

  it("every refusal a row names is a slug the checker actually emits", () => {
    for (const c of AUDIENCE_CASES) {
      if (c.refusal === undefined) continue;
      expect(REFUSAL_SLUGS, c.name).toContain(c.refusal);
    }
  });

  it("the table carries both kinds of row — concepts AND sections", () => {
    expect(AUDIENCE_CASES.some((c) => c.section !== undefined)).toBe(true);
    expect(AUDIENCE_CASES.some((c) => c.section === undefined)).toBe(true);
    expect(AUDIENCE_CASES.some((c) => c.refusal !== undefined)).toBe(true);
  });
});

describe.runIf(adminDsn === "")("audience decision table (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
