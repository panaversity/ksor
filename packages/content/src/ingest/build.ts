/**
 * Build one generation from a knowledge tree — converted from the oracle
 * (sor-agentfactory @ b554f91, sor_content/ingest/build.py + the pipeline
 * sequencing of ingest/cli.py). ksor adaptation: NO bundle transport — the
 * pipeline reads the local repo (a `knowledge/` directory) through the
 * plain-tree adapter; digest provenance is the manifest actually consumed.
 *
 * Phases (`buildGeneration` sequences them; the embed worker runs BETWEEN,
 * holding no build transaction):
 *   1. `buildStructure` — nodes (parents first), sources, chunks (pending),
 *      carry-forward. ONE transaction with allocation: the whole structure of
 *      a generation lands or nothing does.
 *   2. the embed worker drains what carry-forward left pending — commit per
 *      batch, resumable.
 *   3. `finalize` — health gate, model-consistency gate, centroids, mark
 *      ready. The FLIP stays a separate, deliberate step.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type pg from "pg";

import { envFloat } from "../env.js";

import { runIngest } from "../db.js";
import type { ContentInstance } from "../instance.js";
import { embedIntent, vlit, type EmbeddingProvider } from "../lib/embedding.js";
import { chunkText, cleanBody, CHUNK_POLICY, headingPathText } from "./chunking.js";
import {
  addedSlugs,
  allocateRun,
  bestCarrySource,
  carryForward,
  flip,
  flipDelta,
  generationHealth,
  generationReady,
  materializeCentroids,
  removedSlugs,
  shrinkFraction,
  shrinkUnsafe,
  type GenerationHealth,
} from "./generation.js";
import { manifestToJson, sourceId, topological, type Manifest } from "./manifest.js";
import { contentHash, splitFrontmatter } from "./markdown.js";
import { buildManifest } from "./adapters/plain-tree.js";
import { BATCH, buildPendingSql, drain, FAIL_SQL, rowsToInputs, WRITE_SQL } from "./worker.js";

// The per-chunk insert columns — byte-similar to the oracle's _CHUNK_INSERT;
// delivered as multi-row VALUES batches (pg has no executemany pipeline; the
// contract is only "one round trip-ish, same transaction").
const CHUNK_INSERT_PREFIX =
  "INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content," +
  " chunk_hash, heading_path, heading_path_text, anchor, labels, embedding_status)" +
  " VALUES ";
const CHUNK_PARAMS = 10;
/** 500 rows × 10 params stays far under Postgres's 65535 bind-parameter cap. */
const CHUNK_ROWS_PER_STATEMENT = 500;

export interface BuildStats {
  readonly nodes: number;
  readonly sources: number;
  readonly chunks: number;
  readonly carried: number;
  readonly pending: number;
}

/**
 * Write the whole tree at `generation` (invisible until the flip), then carry
 * embeddings forward. Chunks insert `pending`; carry flips the unchanged ones.
 *
 * `modelId` (the embedding space — `provider.modelId`, threaded from the
 * ingest composition root; REQUIRED, no module default) is stamped on every
 * `sources` row (where the tenant-wide `trg_sources_one_model` trigger
 * enforces one space per database) and is the carry-forward skip-gate key.
 * `CHUNK_POLICY` stays the config constant: chunking is code, not transport.
 *
 * `files` maps each manifest path to its on-disk path (the plain-tree
 * adapter's `sources` map); `treeRoot` bounds where those paths may resolve.
 */
