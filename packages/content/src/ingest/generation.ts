/**
 * The generational build lifecycle — converted from the oracle
 * (sor-agentfactory @ b554f91, sor_content/ingest/generation.py).
 *
 * Build invisibly at generation N+1 under the per-tenant advisory lock;
 * CARRY-FORWARD embeddings from the ACTIVE generation first, then the newest
 * complete one (an embedding copies ONLY when chunk_hash AND
 * heading_path_text AND the node title all match — everything that feeds
 * `embedInput` must be identical, or the chunk re-embeds); materialize
 * centroids at finalization; flip in one statement; GC by the §5 algebra.
 *
 * Every function here takes a client that is already inside a scoped
 * transaction (runIngest binds the tenant GUC + the ingest role) — the
 * transaction SHAPE is the caller's contract, exactly as in the oracle.
 */

import type pg from "pg";

import { TOKEN_TTL_S } from "../lib/snapshot.js";

/** §5 rule 2: snapshot-token TTL (30 min) + 10 min = 40 min from retirement. */
export const GC_GRACE_MS: number = (TOKEN_TTL_S + 10 * 60) * 1000;
/** §5 rule 3. */
export const MIN_COMPLETE_GENERATIONS: number = 2;
export const ABANDONED_AFTER_MS: number = 24 * 60 * 60 * 1000;
/**
 * Poison-chunk tolerance (oracle review: poison-chunk-wedge): one
 * deterministically-failing chunk must not wedge every future flip forever. A
 * generation is servable if a SMALL fraction failed — the read path already
 * filters to `embedded`, so a quarantined chunk is simply absent, not
 * corrupt. Above the fraction, a real ingest break is signalled by
 * withholding readiness.
 */
export const MAX_FAILED_FRACTION: number = 0.02;

// The key string stays 'sor-ingest:' verbatim (SQL crosses verbatim; changing
// it would drop lock mutual-exclusion against any process still on the old key).
const LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtextextended('sor-ingest:' || $1, 0))";

export interface RunAllocation {
  readonly runId: number;
  readonly generation: number;
}

/**
 * Take the tenant lock, allocate generation max+1 (monotonic per corpus,
 * never reused), open the building run. The corpora row seeds at
 * active_generation=0 (nothing active) on first ingest.
 *
 * `manifestSha256` fills `instance_bundle_sha256` — ksor has no bundle
 * transport (the CLI reads the local repo), so the recorded digest is of the
 * manifest this build actually consumed: the closest honest provenance.
 */
export async function allocateRun(
  client: pg.PoolClient,
  opts: {
    tenantId: string;
    corpusId: string;
    sourceCommit: string;
    manifestSha256: string;
  },
): Promise<RunAllocation> {
  await client.query(LOCK_SQL, [opts.tenantId]);
  await client.query(
    "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $2, 0) " +
      "ON CONFLICT (tenant_id, corpus_id) DO NOTHING",
    [opts.tenantId, opts.corpusId],
  );
  const next = await client.query(
    "SELECT COALESCE(max(generation), 0) + 1 AS next FROM ingestion_runs WHERE tenant_id = $1 AND corpus_id = $2",
    [opts.tenantId, opts.corpusId],
  );
  const generation = Number(next.rows[0].next);
  const run = await client.query(
    "INSERT INTO ingestion_runs (tenant_id, corpus_id, generation, state, source_commit," +
      " instance_bundle_sha256) VALUES ($1, $2, $3, 'building', $4, $5) RETURNING run_id",
    [opts.tenantId, opts.corpusId, generation, opts.sourceCommit, opts.manifestSha256],
  );
  return { runId: Number(run.rows[0].run_id), generation };
}

/**
 * The generation to carry embeddings FROM: the newest COMPLETE one holding
 * embedded chunks.
 *
 * WHY NOT ONLY THE ACTIVE ONE: the eval-before-flip design means a candidate
 * is often built, measured, and deliberately NOT served; ACTIVE then points
 * at an OLD generation and the next candidate re-embeds the whole corpus —
 * measured 2026-08-02: generation 4 re-embedded 5,915 chunks while
 * generation 3 held near-identical content, because generation 1 was still
 * active.
 *
 * Two constraints a rewrite once dropped (oracle review of PR #420):
 * CORPUS-SCOPED via the run-table join (chunks carry no corpus_id), and
 * COMPLETE RUNS ONLY (ready/active/retired) — a crashed `building` queue's
 * half-drained vectors never qualify.
 *
 * Returns 0 when there is no complete embedded generation — the first ingest.
 */
