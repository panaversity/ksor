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
 * The three DETERMINISTIC assertions — provenance, disclosure, publication —
 * run against any provider and need only a database. Only the two SEMANTIC
 * ones are gated on a real embedding space (GEMINI_API_KEY, which CI carries):
 * a floor measured in the fake provider's space would be measuring nothing.
 * (The header used to gate the whole file on the key, which `docs/status.md`
 * already described correctly — round-9 review of PR 43.)
 */

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool } from "../db.js";
import { grantIngest } from "../grant.js";
import { buildShippedProvider } from "../lib/providers/registry.js";
import { embedQueryVlit } from "../lib/query-embed.js";
import { GATE_PREDICATE_DIGEST } from "../lib/search.js";
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

const DB = `ksor_eval_behavioural_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
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
      abstain: { vectorFloor: null, keywordFloor: null, floorDigest: null },
      textSearchConfig: "english",
      maximumResponseCharacters: 120_000,
      instructions: "",
      title: TENANT,
      description: "An eval record.",
      toolchain: null,
      embeddingProvider: PROVIDER,
      embeddingModel: MODEL,
      embeddingDim: 1536,
    };

    await buildGeneration(pool, instance, {
      provider,
      recordRoot: CORPUS,
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
    "the floor MECHANISM gates exactly as declared",
    async () => {
      // The product guarantee: given a floor, everything below it abstains and
      // everything above it answers. That is code, and it gates.
      const score = async (q: string): Promise<number> =>
        (await search(ctx, q, 5)).top_cosine ?? -1;
      const inScores = await Promise.all(IN_CORPUS.map(score));
      const oocScores = await Promise.all(OUT_OF_CORPUS.map(score));
      // Just above every out-of-corpus probe: whatever this corpus's separation,
      // the MECHANISM must decline all of them at this floor.
      const floor = Math.max(...oocScores) + 1e-6;
      const gated: ServiceContext = {
        ...ctx,
        instance: {
          ...instance,
          abstain: { vectorFloor: floor, keywordFloor: null, floorDigest: GATE_PREDICATE_DIGEST },
        },
      };

      for (const query of OUT_OF_CORPUS) {
        const r = await search(gated, query, 5);
        expect(r.abstained, `must decline below the floor: ${query}`).toBe(true);
        expect(r.hits, "an abstention hands back nothing to cite").toEqual([]);
        expect(r.gate, "and says the gate that made the decision").toEqual({ floor });
      }
      // Anything ABOVE the floor still answers — a gate is a threshold, not a
      // mute button.
      const answerable = IN_CORPUS.filter((_, i) => inScores[i]! > floor);
      expect(answerable.length, `no in-corpus question clears ${floor}`).toBeGreaterThan(0);
      for (const query of answerable) {
        expect((await search(gated, query, 5)).abstained, `must still answer: ${query}`).toBe(
          false,
        );
      }
    },
    300_000,
  );

  it.runIf(canMeasure)(
    "MEASURES this corpus's separation and reports the margin",
    async () => {
      // Whether a corpus separates a SCOPE-ADJACENT near-miss is a property of
      // the corpus and its embedding space, not of this code — so it is measured
      // and reported, not asserted. Measured 2026-08-21, gemini-embedding-001,
      // workbench/example-corpus:
      //
      //   in-corpus   0.730, 0.671
      //   near-miss   0.683  ("the approval threshold for hiring a contractor")
      //   near-miss   0.601
      //   far-domain  0.489
      //
      // The near-miss outscores the WEAKER in-corpus question, so no single
      // cosine floor both answers "what happens if a purchase is split" and
      // declines the hiring question. That is precisely what `ksor calibrate`
      // reports as "NOT separable" — and why it now refuses to hand out a floor
      // in that case. Recorded so the limit is a measurement, not an assumption.
      const score = async (q: string): Promise<number> =>
        (await search(ctx, q, 5)).top_cosine ?? -1;
      const inScores = await Promise.all(IN_CORPUS.map(score));
      const oocScores = await Promise.all(OUT_OF_CORPUS.map(score));
      const margin = Math.min(...inScores) - Math.max(...oocScores);
      console.error(
        `[eval] separation margin ${margin.toFixed(4)} — in ` +
          `${JSON.stringify(inScores.map((n) => +n.toFixed(3)))}, ooc ` +
          `${JSON.stringify(oocScores.map((n) => +n.toFixed(3)))}`,
      );

      // What DOES gate: the far-domain control must fall below every in-corpus
      // question. A corpus that cannot manage that is not a retrieval nuance.
      const farDomain = oocScores.at(-1)!;
      expect(
        farDomain,
        `far-domain ${farDomain} must score below every in-corpus question ${JSON.stringify(inScores)}`,
      ).toBeLessThan(Math.min(...inScores));
    },
    300_000,
  );

  it("never serves a generation that is not published", async () => {
    // Build a SECOND generation without flipping it: its rows exist, and no
    // surface may reach them.
    const provider = buildShippedProvider(PROVIDER, { apiKey: apiKey || null });
    await buildGeneration(pool, instance, {
      provider,
      recordRoot: CORPUS,
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