export async function buildStructure(
  client: pg.PoolClient,
  opts: {
    tenantId: string;
    corpusId: string;
    generation: number;
    manifest: Manifest;
    files: ReadonlyMap<string, string>;
    treeRoot: string;
    modelId: string;
  },
): Promise<BuildStats> {
  const { tenantId, generation, manifest, modelId } = opts;
  const nodeIds = new Map<string, string>();
  for (const n of topological(manifest.nodes)) {
    const res = await client.query(
      "INSERT INTO content_nodes (tenant_id, generation, stable_id, parent_id, kind, slug," +
        " title, summary, keywords, position, permalink)" +
        " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING node_id",
      [
        tenantId,
        generation,
        n.stable_id,
        n.parent !== null ? nodeIds.get(n.parent) : null,
        n.kind,
        n.slug,
        n.title,
        n.summary,
        n.keywords.length > 0 ? [...n.keywords] : null,
        n.position,
        n.permalink, // confirmed site route or NULL — never a guessed link
      ],
    );
    nodeIds.set(n.stable_id, String(res.rows[0].node_id));
  }

  const titles = new Map(manifest.nodes.map((n) => [n.stable_id, n.title]));
  const treeRoot = resolve(opts.treeRoot);
  let nSources = 0;
  let nChunks = 0;
  const chunkRows: unknown[][] = [];
  for (const f of manifest.files) {
    // The manifest's file paths are UNTRUSTED input to the kernel (the oracle's
    // bundle-path-traversal review): resolve each through the adapter's map and
    // refuse anything outside the knowledge tree — never read a path the walk
    // did not produce.
    const src = opts.files.get(f.path);
    if (src === undefined) {
      throw new Error(
        `manifest file ${JSON.stringify(f.path)} has no source in the knowledge tree — the adapter's map must name every manifest path`,
      );
    }
    const target = resolve(src);
    if (target !== treeRoot && !target.startsWith(treeRoot + sep)) {
      throw new Error(`knowledge path escapes the tree root: ${JSON.stringify(src)}`);
    }
    const raw = await readFile(target, "utf8");
    const { body: rawBody } = splitFrontmatter(raw);
    // Normalize + strip as ONE ordered unit (cleanBody): CRLF→LF first, then
    // style/presentation stripping, so the skip-gate hash and every chunk_hash
    // are line-ending-stable and served chunks reassemble the CLEANED body
    // byte-exact. Frontmatter meta is DISCARDED — taxonomy/summary/keywords
    // come from the MANIFEST; frontmatter is the adapter's input, not the
    // kernel's. (Why the order is load-bearing: see cleanBody, review 2026-08-19.)
    const body = cleanBody(rawBody);
    const sid = sourceId(f.path);
    const title = f.title !== null && f.title !== "" ? f.title : titles.get(f.node)!;
    await client.query(
      "INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path," +
        " content_hash, embedding_model, chunk_policy, source_commit)" +
        " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
      [
        tenantId,
        generation,
        sid,
        nodeIds.get(f.node),
        title,
        f.path,
        contentHash(body),
        modelId,
        CHUNK_POLICY,
        manifest.source_commit,
      ],
    );
    nSources += 1;
    for (const chunk of chunkText(body)) {
      chunkRows.push([
        tenantId,
        generation,
        sid,
        chunk.ordinal,
        chunk.content,
        chunk.chunkHash,
        JSON.stringify(chunk.headingPath),
        headingPathText(chunk.headingPath) || null, // empty string → NULL, as the oracle
        chunk.anchor,
        JSON.stringify({ source_type: chunk.sourceType }),
      ]);
      nChunks += 1;
    }
  }

  // All sources are inserted per-row ABOVE, so the chunk→source FK holds;
  // nodes/sources stay per-row (nodes need RETURNING for the parent map).
  for (let i = 0; i < chunkRows.length; i += CHUNK_ROWS_PER_STATEMENT) {
    const slice = chunkRows.slice(i, i + CHUNK_ROWS_PER_STATEMENT);
    const groups = slice.map((_, row) => {
      const base = row * CHUNK_PARAMS;
      return (
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5},` +
        ` $${base + 6}, $${base + 7}::jsonb, $${base + 8}, $${base + 9}, $${base + 10}::jsonb, 'pending')`
      );
    });
    await client.query(CHUNK_INSERT_PREFIX + groups.join(", "), slice.flat());
  }

  // Carry in TWO passes (oracle review of PR #420):
  //   1. From the ACTIVE generation — vetted vectors first, so a withheld
  //      candidate's vectors can never propagate through the stable bulk of
  //      the corpus; a build→measure→withhold loop self-heals.
  //   2. From the newest COMPLETE generation, for whatever pass 1 left
  //      pending — the re-embed-bill fix. Safe because carryForward only
  //      touches 'pending' chunks, so pass 2 can never overwrite pass 1.
  const pointer = await client.query(
    "SELECT active_generation FROM corpora WHERE tenant_id = $1 AND corpus_id = $2",
    [tenantId, opts.corpusId],
  );
  const activeRaw: unknown = pointer.rows[0]?.active_generation ?? null;
  const active = activeRaw === null ? 0 : Number(activeRaw);
  let carried = 0;
  if (active !== 0 && active !== generation) {
    carried += await carryForward(client, {
      tenantId,
      generation,
      fromGeneration: active,
      modelId,
    });
  }
  const newest = await bestCarrySource(client, {
    tenantId,
    corpusId: opts.corpusId,
    excludeGeneration: generation,
  });
  if (newest !== 0 && newest !== active) {
    carried += await carryForward(client, {
      tenantId,
      generation,
      fromGeneration: newest,
      modelId,
    });
  }
  const health = await generationHealth(client, { tenantId, generation });
  return {
    nodes: nodeIds.size,
    sources: nSources,
    chunks: nChunks,
    carried,
    pending: health.pending,
  };
}

export interface FinalizeResult {
  readonly ready: boolean;
  readonly centroids: number;
}

/**
 * The pre-flip gate: health must be READY — a generation is never partially
 * activated. `modelId` is the ONE embedding model every servable vector of
 * this generation must carry.
 */
export async function finalize(
  client: pg.PoolClient,
  opts: { tenantId: string; generation: number; modelId: string },
): Promise<FinalizeResult> {
  const health = await generationHealth(client, opts);
  if (!generationReady(health)) return { ready: false, centroids: 0 };
  // Model-consistency gate (oracle review: carry-model-gate-r1): every
  // SERVABLE vector must be the CURRENT embedding model. A mixed-model
  // generation would rank nonsense against the query model — refuse to
  // finalize it rather than flip corruption. The throw aborts the finalize
  // transaction; the run stays `building` and is eventually reaped as
  // abandoned (heartbeat staleness).
  const res = await client.query(
    "SELECT DISTINCT embedding_model FROM chunks" +
      " WHERE tenant_id = $1 AND generation = $2 AND embedding_status = 'embedded'",
    [opts.tenantId, opts.generation],
  );
  const models = res.rows.map((r): string => String(r.embedding_model)).sort();
  if (models.length > 0 && !(models.length === 1 && models[0] === opts.modelId)) {
    throw new Error(
      `generation ${opts.generation} has embedded models [${models.join(", ")}], expected [${JSON.stringify(opts.modelId)}]` +
        " — refusing to finalize a mixed-model generation",
    );
  }
  const centroids = await materializeCentroids(client, opts);
  await client.query(
    "UPDATE ingestion_runs SET state = 'ready', finished_at = now()" +
      " WHERE tenant_id = $1 AND generation = $2 AND state = 'building'",
    [opts.tenantId, opts.generation],
  );
  return { ready: true, centroids };
}

export interface BuildGenerationOptions {
  /** The knowledge tree the plain-tree adapter walks (any folder of Markdown). */
  readonly knowledgeDir: string;
  readonly sourceCommit: string;
  /** Activate the generation after a successful build; NEVER implicit. */
  readonly flip: boolean;
  /**
   * Acknowledge a node-count shrink beyond the guard — the programmatic form
   * of KSOR_ALLOW_SHRINK=1 (oracle env: SOR_ALLOW_SHRINK).
   */
  readonly force?: boolean;
  /** The one composed embedding provider; `provider.modelId` is threaded into every DB-writing step. */
  readonly provider: EmbeddingProvider;
  /** Progress lines; silent by default (the report carries every number). */
  readonly onLog?: (line: string) => void;
}

export interface BuildReport {
  readonly runId: number;
  readonly generation: number;
  readonly nodes: number;
  readonly sources: number;
  readonly chunks: number;
  readonly carried: number;
  readonly embedded: number;
  readonly failed: number;
  readonly ready: boolean;
  readonly centroids: number;
  readonly flipped: boolean;
  /**
   * Why the generation is NOT serving: the not-ready line or the flip-guard
   * refusal. null when it flipped, or when the flip was deliberately withheld
   * (flip: false) on a ready build.
   */
  readonly refusal: string | null;
  readonly health: GenerationHealth;
}

/**
 * The whole write plane, sequenced: plain-tree manifest → ONE structure
 * transaction (allocate + nodes + sources + chunks + carry-forward) → drain
 * the embed queue (commit per batch, NO transaction held across batches) →
 * finalize (+ optional flip, same transaction). Returns the report; the CLI
 * turns `refusal` into stderr + exit 1.
 */
export async function buildGeneration(
  pool: pg.Pool,
  instance: ContentInstance,
  options: BuildGenerationOptions,
): Promise<BuildReport> {
  const log = options.onLog ?? ((): void => undefined);
  const provider = options.provider;
  const modelId = provider.modelId; // the persisted identity of this build's embedding space
  const tenant = instance.tenantId;

  const { manifest, sources } = await buildManifest(options.knowledgeDir, {
    corpusId: instance.corpusId,
    sourceCommit: options.sourceCommit,
    onSkip: log,
  });
  const manifestSha256 =
    "sha256:" +
    createHash("sha256")
      .update(JSON.stringify(manifestToJson(manifest)), "utf8")
      .digest("hex");

  // ---- allocate + structure + carry: ONE transaction (atomic per generation)
  const structure = await runIngest(pool, tenant, async (c) => {
    const alloc = await allocateRun(c, {
      tenantId: tenant,
      corpusId: instance.corpusId,
      sourceCommit: options.sourceCommit,
      manifestSha256,
    });
    const stats = await buildStructure(c, {
      tenantId: tenant,
      corpusId: instance.corpusId,
      generation: alloc.generation,
      manifest,
      files: sources,
      treeRoot: options.knowledgeDir,
      modelId,
    });
    return { ...alloc, stats };
  });
  const { runId, generation, stats } = structure;
  log(
    `run ${runId}: building generation ${generation} (embed ${provider.providerId}:${provider.recipe})`,
  );
  log(
    `structure: ${stats.nodes} nodes, ${stats.sources} sources, ${stats.chunks} chunks; ` +
      `carried ${stats.carried}, pending ${stats.pending}`,
  );

  // ---- embed queue (no build txn held; short txns per batch write)
  // The pending SELECT runs through runIngest (no statement timeout), NOT
  // runRead (15s serving timeout): on a large corpus the scan exceeds 15s,
  // hits 57014 (query_canceled, NEVER_RETRY), and aborts the build after the
  // generation was committed (review, 2026-08-19).
  const pendingRows = await runIngest(pool, tenant, async (c) => {
    const res = await c.query({
      text: buildPendingSql(),
      rowMode: "array",
      values: [tenant, generation],
    });
    return res.rows as unknown as (readonly [string, string, string, string])[];
  });
  const pending = rowsToInputs(pendingRows);
  log(`embedding ${pending.length} pending chunks (batch ${BATCH}) ...`);

  const { embedded, failed } = await drain(pending, {
    embedBatch: async (texts) =>
      // Document INTENT, said as an intent; same patient retry as the oracle door.
      (await embedIntent(texts, { provider, intent: "document" })).map(vlit),
    writeBatch: (rows) =>
      runIngest(pool, tenant, async (c) => {
        for (const [literal, chunkId] of rows) {
          await c.query(WRITE_SQL, [literal, modelId, chunkId]);
        }
        // Stamp the build heartbeat each batch so an ABANDONED build (crash
        // mid-embed) is GC-eligible on staleness (oracle review:
        // poison-chunk-wedge).
        await c.query("UPDATE ingestion_runs SET heartbeat_at = now() WHERE run_id = $1", [runId]);
      }),
    markFailed: (reason, chunkId) =>
      runIngest(pool, tenant, async (c) => {
        await c.query(FAIL_SQL, [reason, chunkId]);
      }),
    isRetryable: (exc) => provider.isRetryable(exc), // the ingest plane's PATIENT taxonomy (429 = retry)
  });
  log(`embedded ${embedded}, failed ${failed}`);

  // ---- finalize (+ optional flip), ONE transaction
  const fin = await runIngest(pool, tenant, async (c) => {
    const { ready, centroids } = await finalize(c, { tenantId: tenant, generation, modelId });
    const health = await generationHealth(c, { tenantId: tenant, generation });
    if (!ready) {
      return {
        ready,
        centroids,
        health,
        flipped: false,
        refusal:
          "NOT READY — no flip. A rerun starts a FRESH generation and carries " +
          "forward every vector from the last complete generation, re-embedding " +
          "only what changed or failed (review finding, 2026-08-19: there is no " +
          "in-place queue resume — allocateRun always allocates).",
      };
    }
    if (!options.flip) return { ready, centroids, health, flipped: false, refusal: null };
    const delta = await flipDelta(c, {
      tenantId: tenant,
      corpusId: instance.corpusId,
      newGeneration: generation,
    });
    const added = addedSlugs(delta);
    const removed = removedSlugs(delta);
    log(
      `pre-flip delta vs gen ${delta.priorGeneration}: ` +
        `${delta.priorSlugs.size} -> ${delta.newSlugs.size} nodes (+${added.length} / -${removed.length})`,
    );
    if (removed.length > 0) log(`  removed: ${JSON.stringify(removed.slice(0, 20))}`);
    if (added.length > 0) log(`  added:   ${JSON.stringify(added.slice(0, 20))}`);
    // oracle env names: SOR_MAX_SHRINK / SOR_ALLOW_SHRINK. KSOR_MAX_SHRINK is a
    // FRACTION in [0,1]. A value above 1 — "15" meant as a percentage — would
    // silently DISABLE this catastrophic-drop guard (shrinkFraction is always
    // <= 1, so a threshold > 1 never fires), flipping a build that lost every
    // node straight to production. Reject it and keep the safe default rather
    // than un-guard the flip (review 2026-08-19).
    const configuredShrink = envFloat("KSOR_MAX_SHRINK", 0.15, 0.0);
    const maxShrink = configuredShrink <= 1 ? configuredShrink : 0.15;
    if (configuredShrink > 1) {
      log(
        `KSOR_MAX_SHRINK=${configuredShrink} is not a fraction in [0,1]; using ${maxShrink} ` +
          `(did you mean ${configuredShrink / 100}?)`,
      );
    }
    const allowed = options.force === true || process.env["KSOR_ALLOW_SHRINK"] === "1";
    if (shrinkUnsafe(delta.priorSlugs.size, delta.newSlugs.size, maxShrink) && !allowed) {
      const fraction = shrinkFraction(delta.priorSlugs.size, delta.newSlugs.size);
      return {
        ready,
        centroids,
        health,
        flipped: false,
        refusal:
          `REFUSING FLIP: corpus shrank ${pct(fraction)} vs gen ${delta.priorGeneration} ` +
          `(> KSOR_MAX_SHRINK=${pct(maxShrink)}); ${removed.length} node(s) vanished. ` +
          `Generation ${generation} is READY but NOT served — the old generation keeps serving. ` +
          "If the drop is intended, re-run with KSOR_ALLOW_SHRINK=1; otherwise fix the corpus and re-ingest.",
      };
    }
    await flip(c, { tenantId: tenant, corpusId: instance.corpusId, toGeneration: generation });
    log(`FLIPPED active generation -> ${generation}`);
    return { ready, centroids, health, flipped: true, refusal: null };
  });

  return {
    runId,
    generation,
    nodes: stats.nodes,
    sources: stats.sources,
    chunks: stats.chunks,
    carried: stats.carried,
    embedded,
    failed,
    ready: fin.ready,
    centroids: fin.centroids,
    flipped: fin.flipped,
    refusal: fin.refusal,
    health: fin.health,
  };
}

/** Python f"{x:.0%}" analogue. */
function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(0)}%`;
}