export async function bestCarrySource(
  client: pg.PoolClient,
  opts: { tenantId: string; corpusId: string; excludeGeneration: number },
): Promise<number> {
  const res = await client.query(
    `
    SELECT max(c.generation) AS gen FROM chunks c
    JOIN ingestion_runs r ON r.tenant_id = c.tenant_id AND r.generation = c.generation
    WHERE c.tenant_id = $1 AND r.corpus_id = $2
      AND r.state IN ('ready', 'active', 'retired')
      AND c.generation <> $3 AND c.embedding_status = 'embedded'
    `,
    [opts.tenantId, opts.corpusId, opts.excludeGeneration],
  );
  const gen: unknown = res.rows[0]?.gen ?? null;
  return gen === null ? 0 : Number(gen);
}

/**
 * The carry-forward MATCH KEY, factored pure: an embedding is a pure function
 * of (embed input, model), and the embed input is exactly (node title,
 * heading_path_text, content→chunk_hash) — so a vector copies iff all four
 * fields match. `carryForward`'s SQL is the operative implementation; this
 * function is its pinned, testable specification (the NULL-safe
 * heading_path_text comparison mirrors SQL `IS NOT DISTINCT FROM`).
 */
export interface CarryKey {
  readonly chunkHash: string;
  readonly headingPathText: string | null;
  readonly nodeTitle: string;
  readonly embeddingModel: string;
}

export function carryKeyMatches(oldKey: CarryKey, newKey: CarryKey): boolean {
  return (
    oldKey.chunkHash === newKey.chunkHash &&
    // IS NOT DISTINCT FROM: null matches null, never a string.
    oldKey.headingPathText === newKey.headingPathText &&
    oldKey.nodeTitle === newKey.nodeTitle &&
    oldKey.embeddingModel === newKey.embeddingModel
  );
}

/**
 * Copy embeddings for chunks whose ENTIRE embed input is unchanged (hash +
 * heading path + node title). Cost ∝ change survives the generational
 * rebuild. Returns rows carried.
 *
 * `modelId` is REQUIRED, never defaulted here: the vendor transport is
 * irrelevant to the space (the same model through two providers is the same
 * space), and a silent module default is exactly how a model bump would
 * carry stale vectors unnoticed.
 */
export async function carryForward(
  client: pg.PoolClient,
  opts: { tenantId: string; generation: number; fromGeneration: number; modelId: string },
): Promise<number> {
  if (opts.fromGeneration < 1) return 0;
  const res = await client.query(
    `
    UPDATE chunks new SET embedding = old.embedding, embedding_status = 'embedded',
           embedded_at = old.embedded_at, embedding_model = old.embedding_model
    FROM chunks old, sources os, content_nodes onode, sources ns, content_nodes nnode
    WHERE new.tenant_id = $1 AND new.generation = $2
      AND new.embedding_status = 'pending'
      AND old.tenant_id = new.tenant_id AND old.generation = $3
      AND old.embedding_status = 'embedded'
      -- R-1 gate (oracle review: carry-model-gate-r1): carry ONLY vectors from the CURRENT
      -- embedding model. Without this, a model bump silently carries every old-model vector
      -- forward (pending→0, flip → corpus-wide nonsense cosine vs the new query model, zero
      -- errors). A model change now correctly leaves the old vectors pending → they re-embed.
      AND old.embedding_model = $4
      AND old.source_id = new.source_id
      AND old.chunk_hash = new.chunk_hash
      AND old.heading_path_text IS NOT DISTINCT FROM new.heading_path_text
      AND os.source_id = old.source_id AND os.tenant_id = old.tenant_id
      AND os.generation = old.generation
      AND onode.node_id = os.node_id AND onode.tenant_id = os.tenant_id
      AND ns.source_id = new.source_id AND ns.tenant_id = new.tenant_id
      AND ns.generation = new.generation
      AND nnode.node_id = ns.node_id AND nnode.tenant_id = ns.tenant_id
      AND onode.title = nnode.title
    `,
    [opts.tenantId, opts.generation, opts.fromGeneration, opts.modelId],
  );
  return res.rowCount ?? 0;
}

