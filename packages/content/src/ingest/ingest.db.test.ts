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
import { cp, mkdtemp, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest, runRead } from "../db.js";
import { WHOLE_RECORD_SCOPE } from "../lib/audience.js";
import { applySchema } from "../schema.js";
import type { ContentInstance } from "../instance.js";
import { aembedIntent, type EmbeddingProvider, type Intent } from "../lib/embedding.js";
import { buildShippedProvider } from "../lib/providers/registry.js";
import { FAKE_EMBED_MODEL } from "../lib/providers/fake.js";
import { hybridSearch, VECTOR_TXN_GUCS, type SearchScope } from "../lib/search.js";
import { buildGeneration } from "./build.js";
import { checkEmbeddingSpace } from "../lib/space.js";
import { runGc } from "./gc.js";
import { GC_GRACE_MS, rollback } from "./generation.js";
import {
  instanceOf as fixtureInstance,
  profileDoc,
  writeIndexesAndLock,
  writeRecord,
} from "./fixtures/record-fixture.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;

/** The committed profile-shaped record: instance, policy, concepts, generated indexes, lock. */
const FIXTURE = fileURLToPath(new URL("./fixtures/record/demo-rulebook", import.meta.url));

function instanceOf(tenantId: string, corpusId: string): ContentInstance {
  return fixtureInstance(tenantId, corpusId, {
    embeddingModel: FAKE_EMBED_MODEL,
    embeddingDim: DIM,
  });
}

