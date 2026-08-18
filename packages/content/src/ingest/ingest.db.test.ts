/**
 * The ingest pipeline's database acceptance: the committed fixture tree
 * ingested for real (structure atomic, embeds drained through the FAKE
 * provider, ready gate, flip), carry-forward across generations proven by
 * counting provider calls, the poison-chunk quarantine, the shrink guard, and
 * the GC algebra. Gated on KSOR_DB_URL (CI: pgvector service container; dev:
 * local Postgres or a throwaway Neon), following kernel.db.test.ts's
 * CREATE DATABASE + applySchema(dim 8) pattern.
 */

import { randomBytes } from "node:crypto";
import { cp, mkdtemp, rm, writeFile, appendFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest, runRead } from "../db.js";
import { applySchema } from "../schema.js";
import type { ContentInstance } from "../instance.js";
import { aembedIntent, type EmbeddingProvider, type Intent } from "../lib/embedding.js";
import { buildShippedProvider } from "../lib/providers/registry.js";
import { FAKE_EMBED_MODEL } from "../lib/providers/fake.js";
import { hybridSearch, VECTOR_TXN_GUCS, type SearchScope } from "../lib/search.js";
import { buildGeneration } from "./build.js";
import { runGc } from "./gc.js";
import { GC_GRACE_MS, rollback } from "./generation.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;

const FIXTURE = fileURLToPath(new URL("./fixtures/plain-tree/demo-rulebook/docs", import.meta.url));

function instanceOf(tenantId: string, corpusId: string): ContentInstance {
  return {
    name: corpusId,
    corpusId,
    tenantId,
    dsnEnv: "KSOR_DB_URL",
    abstain: { vectorFloor: null, keywordFloor: null },
    maximumResponseCharacters: 120_000,
    instructions: "",
    embeddingProvider: "fake",
    embeddingModel: FAKE_EMBED_MODEL,
    embeddingDim: DIM,
  };
}

/**
 * Wrap the fake provider so tests can COUNT what actually got embedded (the
 * carry-forward assertions) and deterministically fail one chunk's text (the
 * poison assertions). Explicit field copies: `recipe` is a prototype getter
 * and the methods live on the prototype, so object spread would lose them.
 */
function instrumented(
  inner: EmbeddingProvider,
  onEmbed: (texts: readonly string[]) => void,
  failWhen?: (text: string) => boolean,
): EmbeddingProvider {
  return {
    providerId: inner.providerId,
    modelId: inner.modelId,
    dim: inner.dim,
    documentTaskLabel: inner.documentTaskLabel,
    queryTaskLabel: inner.queryTaskLabel,
    recipe: inner.recipe,
    embed(texts: readonly string[], opts: { intent: Intent }): Promise<number[][]> {
      onEmbed(texts);
      if (failWhen !== undefined && texts.some(failWhen)) {
        return Promise.reject(new Error("deterministic reject: poison text"));
      }
      return inner.embed(texts, opts);
    },
    isRetryable: () => false,
    isRetryableQuery: () => false,
    reset: () => undefined,
  };
}