/**
 * avg(embedding) per node over servable prose — rows the routing arm reads
 * (never aggregate at query time again). nav/embed/assessment chunks never
 * pollute routing centroids.
 */
export async function materializeCentroids(
  client: pg.PoolClient,
  opts: { tenantId: string; generation: number },
): Promise<number> {
  await client.query("DELETE FROM node_centroids WHERE tenant_id = $1 AND generation = $2", [
    opts.tenantId,
    opts.generation,
  ]);
  const res = await client.query(
    `
    INSERT INTO node_centroids (tenant_id, generation, node_id, stable_id, chunk_count, embedding)
    SELECT c.tenant_id, c.generation, n.node_id, n.stable_id, count(*), avg(c.embedding)
    FROM chunks c
    JOIN sources s ON s.source_id = c.source_id AND s.tenant_id = c.tenant_id
                  AND s.generation = c.generation
    JOIN content_nodes n ON n.node_id = s.node_id AND n.tenant_id = s.tenant_id
    WHERE c.tenant_id = $1 AND c.generation = $2 AND c.embedding_status = 'embedded'
      AND c.labels->>'source_type' = 'prose'
    GROUP BY c.tenant_id, c.generation, n.node_id, n.stable_id
    `,
    [opts.tenantId, opts.generation],
  );
  return res.rowCount ?? 0;
}

export interface GenerationHealth {
  readonly generation: number;
  readonly embedded: number;
  readonly pending: number;
  readonly failed: number;
}

/**
 * The ready gate, factored pure: zero PENDING (the queue drained) + some
 * embedded content + failures within tolerance. The read path serves only
 * `embedded`, so a failed chunk is quarantined, not corrupt.
 */
export function generationReady(health: GenerationHealth): boolean {
  if (health.pending !== 0 || health.embedded === 0) return false;
  const total = health.embedded + health.failed;
  return health.failed / total <= MAX_FAILED_FRACTION;
}

export async function generationHealth(
  client: pg.PoolClient,
  opts: { tenantId: string; generation: number },
): Promise<GenerationHealth> {
  const res = await client.query(
    "SELECT count(*) FILTER (WHERE embedding_status = 'embedded') AS embedded," +
      " count(*) FILTER (WHERE embedding_status = 'pending') AS pending," +
      " count(*) FILTER (WHERE embedding_status = 'failed') AS failed" +
      " FROM chunks WHERE tenant_id = $1 AND generation = $2",
    [opts.tenantId, opts.generation],
  );
  const row = res.rows[0];
  return {
    generation: opts.generation,
    embedded: Number(row.embedded),
    pending: Number(row.pending),
    failed: Number(row.failed),
  };
}

/**
 * The node-slug delta of a CANDIDATE generation vs the currently-active one —
 * the CHEAP structural pre-flip guard (no embeds, one query per generation).
 * A catastrophic content DROP (a half-walked tree, an adapter regression) is
 * caught BEFORE the flip serves it. Count-based, so a pure slug RENAME (one
 * removed + one added, net zero) never trips; a real deletion does.
 */
export interface FlipDelta {
  readonly priorGeneration: number;
  readonly priorSlugs: ReadonlySet<string>;
  readonly newSlugs: ReadonlySet<string>;
}

export function addedSlugs(delta: FlipDelta): string[] {
  return [...delta.newSlugs].filter((s) => !delta.priorSlugs.has(s)).sort();
}

export function removedSlugs(delta: FlipDelta): string[] {
  return [...delta.priorSlugs].filter((s) => !delta.newSlugs.has(s)).sort();
}

/**
 * Net fractional drop in node count vs the prior generation. Zero when the
 * prior generation is empty (a FIRST ingest has nothing to shrink from) so
 * the guard never trips on it.
 */
export function shrinkFraction(priorCount: number, newCount: number): number {
  if (priorCount === 0) return 0;
  return Math.max(0, priorCount - newCount) / priorCount;
}

/**
 * True when the corpus shrank by MORE than the tolerated fraction — the flip
 * should be refused unless the drop is explicitly acknowledged. A first
 * ingest is always safe.
 */
export function shrinkUnsafe(priorCount: number, newCount: number, maxShrink: number): boolean {
  return priorCount > 0 && shrinkFraction(priorCount, newCount) > maxShrink;
}