/** A record of `count` notes, each past the navigation floor; `present` names which survive. */
function notesRecord(
  root: string,
  name: string,
  count: number,
  present?: (i: number) => boolean,
): string {
  const docs: Record<string, string> = {};
  for (let i = 1; i <= count; i++) {
    if (present !== undefined && !present(i)) continue;
    docs[`note-${String(i).padStart(3, "0")}.md`] = profileDoc({
      title: `Note ${i}`,
      body: `# Note ${i}\n\nNote number ${i} of the ${name} corpus is wholesome and comfortably past the floor.\n`,
    });
  }
  return writeRecord(root, { name, docs });
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
    dbName = `ksor_ing_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
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
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
    if (tmp !== undefined) await rm(tmp, { recursive: true, force: true });
  }, 60_000);

  it("(1) full ingest of the fixture tree with flip: generation 1 active, search finds real content", async () => {
    const report = await buildGeneration(pool, instance, {
      recordRoot: FIXTURE,
      sourceCommit: "commit-1",
      flip: true,
      provider: fake,
    });
    totalChunks = report.chunks;
    expect(report.generation, JSON.stringify(report)).toBe(1);
    expect(report.nodes, "10 concepts + 3 sections").toBe(13);
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
      { ...VECTOR_TXN_GUCS, ...WHOLE_RECORD_SCOPE },
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

  it("(1b) a half-applied schema is a TYPED refusal before any embed spend (review round 2)", async () => {
    // Drop a database, apply the schema, then remove node_centroids.embedding
    // — the half-applied shape. The guard must NAME the missing table so the
    // ingest CLI refuses BEFORE embedding the whole corpus (double spend).
    const halfName = `ksor_half_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
    await admin.query(`CREATE DATABASE ${halfName}`);
    const halfUrl = new URL(adminDsn);
    halfUrl.pathname = `/${halfName}`;
    const halfPool = contentPool(halfUrl.toString(), 2);
    try {
      await applySchema(halfPool, DIM);
      await halfPool.query("ALTER TABLE node_centroids DROP COLUMN embedding");
      const check = await checkEmbeddingSpace(halfPool, "demo", "fake-embed-001", DIM);
      expect(check.missingTables, JSON.stringify(check)).toEqual(["node_centroids"]);
      expect(check.checked).toBe(false);
    } finally {
      await halfPool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${halfName}`).catch(() => undefined);
    }
  });

  it("(2) re-ingest of the SAME tree: carry-forward copies every vector, zero new embeds, generation 2 active", async () => {
    const embedded: string[] = [];
    const report = await buildGeneration(pool, instance, {
      recordRoot: FIXTURE,
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
    const edited = join(tmp, "gen3");
    await cp(FIXTURE, edited, { recursive: true });
    await appendFile(
      join(edited, "knowledge", "machine-rules", "table-saw.md"),
      "\nNew stewards must renew the blade-guard checkout annually.\n",
      "utf8",
    );
    // An edit without a rebuilt lock is refused (ksor-lock-stale); `ksor build` would rewrite it.
    writeIndexesAndLock(edited, "sha256:fixture-gen3");
    const embedded: string[] = [];
    const report = await buildGeneration(pool, instance, {
      recordRoot: edited,
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
      recordRoot: FIXTURE,
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
    expect(report.refusal, report.refusal ?? "").toMatch(/NOT READY — no flip/);

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
    const root = join(tmp, "tolerant");
    const docs: Record<string, string> = {};
    for (let i = 1; i <= 60; i++) {
      const marker = i === 7 ? "poisonword" : "wholesome";
      docs[`rule-${String(i).padStart(3, "0")}.md`] = profileDoc({
        title: `Rule ${i}`,
        body: `# Rule ${i}\n\nRule ${i} of the tolerant notes corpus is ${marker} and long enough to matter for the servable floor.\n`,
      });
    }
    writeRecord(root, { name: "tolerant-notes", docs });
    const tolerantInstance = instanceOf("tolerant", "tolerant-notes");
    const report = await buildGeneration(pool, tolerantInstance, {
      recordRoot: root,
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
    const a = notesRecord(join(tmp, "shrink-a"), "shrink-notes", 10);
    const b = notesRecord(join(tmp, "shrink-b"), "shrink-notes", 10, (i) => i <= 3);
    const shrinkInstance = instanceOf("shrink", "shrink-notes");
    const first = await buildGeneration(pool, shrinkInstance, {
      recordRoot: a,
      sourceCommit: "shrink-1",
      flip: true,
      provider: fake,
    });
    expect(first.flipped, JSON.stringify(first)).toBe(true);

    const refused = await buildGeneration(pool, shrinkInstance, {
      recordRoot: b,
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
      recordRoot: b,
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

  it("an UNCHANGED corpus at the SAME commit consumes no generation", async () => {
    // `pnpm serve` runs ingest on every start, so restarting an unedited
    // record must cost nothing: no new generation, no rows, no flip, no
    // embedding. A NEW commit over identical bytes still earns a generation —
    // that is a build fact, and provenance records it (test (2) pins that).
    // Assertions are relative so this can run after the sequence above.
    const baseline = await buildGeneration(pool, instance, {
      recordRoot: FIXTURE,
      sourceCommit: "commit-idempotent",
      flip: true,
      provider: fake,
    });
    expect(baseline.unchanged, "a new commit builds").toBe(false);

    const before = await runRead(pool, TENANT, async (c) => {
      const a = await c.query(
        "SELECT active_generation FROM corpora WHERE tenant_id = $1 AND corpus_id = $2",
        [TENANT, CORPUS],
      );
      const g = await c.query(
        "SELECT count(DISTINCT generation)::int AS n FROM content_nodes WHERE tenant_id = $1",
        [TENANT],
      );
      return { active: Number(a.rows[0]?.active_generation), gens: Number(g.rows[0]?.n) };
    });

    const again = await buildGeneration(pool, instance, {
      recordRoot: FIXTURE,
      sourceCommit: "commit-idempotent",
      flip: true,
      provider: fake,
    });
    expect(again.unchanged, "re-ingesting identical bytes at the same commit").toBe(true);
    expect(again.embedded, "no embedding spend").toBe(0);
    expect(again.generation, "names the generation still serving").toBe(before.active);

    const after = await runRead(pool, TENANT, async (c) => {
      const a = await c.query(
        "SELECT active_generation FROM corpora WHERE tenant_id = $1 AND corpus_id = $2",
        [TENANT, CORPUS],
      );
      const g = await c.query(
        "SELECT count(DISTINCT generation)::int AS n FROM content_nodes WHERE tenant_id = $1",
        [TENANT],
      );
      return { active: Number(a.rows[0]?.active_generation), gens: Number(g.rows[0]?.n) };
    });
    expect(after.active, "the active pointer must not move").toBe(before.active);
    expect(after.gens, "no generation was persisted").toBe(before.gens);
  }, 240_000);

  it("a TOOLCHAIN change is a change: the same bytes under a different chunk policy earn a generation", async () => {
    // The hole this closes, walked: `CHUNK_POLICY` moved v5 -> v6 with decision
    // 22's navigation rule, adopters were told to re-run `ksor ingest` to get
    // the re-classification, and ingest compared only bytes and governance —
    // so it reported "unchanged", published nothing, exited 0, and the
    // documents stayed unsearchable. The active generation is aged here rather
    // than the constant bumped, because the state under test is "the serving
    // generation was built by a different toolchain", however it got there.
    const settled = await buildGeneration(pool, instance, {
      recordRoot: FIXTURE,
      sourceCommit: "commit-toolchain",
      flip: true,
      provider: fake,
    });
    expect(
      (
        await buildGeneration(pool, instance, {
          recordRoot: FIXTURE,
          sourceCommit: "commit-toolchain",
          flip: true,
          provider: fake,
        })
      ).unchanged,
      "the baseline: identical bytes, identical toolchain",
    ).toBe(true);

    await runIngest(pool, TENANT, (c) =>
      c.query("UPDATE sources SET chunk_policy = $2 WHERE tenant_id = $1 AND generation = $3", [
        TENANT,
        "heading-aware-1500-content-only-v0",
        settled.generation,
      ]),
    );
    const rebuilt = await buildGeneration(pool, instance, {
      recordRoot: FIXTURE,
      sourceCommit: "commit-toolchain",
      flip: true,
      provider: fake,
    });
    expect(rebuilt.unchanged, "a stale chunk policy must NOT report unchanged").toBe(false);
    expect(rebuilt.generation, "and it publishes a new generation").toBeGreaterThan(
      settled.generation,
    );
  }, 240_000);

  it("a POLICY change is a change too — the door binds the run's policy row, not a file", async () => {
    // The registry and the authority sets are stored on the run and the door
    // reads them from there, so a governance edit that moves no document byte
    // still has to reach the database. Comparing only documents would leave the
    // door authorising against a policy the repository has already replaced.
    const settled = await buildGeneration(pool, instance, {
      recordRoot: FIXTURE,
      sourceCommit: "commit-policy",
      flip: true,
      provider: fake,
    });
    await runIngest(pool, TENANT, (c) =>
      c.query(
        "UPDATE ingestion_runs SET policy_sha256 = 'a-policy-this-record-no-longer-has'" +
          " WHERE tenant_id = $1 AND generation = $2",
        [TENANT, settled.generation],
      ),
    );
    const rebuilt = await buildGeneration(pool, instance, {
      recordRoot: FIXTURE,
      sourceCommit: "commit-policy",
      flip: true,
      provider: fake,
    });
    expect(rebuilt.unchanged, "a policy the run does not carry must NOT report unchanged").toBe(
      false,
    );
  }, 240_000);
});

describe.runIf(adminDsn === "")("ingest pipeline db acceptance (gated)", () => {
  it("skipped — set KSOR_DB_URL to run against Postgres + pgvector", () => {
    expect(adminDsn).toBe("");
  });
});

/**
 * An interrupted ingest must not throw away the vectors it already paid for.
 *
 * A killed run leaves its generation in state `building`, and `bestCarrySource`
 * accepted only `ready`/`active`/`retired` — so the rerun carried NOTHING and
 * re-embedded the whole corpus. Reproduced live against a managed Postgres: an
 * 81-document book, killed at 4,736 of 6,963 chunks, rerun reported
 * `carried 0, pending 6963` and started paying again (issue #97).
 *
 * The asymmetry is what makes it expensive. Interrupt a RE-ingest and a complete
 * generation still exists, so the rerun carries from it. Interrupt the FIRST
 * ingest and there is none — and the first ingest of a large corpus is the
 * longest, the least familiar, and the one most likely to be interrupted.
 *
 * Nothing about an abandoned run makes its vectors wrong: an embedding is a pure
 * function of (embed input, model), the match key already establishes identity,
 * and carry only ever fills `pending` rows. The run's state adds nothing to that
 * judgement — so it no longer gates it.
 *
 * Order still matters and is preserved: the ACTIVE generation is carried from
 * first (vetted vectors win), then complete generations newest-first, and only
 * then abandoned ones. Each pass fills what the last left pending, so priority
 * is expressed by order rather than by exclusion.
 */
describe.runIf(adminDsn !== "")("carry-forward across an interrupted run (db)", () => {
  const DB2 = `ksor_carry_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const T2 = "carry";
  const C2 = "carry-rulebook";
  const fake2 = buildShippedProvider("fake", { apiKey: null, dim: DIM });
  let pool2: pg.Pool;
  let admin2: pg.Pool;
  let inst2: ContentInstance;

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin2 = new Pool({ connectionString: adminDsn });
    await admin2.query(`CREATE DATABASE ${DB2}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB2}`;
    pool2 = contentPool(url.toString(), 4);
    await applySchema(pool2, DIM);
    // The grant row is the ingest AUTHORIZATION — the RLS policy checks
    // current_user after the SET LOCAL ROLE pin, so it names the ingest role.
    await pool2.query(
      "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', $1)",
      [T2],
    );
    inst2 = instanceOf(T2, C2);
  }, 300_000);

  afterAll(async () => {
    await pool2?.end().catch(() => undefined);
    await admin2?.query(`DROP DATABASE IF EXISTS ${DB2} WITH (FORCE)`).catch(() => undefined);
    await admin2?.end().catch(() => undefined);
  });

  it("carries from a generation whose run never finished", async () => {
    // Generation 1: built and embedded, but never flipped and never marked
    // ready — exactly what a killed `ksor ingest` leaves behind.
    const first = await buildGeneration(pool2, inst2, {
      recordRoot: FIXTURE,
      sourceCommit: "interrupted",
      flip: false,
      provider: fake2,
    });
    expect(first.generation).toBe(1);
    expect(first.embedded, "the first run did embed real vectors").toBeGreaterThan(0);

    // A finished-but-unflipped run lands in `ready`, which was ALREADY an
    // accepted carry source — so building the fixture that way proves nothing.
    // A KILLED run is the case: it never reaches the finalize step and stays
    // `building`. That is what is reproduced here, and asserted, because the
    // first version of this test passed against the unfixed code by testing
    // `ready` instead.
    await pool2.query(
      "UPDATE ingestion_runs SET state = 'building' WHERE tenant_id = $1 AND generation = 1",
      [T2],
    );
    const state = await pool2.query(
      "SELECT state FROM ingestion_runs WHERE tenant_id = $1 AND generation = 1",
      [T2],
    );
    expect(
      String(state.rows[0].state),
      "the fixture must be an ABANDONED run, or this proves nothing",
    ).toBe("building");

    // The rerun: same tree, nothing published, so the ONLY possible carry source
    // is the abandoned generation.
    const embedded: string[] = [];
    const second = await buildGeneration(pool2, inst2, {
      recordRoot: FIXTURE,
      sourceCommit: "rerun",
      flip: false,
      provider: instrumented(fake2, (texts) => embedded.push(...texts)),
    });
    expect(
      second.carried,
      `the abandoned run's vectors were thrown away: ${JSON.stringify(second)}`,
    ).toBe(first.chunks);
    expect(embedded, "and nothing was embedded a second time").toEqual([]);
  }, 300_000);
});