describe.runIf(adminDsn !== "")("ingest pipeline db acceptance", () => {
  const TENANT = "demo";
  const CORPUS = "demo-rulebook";
  const scope: SearchScope = {
    tenantId: TENANT,
    corpusId: CORPUS,
    kinds: null,
    pinnedGeneration: null,
  };
  const instance = instanceOf(TENANT, CORPUS);
  const fake = buildShippedProvider("fake", { apiKey: null, dim: DIM });

  let admin: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;
  let tmp: string;
  /** Chunk count of the fixture tree, pinned by the first ingest. */
  let totalChunks = 0;

  beforeAll(async () => {
    dbName = `ksor_ing_${randomBytes(4).toString("hex")}`;
    admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminDsn);
    url.pathname = `/${dbName}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, DIM);
    // The grant table row is the ingest AUTHORIZATION; the policy checks
    // current_user AFTER the SET LOCAL ROLE pin, so the row names the ingest
    // role itself (found live 2026-08-19, kernel.db.test.ts).
    await pool.query(
      "INSERT INTO ingest_tenant_grants (role_name, tenant_id)" +
        " VALUES ('sor_content_ingest', 'demo'), ('sor_content_ingest', 'poison')," +
        " ('sor_content_ingest', 'tolerant'), ('sor_content_ingest', 'shrink')",
    );
    tmp = await mkdtemp(join(tmpdir(), "ksor-ingest-"));
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (admin !== undefined) {
      if (dbName !== undefined)
        await admin.query(`DROP DATABASE IF EXISTS ${dbName}`).catch(() => undefined);
      await admin.end();
    }
    if (tmp !== undefined) await rm(tmp, { recursive: true, force: true });
  }, 60_000);

  it("(1) full ingest of the fixture tree with flip: generation 1 active, search finds real content", async () => {
    const report = await buildGeneration(pool, instance, {
      knowledgeDir: FIXTURE,
      sourceCommit: "commit-1",
      flip: true,
      provider: fake,
    });
    totalChunks = report.chunks;
    expect(report.generation, JSON.stringify(report)).toBe(1);
    expect(report.nodes).toBe(10);
    expect(report.sources).toBe(10);
    expect(report.chunks).toBeGreaterThan(0);
    expect(report.carried).toBe(0);
    expect(report.embedded).toBe(report.chunks);
    expect(report.failed).toBe(0);
    expect(report.ready).toBe(true);
    expect(report.centroids, "prose centroids must materialize").toBeGreaterThan(0);
    expect(report.flipped).toBe(true);
    expect(report.refusal).toBeNull();

    const pointer = await pool.query(
      "SELECT active_generation, rollback_generation FROM corpora WHERE tenant_id = $1 AND corpus_id = $2",
      [TENANT, CORPUS],
    );
    expect(Number(pointer.rows[0].active_generation)).toBe(1);

    const run = await pool.query(
      "SELECT state, source_commit, instance_bundle_sha256 FROM ingestion_runs WHERE tenant_id = $1 AND generation = 1",
      [TENANT],
    );
    expect(run.rows[0].state).toBe("active");
    expect(run.rows[0].source_commit).toBe("commit-1");
    expect(String(run.rows[0].instance_bundle_sha256), "the manifest digest is recorded").toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );

    const ledger = await pool.query(
      "SELECT count(*)::int AS n FROM retrieval_log WHERE tenant_id = $1 AND action = 'generation_activated'",
      [TENANT],
    );
    expect(ledger.rows[0].n, "the flip leaves its ledger row").toBe(1);

    const [queryVector] = await aembedIntent(["laser cutter approved materials PVC chlorine"], {
      provider: fake,
      intent: "query",
    });
    const { hits, topCosine } = await runRead(
      pool,
      TENANT,
      (c) => hybridSearch(c, scope, queryVector!, "laser cutter PVC chlorine", 10),
      VECTOR_TXN_GUCS,
    );
    expect(hits.length, JSON.stringify(hits.map((h) => h.slug))).toBeGreaterThan(0);
    expect(hits[0]?.slug, "the laser-cutter rule must rank first").toBe("laser-cutter");
    expect(hits[0]?.generation).toBe(1);
    // No absolute-cosine floor asserted: the dim-8 bag-of-tokens fake gives a
    // correct RANKING, but its raw cosine for a long document vs a short
    // query is noise-scaled (measured 2026-08-19: ≈ -0.2 here).
    expect(topCosine, "the vector arm must report its top-1 cosine").not.toBeNull();
    expect(Number.isFinite(topCosine), `topCosine=${topCosine}`).toBe(true);
  }, 120_000);

  it("(2) re-ingest of the SAME tree: carry-forward copies every vector, zero new embeds, generation 2 active", async () => {
    const embedded: string[] = [];
    const report = await buildGeneration(pool, instance, {
      knowledgeDir: FIXTURE,
      sourceCommit: "commit-2",
      flip: true,
      provider: instrumented(fake, (texts) => embedded.push(...texts)),
    });
    expect(report.generation).toBe(2);
    expect(report.chunks).toBe(totalChunks);
    expect(report.carried, JSON.stringify(report)).toBe(totalChunks);
    expect(report.embedded).toBe(0);
    expect(embedded, "the provider must never be called on an unchanged tree").toEqual([]);
    expect(report.flipped).toBe(true);

    const pointer = await pool.query(
      "SELECT active_generation, rollback_generation FROM corpora WHERE tenant_id = $1 AND corpus_id = $2",
      [TENANT, CORPUS],
    );
    expect(Number(pointer.rows[0].active_generation)).toBe(2);
    expect(Number(pointer.rows[0].rollback_generation), "gen 1 is the rollback").toBe(1);
  }, 120_000);

  it("(3) one edited doc: only its chunks re-embed; everything else carries", async () => {
    const edited = join(tmp, "gen3", "docs");
    await cp(FIXTURE, edited, { recursive: true });
    await appendFile(
      join(edited, "machine-rules", "table-saw.md"),
      "\nNew stewards must renew the blade-guard checkout annually.\n",
      "utf8",
    );
    const embedded: string[] = [];
    const report = await buildGeneration(pool, instance, {
      knowledgeDir: edited,
      sourceCommit: "commit-3",
      flip: true,
      provider: instrumented(fake, (texts) => embedded.push(...texts)),
    });
    expect(report.generation).toBe(3);
    expect(report.chunks).toBe(totalChunks);
    expect(embedded.length, `re-embedded: ${JSON.stringify(embedded)}`).toBe(1);
    expect(embedded[0], "the one re-embed is the edited doc's chunk").toContain("blade-guard");
    expect(report.embedded).toBe(1);
    expect(report.carried).toBe(totalChunks - 1);
    expect(report.flipped).toBe(true);
  }, 120_000);

  it("(4a) ready gate refuses: one poison chunk in a small tree exceeds the 2% floor", async () => {
    // A separate tenant: generation_health counts chunks per (tenant,
    // generation), so the poison corpus must not share generation numbers
    // with the fixture corpus's rows.
    const poisonInstance = instanceOf("poison", "poison-rulebook");
    const report = await buildGeneration(pool, poisonInstance, {
      knowledgeDir: FIXTURE,
      sourceCommit: "poison-1",
      flip: true,
      provider: instrumented(
        fake,
        () => undefined,
        (text) => text.includes("chlorine gas"), // unique to one laser-cutter chunk
      ),
    });
    expect(report.failed, JSON.stringify(report)).toBe(1);
    expect(report.embedded).toBe(report.chunks - 1);
    expect(report.ready, `1/${report.chunks} > 2% must refuse readiness`).toBe(false);
    expect(report.flipped).toBe(false);
    expect(report.refusal).toBe("NOT READY — no flip (rerun to resume the queue)");

    const failedRows = await pool.query(
      "SELECT embed_error FROM chunks WHERE tenant_id = 'poison' AND embedding_status = 'failed'",
    );
    expect(failedRows.rows.length).toBe(1);
    expect(String(failedRows.rows[0].embed_error)).toContain("poison text");

    const run = await pool.query(
      "SELECT state FROM ingestion_runs WHERE tenant_id = 'poison' AND generation = 1",
    );
    expect(run.rows[0].state, "an un-ready run stays building (GC reaps it on staleness)").toBe(
      "building",
    );
    const pointer = await pool.query(
      "SELECT active_generation FROM corpora WHERE tenant_id = 'poison'",
    );
    expect(Number(pointer.rows[0].active_generation), "nothing serves").toBe(0);
  }, 120_000);

  it("(4b) ready gate tolerates: one poison chunk in a 60-doc tree is under 2% — run finalizes and flips", async () => {
    const root = join(tmp, "tolerant", "notes");
    await mkdir(root, { recursive: true });
    for (let i = 1; i <= 60; i++) {
      const marker = i === 7 ? "poisonword" : "wholesome";
      await writeFile(
        join(root, `rule-${String(i).padStart(3, "0")}.md`),
        `# Rule ${i}\n\nRule ${i} of the tolerant notes corpus is ${marker} and long enough to matter for the servable floor.\n`,
        "utf8",
      );
    }
    const tolerantInstance = instanceOf("tolerant", "tolerant-notes");
    const report = await buildGeneration(pool, tolerantInstance, {
      knowledgeDir: root,
      sourceCommit: "tolerant-1",
      flip: true,
      provider: instrumented(
        fake,
        () => undefined,
        (text) => text.includes("poisonword"),
      ),
    });
    expect(report.chunks, JSON.stringify(report)).toBe(60);
    expect(report.failed).toBe(1);
    expect(report.embedded).toBe(59);
    expect(report.ready, "1/60 ≈ 1.7% ≤ 2% must stay servable").toBe(true);
    expect(report.flipped).toBe(true);
    expect(report.refusal).toBeNull();
  }, 180_000);

  it("(5) shrink guard: a candidate that lost 70% of its nodes is READY but refused the flip; force overrides", async () => {
    const a = join(tmp, "shrink-a", "kb");
    const b = join(tmp, "shrink-b", "kb");
    await mkdir(a, { recursive: true });
    await mkdir(b, { recursive: true });
    for (let i = 1; i <= 10; i++) {
      const text = `# Note ${i}\n\nShrink-guard corpus note number ${i}, comfortably past the floor.\n`;
      await writeFile(join(a, `note-${i}.md`), text, "utf8");
      if (i <= 3) await writeFile(join(b, `note-${i}.md`), text, "utf8");
    }
    const shrinkInstance = instanceOf("shrink", "shrink-notes");
    const first = await buildGeneration(pool, shrinkInstance, {
      knowledgeDir: a,
      sourceCommit: "shrink-1",
      flip: true,
      provider: fake,
    });
    expect(first.flipped, JSON.stringify(first)).toBe(true);

    const refused = await buildGeneration(pool, shrinkInstance, {
      knowledgeDir: b,
      sourceCommit: "shrink-2",
      flip: true,
      provider: fake,
    });
    expect(refused.ready, "the candidate itself is healthy").toBe(true);
    expect(refused.flipped).toBe(false);
    expect(refused.refusal, JSON.stringify(refused.refusal)).toMatch(
      /^REFUSING FLIP: corpus shrank 70% vs gen 1 \(> KSOR_MAX_SHRINK=15%\)/,
    );
    const held = await pool.query(
      "SELECT active_generation FROM corpora WHERE tenant_id = 'shrink'",
    );
    expect(Number(held.rows[0].active_generation), "the old generation keeps serving").toBe(1);
    const run = await pool.query(
      "SELECT state FROM ingestion_runs WHERE tenant_id = 'shrink' AND generation = 2",
    );
    expect(run.rows[0].state, "refused flip leaves the run ready, unserved").toBe("ready");

    const forced = await buildGeneration(pool, shrinkInstance, {
      knowledgeDir: b,
      sourceCommit: "shrink-3",
      flip: true,
      force: true,
      provider: fake,
    });
    expect(forced.flipped, "force acknowledges the shrink").toBe(true);
  }, 180_000);

  it("(6) gc: token grace holds first; then the oldest retired generation reaps while active + rollback survive", async () => {
    // Immediately after the flips, retirement is inside the 40-min token grace.
    const graced = await runGc(pool, instance);
    expect(graced.collectable, "grace must hold just after retirement").toEqual([]);

    const later = new Date(Date.now() + GC_GRACE_MS + 60_000);
    const dry = await runGc(pool, instance, { dryRun: true, now: later });
    expect(dry.collectable, "gen 1 (retired, not rollback) is the only collectable").toEqual([1]);
    expect(dry.reaped).toEqual([]);

    const report = await runGc(pool, instance, { now: later });
    expect(report.reaped).toEqual([1]);

    const states = await pool.query(
      "SELECT generation, state FROM ingestion_runs WHERE tenant_id = $1 ORDER BY generation",
      [TENANT],
    );
    const byGen = Object.fromEntries(states.rows.map((r) => [Number(r.generation), r.state]));
    expect(byGen, JSON.stringify(byGen)).toEqual({ 1: "reaped", 2: "retired", 3: "active" });

    const gen1 = await pool.query(
      "SELECT (SELECT count(*)::int FROM chunks WHERE tenant_id = $1 AND generation = 1) AS chunks," +
        " (SELECT count(*)::int FROM content_nodes WHERE tenant_id = $1 AND generation = 1) AS nodes," +
        " (SELECT count(*)::int FROM node_centroids WHERE tenant_id = $1 AND generation = 1) AS centroids",
      [TENANT],
    );
    expect(gen1.rows[0]).toEqual({ chunks: 0, nodes: 0, centroids: 0 });
    const survivors = await pool.query(
      "SELECT generation, count(*)::int AS n FROM chunks WHERE tenant_id = $1 GROUP BY generation ORDER BY generation",
      [TENANT],
    );
    expect(
      survivors.rows.map((r) => Number(r.generation)),
      "active + rollback content survives",
    ).toEqual([2, 3]);
    const ledger = await pool.query(
      "SELECT count(*)::int AS n FROM retrieval_log WHERE tenant_id = $1",
      [TENANT],
    );
    expect(ledger.rows[0].n, "reap never touches the ledger").toBeGreaterThanOrEqual(3);

    const again = await runGc(pool, instance, { now: later });
    expect(again.collectable, "rollback + min-complete now hold everything").toEqual([]);
  }, 120_000);

  it("(7) rollback restores the prior generation and logs the CHECK-allowed action", async () => {
    const restored = await runIngest(pool, TENANT, (c) =>
      rollback(c, { tenantId: TENANT, corpusId: CORPUS }),
    );
    expect(restored).toBe(2);
    const pointer = await pool.query(
      "SELECT active_generation FROM corpora WHERE tenant_id = $1 AND corpus_id = $2",
      [TENANT, CORPUS],
    );
    expect(Number(pointer.rows[0].active_generation)).toBe(2);
    const states = await pool.query(
      "SELECT generation, state FROM ingestion_runs WHERE tenant_id = $1 AND generation IN (2, 3) ORDER BY generation",
      [TENANT],
    );
    expect(states.rows.map((r) => r.state)).toEqual(["active", "retired"]);
    const row = await pool.query(
      "SELECT detail FROM retrieval_log WHERE tenant_id = $1 AND action = 'generation_activated'" +
        " AND detail->>'rolled_back' = 'true'",
      [TENANT],
    );
    expect(row.rows.length, "the rollback rides the CHECK-allowed action with a detail flag").toBe(
      1,
    );
  }, 120_000);
});

describe.runIf(adminDsn === "")("ingest pipeline db acceptance (gated)", () => {
  it("skipped — set KSOR_DB_URL to run against Postgres + pgvector", () => {
    expect(adminDsn).toBe("");
  });
});