/** Read the node-slug sets of the active generation and the candidate; the caller decides. */
export async function flipDelta(
  client: pg.PoolClient,
  opts: { tenantId: string; corpusId: string; newGeneration: number },
): Promise<FlipDelta> {
  const pointer = await client.query(
    "SELECT active_generation FROM corpora WHERE tenant_id = $1 AND corpus_id = $2",
    [opts.tenantId, opts.corpusId],
  );
  const raw: unknown = pointer.rows[0]?.active_generation ?? null;
  const prior = raw === null ? 0 : Number(raw);

  const slugsOf = async (generation: number): Promise<ReadonlySet<string>> => {
    if (generation < 1) return new Set();
    const res = await client.query(
      "SELECT slug FROM content_nodes WHERE tenant_id = $1 AND generation = $2",
      [opts.tenantId, generation],
    );
    return new Set(res.rows.map((r): string => String(r.slug)));
  };

  return {
    priorGeneration: prior,
    priorSlugs: await slugsOf(prior),
    newSlugs: await slugsOf(opts.newGeneration),
  };
}

/**
 * Activation + run-state bookkeeping + the ledger row. The health gate is the
 * CALLER's duty — never partially activate. Serialized under the tenant
 * advisory lock (re-taken here: the allocate lock died with its own txn) and
 * MONOTONIC: only ever advances.
 */
export async function flip(
  client: pg.PoolClient,
  opts: { tenantId: string; corpusId: string; toGeneration: number },
): Promise<void> {
  await client.query(LOCK_SQL, [opts.tenantId]);
  const advanced = await client.query(
    "UPDATE corpora SET rollback_generation = active_generation, active_generation = $1," +
      " updated_at = now() WHERE tenant_id = $2 AND corpus_id = $3 AND active_generation < $1",
    [opts.toGeneration, opts.tenantId, opts.corpusId],
  );
  if (!advanced.rowCount) {
    throw new Error(
      `flip to generation ${opts.toGeneration} refused: active_generation is already >= it ` +
        "(an out-of-order or duplicate flip — refusing to regress the served corpus)",
    );
  }
  // Retirement stamps finished_at = now() so the §5 token grace measures from
  // RETIREMENT (when a snapshot token could still reference this generation),
  // not from build (oracle review: gc-grace-from-finalize).
  await client.query(
    "UPDATE ingestion_runs SET state = 'retired', finished_at = now()" +
      " WHERE tenant_id = $1 AND corpus_id = $2 AND state = 'active'",
    [opts.tenantId, opts.corpusId],
  );
  await client.query(
    "UPDATE ingestion_runs SET state = 'active', finished_at = COALESCE(finished_at, now())" +
      " WHERE tenant_id = $1 AND corpus_id = $2 AND generation = $3",
    [opts.tenantId, opts.corpusId, opts.toGeneration],
  );
  await client.query(
    "INSERT INTO retrieval_log (tenant_id, corpus_id, generation, actor, action, detail)" +
      " VALUES ($1, $2, $3, 'sor-ingest', 'generation_activated', '{}')",
    [opts.tenantId, opts.corpusId, opts.toGeneration],
  );
}

/**
 * Restore the previously-active generation (the undo when a post-flip
 * acceptance eval fails). Goes BACKWARD by design, so it does NOT use the
 * monotonic guard. Returns the generation restored to serving; throws when
 * there is nothing to roll back to.
 */
export async function rollback(
  client: pg.PoolClient,
  opts: { tenantId: string; corpusId: string },
): Promise<number> {
  await client.query(LOCK_SQL, [opts.tenantId]);
  const res = await client.query(
    "UPDATE corpora SET active_generation = rollback_generation, updated_at = now()" +
      " WHERE tenant_id = $1 AND corpus_id = $2" +
      "   AND rollback_generation IS NOT NULL AND rollback_generation > 0" +
      " RETURNING active_generation",
    [opts.tenantId, opts.corpusId],
  );
  if (res.rows.length === 0) {
    throw new Error("rollback refused: no prior generation recorded (rollback_generation unset)");
  }
  const restored = Number(res.rows[0].active_generation);
  await client.query(
    "UPDATE ingestion_runs SET state = 'retired', finished_at = now()" +
      " WHERE tenant_id = $1 AND corpus_id = $2 AND state = 'active' AND generation <> $3",
    [opts.tenantId, opts.corpusId, restored],
  );
  await client.query(
    "UPDATE ingestion_runs SET state = 'active'" +
      " WHERE tenant_id = $1 AND corpus_id = $2 AND generation = $3",
    [opts.tenantId, opts.corpusId, restored],
  );
  // A rollback IS re-activating the prior generation — use the CHECK-allowed
  // 'generation_activated' action (recorded defect, oracle self-review D1:
  // 'generation_rolled_back' is NOT in the retrieval_log action CHECK, so the
  // INSERT raised and ABORTED the txn, un-doing the pointer restore — the
  // automated eval-fail rollback never actually rolled back).
  await client.query(
    "INSERT INTO retrieval_log (tenant_id, corpus_id, generation, actor, action, detail)" +
      ` VALUES ($1, $2, $3, 'sor-ingest', 'generation_activated', '{"rolled_back": true}')`,
    [opts.tenantId, opts.corpusId, restored],
  );
  return restored;
}

