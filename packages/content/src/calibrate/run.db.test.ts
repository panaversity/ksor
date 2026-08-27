/**
 * `runCalibration` — the orchestration, against real Postgres.
 *
 * The mathematics has 96 tests and an oracle fixture. The function that DRIVES
 * it had none: which door it opens, which generation it measures, and what it
 * refuses were all untested, and the provenance the whole exercise exists to
 * produce is assembled here rather than in the maths.
 *
 * The gap showed: when no generation was pinned — the ordinary case, calibrating
 * what is being served — the report carried `generation: null`, so the comment
 * an operator pastes beside their floor read "on generation unknown (no
 * generation pinned)". A floor is a threshold inside ONE generation's embedding
 * space, and the same query that counted the chunks had already resolved which
 * one (found live 2026-08-21).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool } from "../db.js";
import { grantIngest } from "../grant.js";
import { buildGeneration } from "../ingest/build.js";
import { buildShippedProvider } from "../lib/providers/registry.js";
import { applySchema } from "../schema.js";
import { runCalibration } from "./run.js";
import { instanceOf, profileDoc, writeRecord } from "../ingest/fixtures/record-fixture.js";
import type { ContentInstance } from "../instance.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_calibrate_run";
const TENANT = "calib-corp";

const DOC = (title: string, order: number): string =>
  profileDoc({
    title,
    order,
    body: `# ${title}

This document exists so the calibration run has real embedded chunks to sample
and score against. It is written at enough length to be classified as prose
rather than navigation, because a navigation chunk is excluded from retrieval
and a corpus of them would give the run nothing to measure at all.
`,
  });

describe.runIf(adminDsn !== "")("runCalibration against a real store (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;
  let work: string;
  let instance: ContentInstance;
  const provider = buildShippedProvider("fake", { apiKey: null });

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, 1536);
    await grantIngest(pool, TENANT);

    work = mkdtempSync(path.join(tmpdir(), "ksor-calib-"));
    writeRecord(work, {
      name: TENANT,
      docs: { "alpha.md": DOC("Alpha", 1), "beta.md": DOC("Beta", 2) },
    });

    instance = instanceOf(TENANT, TENANT);

    // Two generations, so "the served one" is a CHOICE the run has to make
    // rather than the only number available.
    await buildGeneration(pool, instance, {
      provider,
      recordRoot: work,
      flip: true,
      sourceCommit: "gen-one",
    });
    await buildGeneration(pool, instance, {
      provider,
      recordRoot: work,
      flip: true,
      sourceCommit: "gen-two",
    });
  }, 300_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
    if (work !== undefined) rmSync(work, { recursive: true, force: true });
  });

  const base = {
    tenantId: TENANT,
    corpusId: TENANT,
    provider,
    queries: ["what does the alpha document cover", "what is in the beta document"],
  };

  it("names the SERVED generation when none is pinned — not 'unknown'", async () => {
    const report = await runCalibration(pool, { ...base });
    expect(report.generation, "the served generation must reach the paste comment").toBe(2);
    expect(report.pinned).toBe(false);
    expect(report.door).toBe("queries-file");
  });

  it("names the pinned generation, and says it was pinned", async () => {
    const report = await runCalibration(pool, { ...base, generation: 1 });
    expect(report.generation).toBe(1);
    expect(report.pinned).toBe(true);
  });

  it("carries the margin and the probe counts that produced it", async () => {
    const report = await runCalibration(pool, { ...base });
    expect(report.in_corpus_queries).toBe(2);
    expect(report.ooc_probes).toBeGreaterThan(0);
    // min(in-corpus) − max(out-of-corpus), whatever its sign.
    const inScores = report.detail.filter((d) => d.in_corpus).map((d) => d.score);
    const oocScores = report.detail.filter((d) => !d.in_corpus).map((d) => d.score);
    expect(report.margin).toBeCloseTo(Math.min(...inScores) - Math.max(...oocScores), 3);
  });

  it("refuses a generation that has nothing embedded, naming which one", async () => {
    await expect(runCalibration(pool, { ...base, generation: 99 })).rejects.toThrow(
      /no embedded chunks in generation 99/,
    );
  });

  it("refuses the synthesized door with no text generator, and names the zero-LLM way out", async () => {
    await expect(runCalibration(pool, { ...base, queries: undefined })).rejects.toThrow(
      /--queries-file/,
    );
  });
});
