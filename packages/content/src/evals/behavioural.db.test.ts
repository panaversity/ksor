/**
 * The BEHAVIOURAL eval class — the one AGENTS.md declares gating.
 *
 * The testing contract commits to three classes and says the behavioural ones
 * gate: abstains out-of-corpus, citations resolve, unpublished generations are
 * never served. None existed, while `serve` shipped — and each of the three
 * would have caught a finding this branch had to fix afterwards (the gate
 * reporting nothing on the wire, the calibrator handing out a leaking floor,
 * retrieval scanning instead of using its index).
 *
 * These are BEHAVIOURAL, not relevance: every assertion is about what the
 * surface GUARANTEES, never about whether a particular passage ranked first.
 * That distinction is the contract's own — relevance evals are reported and
 * never gate, because their gold is generated from the corpus under test.
 *
 * The out-of-corpus probes are scope-adjacent on purpose, not only far-domain:
 * "what is the approval threshold for hiring" is the near-miss a purchase-
 * approval corpus must decline, and the contract requires exactly that.
 *
 * Gated on a real embedding space (GEMINI_API_KEY, which CI carries): a floor
 * measured in the fake provider's space would be measuring nothing.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool } from "../db.js";
import { grantIngest } from "../grant.js";
import { buildShippedProvider } from "../lib/providers/registry.js";
import { embedQueryVlit } from "../lib/query-embed.js";
import { keyRingFromEnv } from "../lib/snapshot.js";
import { applySchema } from "../schema.js";
import { buildGeneration } from "../ingest/build.js";
import { readDocument, search, type ServiceContext } from "../service.js";
import type { ContentInstance } from "../instance.js";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const apiKey = process.env["GEMINI_API_KEY"] ?? "";
/** Deterministic guarantees — provenance, disclosure, publication. Any provider. */
const canRun = adminDsn !== "";
/** The two SEMANTIC assertions: a floor measured in the fake space measures nothing. */
const canMeasure = adminDsn !== "" && apiKey !== "";
const PROVIDER = apiKey === "" ? "fake" : "gemini";
const MODEL = apiKey === "" ? "fake-embed-001" : "gemini-embedding-001";

const DB = "ksor_eval_behavioural";
const TENANT = "example-corpus";
const CORPUS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "workbench",
  "example-corpus",
);

/** Questions the record DOES cover — each must be answered and cited. */
const IN_CORPUS = [
  "who approves a purchase over fifty thousand dollars",
  "what happens if a purchase is split to stay under a threshold",
];

/**
 * Questions the record does NOT cover. The first two are scope-adjacent — the
 * shape a corpus about approval thresholds is most likely to answer wrongly —
 * and the third is far-domain as a control.
 */
const OUT_OF_CORPUS = [
  "what is the approval threshold for hiring a contractor",
  "who approves an expense reimbursement after travel",
  "what is the boiling point of mercury",
];

