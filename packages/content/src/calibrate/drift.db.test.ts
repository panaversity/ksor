/**
 * The drift query against a real log.
 *
 * `drift.test.ts` covers what the numbers MEAN. This covers the half only
 * Postgres can answer: that the SQL reads both sides of the gate, that it
 * refuses to count a row whose `top_cosine` is missing or not a number, and
 * that it does not read another tenant's traffic.
 *
 * The shed row is the one worth the tier. `logRead` sheds under saturation and
 * the detail key is recent, so rows without it exist — and counting one as a
 * zero would drag every statistic toward a score nobody measured, silently, in
 * the direction that makes a floor look safer than it is.
 */

import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { applySchema } from "../schema.js";
import { DRIFT_LIMIT, DRIFT_SQL, driftReport, type DriftSample } from "./drift.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = `ksor_drift_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
const TENANT = "acme";
const OTHER = "other";

describe.runIf(adminDsn !== "")("the floor-drift query (db)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;

  const log = async (
    tenant: string,
    action: "similarity_searched" | "search_abstained",
    detail: Record<string, unknown>,
    agoDays = 0,
    corpus?: string,
  ): Promise<void> => {
    await pool.query(
      `INSERT INTO retrieval_log (tenant_id, corpus_id, actor, action, detail, created_at)
       VALUES ($1, $5, 'human:test', $2, $3::jsonb, now() - ($4 || ' days')::interval)`,
      [tenant, action, JSON.stringify(detail), String(agoDays), corpus ?? tenant],
    );
  };

  const read = async (days: number): Promise<DriftSample[]> => {
    const { rows } = await pool.query<{ top_cosine: number; abstained: boolean }>(DRIFT_SQL, [
      TENANT,
      TENANT,
      String(days),
      DRIFT_LIMIT,
    ]);
    return rows.map((r) => ({ topCosine: r.top_cosine, abstained: r.abstained }));
  };

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    pool = new pg.Pool({ connectionString: url.toString(), max: 2 });
    await applySchema(pool, 8);

    await log(TENANT, "similarity_searched", { top_cosine: 0.9, k: 5 });
    await log(TENANT, "similarity_searched", { top_cosine: 0.56 });
    await log(TENANT, "search_abstained", { top_cosine: 0.2 });
    // Shed / pre-detail rows: present in the table, absent from the statistics.
    await log(TENANT, "similarity_searched", { k: 5 });
    await log(TENANT, "similarity_searched", { top_cosine: null });
    await log(TENANT, "similarity_searched", { top_cosine: "0.9" });
    // Another act entirely, and another tenant.
    await log(TENANT, "search_abstained", { top_cosine: 0.1 }, 400);
    await log(OTHER, "similarity_searched", { top_cosine: 0.99 });
    // Same tenant, a SECOND corpus: one record's floor must never be measured
    // against the other's traffic (the scope readLedger records the reason for).
    await log(TENANT, "similarity_searched", { top_cosine: 0.98 }, 0, "second-corpus");
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("reads both sides of the gate", async () => {
    const samples = await read(30);
    expect(
      samples.map((s) => `${s.topCosine}${s.abstained ? " abstained" : ""}`).sort(),
      "an answered search and a refused one both carry the gate's own signal",
    ).toEqual(["0.2 abstained", "0.56", "0.9"]);
  });

  it("counts no row whose top_cosine is missing, null, or not a number", async () => {
    // Three such rows were written; if any were counted the sample count moves.
    expect((await read(30)).length).toBe(3);
  });

  it("does not read another tenant's traffic, nor another corpus of this one", async () => {
    const samples = await read(30);
    expect(
      samples.some((s) => s.topCosine === 0.99),
      "another tenant's search",
    ).toBe(false);
    expect(
      samples.some((s) => s.topCosine === 0.98),
      "the same tenant's OTHER corpus — a floor measured against the wrong traffic",
    ).toBe(false);
  });

  it("honours the window", async () => {
    const wide = await read(500);
    expect(wide.length, "the 400-day-old row is inside a 500-day window").toBe(4);
  });

  it("feeds a report that reads the traffic it was given", async () => {
    const report = driftReport(0.55, await read(30));
    expect(report.answered).toBe(2);
    expect(report.abstained).toBe(1);
    // 0.56 is within 0.01 of a 0.55 floor; 0.9 is not.
    expect(report.marginal).toBe(1);
    // Three samples is under MIN_SAMPLES, so it declines a verdict — and still
    // reports the counts.
    expect(report.verdict).toBe("no-data");
  });
});