/**
 * The §5 algebra: not active, not rollback, past token grace since
 * retirement, ≥2 complete generations REMAIN after collection; abandoned
 * builds reap on heartbeat staleness alone (they were never served, no token
 * can reference them).
 */
export async function collectableGenerations(
  client: pg.PoolClient,
  opts: { tenantId: string; corpusId: string; now?: Date },
): Promise<number[]> {
  const ts = opts.now ?? new Date();
  const pointer = await client.query(
    "SELECT active_generation, rollback_generation FROM corpora WHERE tenant_id = $1 AND corpus_id = $2",
    [opts.tenantId, opts.corpusId],
  );
  if (pointer.rows.length === 0) return [];
  const active = Number(pointer.rows[0].active_generation);
  const rollbackRaw: unknown = pointer.rows[0].rollback_generation;
  const rollbackGen = rollbackRaw === null ? null : Number(rollbackRaw);
  const runs = await client.query(
    "SELECT generation, state, finished_at, heartbeat_at FROM ingestion_runs" +
      " WHERE tenant_id = $1 AND corpus_id = $2 AND state <> 'reaped' ORDER BY generation",
    [opts.tenantId, opts.corpusId],
  );
  const complete = runs.rows.filter((r) =>
    ["ready", "active", "retired"].includes(String(r.state)),
  );
  const out: number[] = [];
  let remaining = complete.length;
  for (const row of runs.rows) {
    const gen = Number(row.generation);
    const state = String(row.state);
    const finishedAt = row.finished_at as Date | null;
    const heartbeatAt = row.heartbeat_at as Date | null;
    if (state === "building") {
      if (heartbeatAt !== null && ts.getTime() - heartbeatAt.getTime() > ABANDONED_AFTER_MS) {
        out.push(gen); // never served; no token can reference it
      }
      continue;
    }
    if (gen === active || (rollbackGen !== null && gen === rollbackGen)) continue;
    if (finishedAt === null || ts.getTime() - finishedAt.getTime() < GC_GRACE_MS) continue;
    if (remaining - 1 < MIN_COMPLETE_GENERATIONS) continue;
    remaining -= 1;
    out.push(gen);
  }
  return out;
}

/**
 * Delete one generation's rows (chunks cascade from sources) and mark the run
 * reaped. NEVER touches takedown_denylist or retrieval_log — the ledger and
 * denylist outlive the content they governed (§5).
 */
export async function reap(
  client: pg.PoolClient,
  opts: { tenantId: string; generation: number },
): Promise<void> {
  for (const sql of [
    "DELETE FROM node_centroids WHERE tenant_id = $1 AND generation = $2",
    "DELETE FROM slug_aliases WHERE tenant_id = $1 AND generation = $2",
    "DELETE FROM sources WHERE tenant_id = $1 AND generation = $2",
  ]) {
    await client.query(sql, [opts.tenantId, opts.generation]);
  }
  // The parent FK is RESTRICT — delete leaf-first, level by level (quarried rule).
  for (;;) {
    const res = await client.query(
      "DELETE FROM content_nodes n WHERE n.tenant_id = $1 AND n.generation = $2" +
        " AND NOT EXISTS (SELECT 1 FROM content_nodes ch WHERE ch.parent_id = n.node_id" +
        "                  AND ch.tenant_id = n.tenant_id AND ch.generation = n.generation)",
      [opts.tenantId, opts.generation],
    );
    if (!res.rowCount) break;
  }
  await client.query(
    "UPDATE ingestion_runs SET state = 'reaped' WHERE tenant_id = $1 AND generation = $2",
    [opts.tenantId, opts.generation],
  );
}