describe.runIf(canRun)("behavioural evals", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;
  let ctx: ServiceContext;
  let instance: ContentInstance;

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

    const provider = buildShippedProvider(PROVIDER, { apiKey: apiKey || null });
    instance = {
      name: TENANT,
      corpusId: TENANT,
      tenantId: TENANT,
      dsnEnv: "KSOR_DB_URL",
      // No floor: these assertions are about DISCLOSURE and provenance, which
      // must hold at level 0 — the shape every adopter starts in.
      abstain: { vectorFloor: null, keywordFloor: null },
      maximumResponseCharacters: 120_000,
      instructions: "",
      audiences: [],
      defaultVisibility: null,
      embeddingProvider: PROVIDER,
      embeddingModel: MODEL,
      embeddingDim: 1536,
    };

    await buildGeneration(pool, instance, {
      provider,
      knowledgeDir: path.join(CORPUS, "knowledge"),
      flip: true,
      sourceCommit: "eval",
    });

    ctx = {
      pool,
      instance,
      ring: keyRingFromEnv(undefined),
      instanceDigest: createHash("sha256").update("eval").digest("hex"),
      embedQuery: (query: string) => embedQueryVlit(query, { provider }),
    };
  }, 300_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("answers an in-corpus question, and every hit carries resolvable provenance", async () => {
    for (const query of IN_CORPUS) {
      const result = await search(ctx, query, 5);
      expect(result.abstained, `must answer: ${query}`).toBe(false);
      expect(result.hits.length, query).toBeGreaterThan(0);

      for (const hit of result.hits) {
        // A citation has to be RESOLVABLE, not merely present.
        expect(hit.provenance.corpus_id, query).toBe(TENANT);
        expect(hit.provenance.generation, query).toBeGreaterThan(0);
        expect(hit.provenance.stable_id, query).toMatch(/^knowledge\//);
        const doc = await readDocument(ctx, hit.slug);
        expect(doc.provenance.generation, "the cited generation is readable").toBe(
          hit.provenance.generation,
        );
      }
    }
  }, 180_000);

  it("states the gate on EVERY envelope, so an answer is never mistaken for coverage", async () => {
    // The record declares no floor, so it CANNOT abstain — and the surface has
    // to say so, or `ok:true` reads as "the record covers this".
    const answered = await search(ctx, IN_CORPUS[0]!, 3);
    expect(answered.gate).toBe("off");
    const missed = await search(ctx, OUT_OF_CORPUS[2]!, 3);
    expect(missed.gate, "the same disclosure on a miss").toBe("off");
  }, 120_000);

  it.runIf(canMeasure)(
    "separates in-corpus from out-of-corpus, near-misses included",
    async () => {
      // The measurable precondition for abstention: if the two classes do not
      // separate, no floor can gate them, and a floor pasted anyway leaks.
      const score = async (q: string): Promise<number> => {
        const r = await search(ctx, q, 5);
        return r.top_cosine ?? -1;
      };
      const inScores = await Promise.all(IN_CORPUS.map(score));
      const oocScores = await Promise.all(OUT_OF_CORPUS.map(score));

      const worstIn = Math.min(...inScores);
      const bestOut = Math.max(...oocScores);
      expect(
        worstIn,
        `in-corpus ${JSON.stringify(inScores)} must outscore out-of-corpus ${JSON.stringify(oocScores)}`,
      ).toBeGreaterThan(bestOut);
    },
    180_000,
  );

  it.runIf(canMeasure)(
    "ABSTAINS out-of-corpus once a floor sits in the measured gap",
    async () => {
      // The floor is derived from THIS measurement rather than hardcoded: a
      // constant copied between corpora is the thing the invariants forbid.
      const score = async (q: string): Promise<number> =>
        (await search(ctx, q, 5)).top_cosine ?? -1;
      const inScores = await Promise.all(IN_CORPUS.map(score));
      const oocScores = await Promise.all(OUT_OF_CORPUS.map(score));
      const floor = (Math.min(...inScores) + Math.max(...oocScores)) / 2;

      const gated: ServiceContext = {
        ...ctx,
        instance: { ...instance, abstain: { vectorFloor: floor, keywordFloor: null } },
      };

      for (const query of OUT_OF_CORPUS) {
        const r = await search(gated, query, 5);
        expect(r.abstained, `must decline: ${query}`).toBe(true);
        expect(r.hits, "an abstention hands back nothing to cite").toEqual([]);
        expect(r.gate, "and says the gate that made the decision").toEqual({ floor });
      }
      for (const query of IN_CORPUS) {
        const r = await search(gated, query, 5);
        expect(r.abstained, `must still answer: ${query}`).toBe(false);
      }
    },
    300_000,
  );

  it("never serves a generation that is not published", async () => {
    // Build a SECOND generation without flipping it: its rows exist, and no
    // surface may reach them.
    const provider = buildShippedProvider(PROVIDER, { apiKey: apiKey || null });
    await buildGeneration(pool, instance, {
      provider,
      knowledgeDir: path.join(CORPUS, "knowledge"),
      flip: false,
      sourceCommit: "eval-unpublished",
    });
    const active = await pool.query("SELECT active_generation FROM corpora WHERE tenant_id = $1", [
      TENANT,
    ]);
    const serving = Number(active.rows[0].active_generation);
    const built = await pool.query(
      "SELECT max(generation) AS g FROM ingestion_runs WHERE tenant_id = $1",
      [TENANT],
    );
    expect(Number(built.rows[0].g), "a newer generation exists").toBeGreaterThan(serving);

    const result = await search(ctx, IN_CORPUS[0]!, 5);
    for (const hit of result.hits) {
      expect(hit.provenance.generation, "only the PUBLISHED generation is served").toBe(serving);
    }
  }, 300_000);
});

describe.runIf(!canRun)("behavioural evals — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(canRun).toBe(false);
  });
});
