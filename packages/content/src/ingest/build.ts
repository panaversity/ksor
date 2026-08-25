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
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type pg from "pg";

import { envFloat } from "../env.js";
import { MIN_CONTENT_CHARS } from "../config.js";

import { runIngest } from "../db.js";
import type { ContentInstance } from "../instance.js";
import { embedIntent, vlit, type EmbeddingProvider } from "../lib/embedding.js";
import { chunkText, cleanBody, CHUNK_POLICY, headingPathText } from "./chunking.js";
import {
  addedSlugs,
  allocateRun,
  carrySources,
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
import { contentHash } from "./markdown.js";
import { buildManifestFromRecord } from "./adapters/plain-tree.js";
import { applyLedger, unledgeredRefusal, unmergedLines } from "./ledger-apply.js";
import { checkLock, formatRefusals, LOCK_PATH, type IngestRefusal } from "./lock-gate.js";
import { checkRecord } from "../record/check.js";
import { splitFrontmatter } from "../record/frontmatter.js";
import {
  checkLedgerAppendOnly,
  parseLedger,
  type Ledger,
  type LedgerBaseline,
  type LedgerBaselineEntry,
} from "../record/ledger.js";
import { loadRecord } from "../record/load.js";
import type { Policy } from "../record/policy.js";
import type { Refusal } from "../record/refusal.js";
import { BATCH, buildPendingSql, drain, FAIL_SQL, rowsToInputs, WRITE_SQL } from "./worker.js";

// The per-chunk insert columns — byte-similar to the oracle's _CHUNK_INSERT;
// delivered as multi-row VALUES batches (pg has no executemany pipeline; the
// contract is only "one round trip-ish, same transaction").
const CHUNK_INSERT_PREFIX =
  "INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content," +
  " chunk_hash, heading_path, heading_path_text, anchor, labels, embedding_status)" +
  " VALUES ";
const CHUNK_PARAMS = 10;
/**
 * Dense character count — whitespace removed, exactly as the serving
 * predicate's `length(regexp_replace(c.content, '\s', '', 'g'))` computes it.
 * Written here rather than approximated so the ingest report and the SQL admit
 * the same chunks.
 */
function denseLength(content: string): number {
  return content.replace(/\s/g, "").length;
}

function jsonOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

/** 500 rows × 10 params stays far under Postgres's 65535 bind-parameter cap. */
const CHUNK_ROWS_PER_STATEMENT = 500;

export interface BuildStats {
  readonly nodes: number;
  readonly sources: number;
  readonly chunks: number;
  readonly carried: number;
  readonly pending: number;
  /**
   * How much of what we just stored NO SEARCH WILL EVER RETURN.
   *
   * The serving predicate admits a chunk only when it is `prose` and has at
   * least MIN_CONTENT_CHARS of dense text (`lib/search.ts`'s SERVABLE), and
   * `classify()` decides `prose` vs `nav` by SHAPE since decision 22 — link
   * lines dominating, or too little text left to answer anything.
   *
   * Counted and reported because it was previously silent: under the older
   * length-only rule a real handbook measured 10 of 16 chunks unsearchable and
   * one whole document findable by `read` and `outline` but never by `search`,
   * with the ingest line reporting a cheerful "16 chunks; embedded 16" (issue
   * #55). The rule is fixed and the report stays: an adopter should not have to
   * run SQL to learn which pages can only be reached by name.
   */
  readonly unsearchable: number;
  /** Sources with NO searchable chunk at all — findable by slug, never by search. */
  readonly unsearchableSources: readonly string[];
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
        " title, summary, keywords, position, permalink," +
        " corpus_id, audience, doc_status, owner, superseded_by," +
        " sources, verified, generated, approval, deprecated, effective_from, stale_after, trust_tier)" +
        " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11," +
        " $12, $13::text[], $14, $15, $16, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb," +
        " $22::timestamptz, $23::timestamptz, $24) RETURNING node_id",
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
        // Governance the document declared about itself (schema 2.5, the
        // profile). Carried onto the record so the serving door can enforce
        // what previously only the site's build-time staging could.
        manifest.corpus_id,
        n.governance.audience === null ? null : [...n.governance.audience],
        n.governance.docStatus,
        n.governance.owner,
        n.governance.supersededBy,
        jsonOrNull(n.governance.sources),
        jsonOrNull(n.governance.verified),
        jsonOrNull(n.governance.generated),
        jsonOrNull(n.governance.approval),
        jsonOrNull(n.governance.deprecated),
        n.governance.effectiveFrom,
        n.governance.staleAfter,
        n.governance.trustTier,
      ],
    );
    nodeIds.set(n.stable_id, String(res.rows[0].node_id));
  }

  const titles = new Map(manifest.nodes.map((n) => [n.stable_id, n.title]));
  const treeRoot = resolve(opts.treeRoot);
  let nSources = 0;
  let nChunks = 0;
  let nUnsearchable = 0;
  const unsearchableSources: string[] = [];
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
    // ONE frontmatter reader (decision 26): the same fence walk the checker used.
    const split = splitFrontmatter(raw, f.path);
    const rawBody = split.ok ? split.body : raw;
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
        " content_hash, embedding_model, chunk_policy, source_commit, frontmatter)" +
        " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
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
        // The author's own bytes, from the SAME split the body came from —
        // never re-read and never re-serialised (`read` serves this verbatim).
        split.ok && split.frontmatter !== null ? split.block : null,
      ],
    );
    nSources += 1;
    let sourceServable = 0;
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
      // Exactly the serving predicate's admission test, computed here so the
      // report cannot drift from what search will actually do.
      if (chunk.sourceType === "prose" && denseLength(chunk.content) >= MIN_CONTENT_CHARS) {
        sourceServable += 1;
      } else {
        nUnsearchable += 1;
      }
    }
    if (sourceServable === 0 && nChunks > 0) unsearchableSources.push(sid);
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
  //   3. From every other generation holding vectors, best-vetted first, then
  //      newest — including runs a kill left in `building`. Each pass fills only
  //      what the last left pending, so priority is expressed by ORDER; an
  //      abandoned run can never outrank the active one, and its vectors are no
  //      less correct for the run having died (issue #97).
  for (const source of await carrySources(client, {
    tenantId,
    corpusId: opts.corpusId,
    excludeGeneration: generation,
  })) {
    if (source === active) continue;
    carried += await carryForward(client, {
      tenantId,
      generation,
      fromGeneration: source,
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
    unsearchable: nUnsearchable,
    unsearchableSources,
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
  /** The record root — the directory holding `instance.md`, `knowledge/`, `.ksor/` and `build.lock.json`. */
  readonly recordRoot: string;
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
  /** Governance REPORTS that are not refusals (`ksor-takedown-unmerged`); stderr in the CLI, silent by default. */
  readonly onReport?: (line: string) => void;
}

/**
 * The record refused: the checker, the lock gate or the ledger baseline said
 * no. Thrown BEFORE anything is written, so a red ingest leaves the database
 * as it found it; the CLI prints the refusals slug-first and exits 1.
 */

/**
 * The `(id, digest)` pairs a committed lock recorded, read NARROWLY.
 *
 * The baseline needs exactly two fields, so it asks for exactly two. Requiring
 * the WHOLE lock to validate would make the departed-authority escape depend on
 * parts of the lock that have nothing to do with it — and it did: the ingest
 * fixtures write a deliberately narrow lock whose `build_id` is not a sha256,
 * so `parseLock` refused it, the baseline came back empty, and the escape was
 * untestable through the only helper that can reach ingest.
 *
 * Nothing is skipped by being tolerant here. A lock this cannot read yields no
 * accepted entries, which is the strict rule; and a lock that is malformed in
 * any other way is refused by `checkLock` three lines below, before a
 * generation is allocated.
 */
function lockLedgerEntries(text: string): readonly LedgerBaselineEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const raw = (parsed as { ledger_entries?: unknown } | null)?.ledger_entries;
  if (!Array.isArray(raw)) return [];
  const out: LedgerBaselineEntry[] = [];
  for (const e of raw) {
    const id = (e as { id?: unknown })?.id;
    const digest = (e as { digest?: unknown })?.digest;
    if (typeof id === "string" && id !== "" && typeof digest === "string" && digest !== "") {
      out.push({ id, digest });
    }
  }
  return out;
}

export class RecordRefused extends Error {
  override readonly name: string = "RecordRefused";
  readonly refusals: readonly (Refusal | IngestRefusal)[];
  constructor(refusals: readonly (Refusal | IngestRefusal)[]) {
    super(formatRefusals(refusals));
    this.refusals = refusals;
  }
}

/** What ingest stores on the run row about the policy: the registry and the authority sets, as a row. */
export function policyRow(policy: Policy): Record<string, unknown> {
  return {
    audiences: policy.audiences,
    approval_authorities: policy.approvalRules,
    takedown_authorities: { actors: policy.takedownActors },
    ownership: policy.ownership,
  };
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
  /** Chunks stored but excluded from every retrieval arm — see BuildStats. */
  readonly unsearchable: number;
  /** Sources with NO searchable chunk: readable by slug, never found by search. */
  readonly unsearchableSources: readonly string[];
  /**
   * Why the generation is NOT serving: the not-ready line or the flip-guard
   * refusal. null when it flipped, or when the flip was deliberately withheld
   * (flip: false) on a ready build.
   */
  readonly refusal: string | null;
  readonly health: GenerationHealth;
  /**
   * The corpus was byte-identical to the generation already serving, so NO
   * generation was consumed and nothing was embedded. `generation` then names
   * the generation still active, not a new one.
   */
  readonly unchanged: boolean;
}

/**
 * The whole write plane, sequenced: plain-tree manifest → ONE structure
 * transaction (allocate + nodes + sources + chunks + carry-forward) → drain
 * the embed queue (commit per batch, NO transaction held across batches) →
 * finalize (+ optional flip, same transaction). Returns the report; the CLI
 * turns `refusal` into stderr + exit 1.
 */
async function activeGenerationOf(
  c: pg.PoolClient,
  tenantId: string,
  corpusId: string,
): Promise<number | null> {
  const r = await c.query(
    "SELECT active_generation FROM corpora WHERE tenant_id = $1 AND corpus_id = $2",
    [tenantId, corpusId],
  );
  const raw: unknown = r.rows[0]?.active_generation ?? null;
  return raw === null ? null : Number(raw);
}

/**
 * Do two generations hold the same corpus? Compared on the SET of
 * (stable_id, content_hash, title, position, governance, TOOLCHAIN) tuples —
 * identity, content, everything the document declares about itself, and the
 * chunk policy and embedding model the sources were built with — so a moved
 * document, an edited body, an added or removed file, a retitle, a reorder, a
 * governance change or a toolchain bump all count as different, while a
 * rebuild of identical bytes does not.
 *
 * The governance columns are in this key because they were the exact hole:
 * hashing the frontmatter-STRIPPED body meant a retitle, a reorder, or a
 * `status: draft` -> `approved` promotion changed no compared byte, so ingest
 * reported "unchanged", published nothing, and exited 0 (review 2026-08-20).
 * An audience change is a security control; deferring one silently until
 * some unrelated document's body happens to change is not a thing a system of
 * record may do.
 *
 * The toolchain tuple is in it because it was the NEXT hole: a `CHUNK_POLICY`
 * bump (decision 22 moved v5 -> v6) reported "unchanged" against a generation
 * chunked under the old policy, so the re-classification adopters were told to
 * get by re-running `ksor ingest` never happened (research/okf-native.md §4.1).
 */
async function sameCorpus(
  c: pg.PoolClient,
  tenantId: string,
  corpusId: string,
  a: number,
  b: number,
): Promise<boolean> {
  const r = await c.query(
    `WITH pair AS (
       SELECT s.generation, n.stable_id, s.content_hash, s.chunk_policy, s.embedding_model,
              n.title, n.position,
              n.audience, n.doc_status, n.owner, n.superseded_by,
              n.sources, n.verified, n.generated, n.approval, n.deprecated,
              n.effective_from, n.stale_after, n.trust_tier
         FROM sources s JOIN content_nodes n
           ON n.tenant_id = s.tenant_id AND n.generation = s.generation AND n.node_id = s.node_id
        WHERE s.tenant_id = $1 AND n.corpus_id = $4 AND s.generation IN ($2, $3)
     )
     SELECT (SELECT count(*) FROM pair WHERE generation = $2) =
            (SELECT count(*) FROM pair WHERE generation = $3)
        AND NOT EXISTS (
              SELECT 1 FROM pair x WHERE x.generation = $2
               AND NOT EXISTS (SELECT 1 FROM pair y WHERE y.generation = $3
                                AND y.stable_id = x.stable_id
                                AND y.content_hash = x.content_hash
                                AND y.chunk_policy = x.chunk_policy
                                AND y.embedding_model = x.embedding_model
                                AND y.title = x.title
                                AND y.position = x.position
                                -- NULL-safe: a governance key going from absent
                                -- to set (or back) must count as a change, and
                                -- plain = would evaluate NULL and match nothing.
                                AND y.audience IS NOT DISTINCT FROM x.audience
                                AND y.doc_status IS NOT DISTINCT FROM x.doc_status
                                AND y.owner IS NOT DISTINCT FROM x.owner
                                AND y.superseded_by IS NOT DISTINCT FROM x.superseded_by
                                AND y.sources IS NOT DISTINCT FROM x.sources
                                AND y.verified IS NOT DISTINCT FROM x.verified
                                AND y.generated IS NOT DISTINCT FROM x.generated
                                AND y.approval IS NOT DISTINCT FROM x.approval
                                AND y.deprecated IS NOT DISTINCT FROM x.deprecated
                                AND y.effective_from IS NOT DISTINCT FROM x.effective_from
                                AND y.stale_after IS NOT DISTINCT FROM x.stale_after
                                AND y.trust_tier IS NOT DISTINCT FROM x.trust_tier)
            ) AS same`,
    [tenantId, a, b, corpusId],
  );
  return r.rows[0]?.same === true;
}

/**
 * Was the active generation ingested against this same policy and ledger? The
 * door binds to the RUN's policy row and the boot gate compares the denylist
 * against the run's ledger ids, so a policy or ledger change earns a
 * generation even when no document byte moved.
 */
async function sameGovernance(
  c: pg.PoolClient,
  tenantId: string,
  corpusId: string,
  generation: number,
  policySha256: string,
  ledgerIds: readonly string[],
): Promise<boolean> {
  const r = await c.query(
    `SELECT policy_sha256, ledger_ids FROM ingestion_runs
      WHERE tenant_id = $1 AND corpus_id = $3 AND generation = $2
      ORDER BY run_id DESC LIMIT 1`,
    [tenantId, generation, corpusId],
  );
  const row = r.rows[0] as
    | { policy_sha256: string | null; ledger_ids: string[] | null }
    | undefined;
  if (row === undefined) return false;
  const stored = row.ledger_ids ?? [];
  return (
    row.policy_sha256 === policySha256 &&
    stored.length === ledgerIds.length &&
    stored.every((id, i) => id === ledgerIds[i])
  );
}

/** Was the active generation produced by this same source commit? */
async function sameCommit(
  c: pg.PoolClient,
  tenantId: string,
  corpusId: string,
  generation: number,
  sourceCommit: string | undefined,
): Promise<boolean> {
  const r = await c.query(
    `SELECT source_commit FROM ingestion_runs
      WHERE tenant_id = $1 AND corpus_id = $3 AND generation = $2
      ORDER BY run_id DESC LIMIT 1`,
    [tenantId, generation, corpusId],
  );
  if (r.rows.length === 0) return false;
  const stored: unknown = r.rows[0]?.source_commit ?? null;
  return String(stored ?? "") === String(sourceCommit ?? "");
}

/**
 * May this generation be ACTIVATED? Returns the refusal, or null.
 *
 * Extracted so there is exactly ONE answer to that question. It used to live
 * inside `buildGeneration`'s flip branch, which made it unreachable the moment
 * a caller flipped separately — and `ksor ingest --flip` does, deliberately: the
 * governance gate has to run against the new generation BEFORE it becomes the
 * active one. That change silently retired this guard on the CLI path, so a
 * record that lost 80% of its documents published without a word, while the
 * library test that covers the guard stayed green because it drives
 * `buildGeneration` directly (found live 2026-08-21, auditing 0.0.10).
 *
 * A pre-flip check that only one of two flip paths performs is not a guard.
 */
export async function flipRefusal(
  client: pg.PoolClient,
  options: {
    readonly tenantId: string;
    readonly corpusId: string;
    readonly newGeneration: number;
    readonly force: boolean;
    readonly log: (line: string) => void;
  },
): Promise<string | null> {
  const { log } = options;
  const delta = await flipDelta(client, {
    tenantId: options.tenantId,
    corpusId: options.corpusId,
    newGeneration: options.newGeneration,
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
  const allowed = options.force || process.env["KSOR_ALLOW_SHRINK"] === "1";
  if (!shrinkUnsafe(delta.priorSlugs.size, delta.newSlugs.size, maxShrink) || allowed) return null;
  const fraction = shrinkFraction(delta.priorSlugs.size, delta.newSlugs.size);
  return (
    `REFUSING FLIP: corpus shrank ${pct(fraction)} vs gen ${delta.priorGeneration} ` +
    `(> KSOR_MAX_SHRINK=${pct(maxShrink)}); ${removed.length} node(s) vanished. ` +
    `Generation ${options.newGeneration} is READY but NOT served — the old generation keeps serving. ` +
    "If the drop is intended, re-run with KSOR_ALLOW_SHRINK=1; otherwise fix the corpus and re-ingest."
  );
}

/** Thrown inside the build transaction to roll it back when nothing changed. */
class UnchangedCorpus extends Error {
  readonly activeGeneration: number;
  constructor(activeGeneration: number) {
    super("corpus unchanged");
    this.name = "UnchangedCorpus";
    this.activeGeneration = activeGeneration;
  }
}

export async function buildGeneration(
  pool: pg.Pool,
  instance: ContentInstance,
  options: BuildGenerationOptions,
): Promise<BuildReport> {
  const log = options.onLog ?? ((): void => undefined);
  const provider = options.provider;
  const modelId = provider.modelId; // the persisted identity of this build's embedding space
  const tenant = instance.tenantId;

  // ---- the record, checked: ONE rule set (record spec §6), before any write
  const root = resolve(options.recordRoot);
  const record = loadRecord(root);
  const lockText = existsSync(join(root, LOCK_PATH))
    ? readFileSync(join(root, LOCK_PATH), "utf8")
    : null;
  // The lock is read BEFORE the check because it is one of the ledger's two
  // baselines, and this call used to pass none. Every other caller passed the
  // lock as accepted; ingest did not, so a takedown authority who left the
  // company still refused HERE while `ksor build` and the site published — the
  // site up, the door down, on one record. Decision 19's forbidden state,
  // reached through the seam rather than through either surface's own rule.
  //
  // The lock ONLY, deliberately: `ksor build` already judges the ledger against
  // git history and gates the deploy, and a shallow clone — the ordinary shape
  // of a deploy checkout — cannot read history at all. Adding it here would put
  // `ksor-ledger-unverifiable` in front of every containerised ingest, with no
  // flag to answer it.
  const lockBaseline: readonly LedgerBaseline[] =
    lockText === null
      ? []
      : [{ source: LOCK_PATH, entries: lockLedgerEntries(lockText), accepted: true }];
  const check = checkRecord(record, { mode: "build", ledgerBaselines: lockBaseline });
  if (check.refusals.length > 0 || check.policy === null) throw new RecordRefused(check.refusals);
  const policy = check.policy;
  const lock = checkLock(lockText, record);
  if (!lock.ok) throw new RecordRefused([lock.refusal]);
  const policyText = record.files.get(".ksor/governance.yaml") ?? "";
  const policySha256 = createHash("sha256").update(policyText, "utf8").digest("hex");
  const ledgerResult = parseLedger(
    record.files.get(".ksor/takedowns.yaml") ?? null,
    ".ksor/takedowns.yaml",
  );
  if (!ledgerResult.ok) throw new RecordRefused(ledgerResult.refusals);
  const ledger: Ledger = ledgerResult.ledger;

  const { manifest, sources } = buildManifestFromRecord(check, record.dirs, {
    corpusId: instance.corpusId,
    sourceCommit: options.sourceCommit,
  });
  const manifestSha256 =
    "sha256:" +
    createHash("sha256")
      .update(JSON.stringify(manifestToJson(manifest)), "utf8")
      .digest("hex");
  const knowledgeDir = join(root, "knowledge");
  const files = new Map([...sources].map(([path, rel]) => [path, join(root, rel)]));

  // ---- the ledger: its own transaction, BEFORE the build.
  //
  // TWO reasons, and the second is why it stays here after being questioned in
  // review (2026-08-25, finding 38).
  //
  // 1. An unchanged corpus rolls the STRUCTURE transaction back (UnchangedCorpus
  //    below), so a ledger folded inside it would be rolled back with it — and
  //    "the documents did not change" must never mean "the takedown did not
  //    land".
  // 2. The asymmetry is the safe one. Committing first means that if the build
  //    then fails, a DENIAL is already in force while the old generation goes on
  //    serving — denied more than published, which is the direction a system of
  //    record errs in (critical rule 1). Applying the ledger AFTER a successful
  //    build inverts exactly that: a failed build would leave a committed,
  //    reviewed, merged legal takedown unapplied and the document still served.
  //
  // The residual, named so it is not rediscovered as new: a REVOCATION commits
  // the same way, so a failed build leaves the document served again out of the
  // OLD generation. That is what `.ksor/takedowns.yaml` says should happen — the
  // file is the state and it is already merged — but if the revoker also EDITED
  // the document in the same change, the old text is what is served until a
  // build succeeds. The window is bounded by a loud failure rather than a quiet
  // one, and the alternative trades it for the unapplied-denial case above,
  // which is not a trade this product may make.
  const applied = await runIngest(pool, tenant, async (c) => {
    const last = await c.query(
      `SELECT generation, ledger_ids FROM ingestion_runs
        WHERE tenant_id = $1 AND corpus_id = $2 AND ledger_ids IS NOT NULL
        ORDER BY run_id DESC LIMIT 1`,
      [tenant, instance.corpusId],
    );
    const baseline = last.rows[0] as { generation: unknown; ledger_ids: string[] } | undefined;
    if (baseline !== undefined) {
      // A run records ids, not digests, so this baseline proves presence only —
      // `digest: null` is exactly that case. Retargeting-in-place is caught by
      // the baselines `ksor build` reads from git history and the lock.
      const shrank = checkLedgerAppendOnly(ledger, [
        {
          source: `the last ingest (generation ${Number(baseline.generation)})`,
          entries: baseline.ledger_ids.map((id) => ({ id, digest: null })),
        },
      ]);
      if (shrank.length > 0) throw new RecordRefused(shrank);
    }
    return applyLedger(c, instance, ledger);
  });
  if (applied.changed > 0)
    log(`ledger: ${applied.changed} denial row(s) applied from .ksor/takedowns.yaml`);
  for (const line of unmergedLines(applied.unmerged)) (options.onReport ?? log)(line);
  // A denial the repository does not account for is a state `ksor serve` will
  // not boot on, so this generation could never be served. Refusing HERE —
  // before allocateRun, before a single embedding — is the same outcome the
  // governance gate reaches at the end of this command, arrived at while the
  // operator can still act on it and without leaving a generation behind
  // (review 2026-08-25: the migration creates this state, and nothing between
  // the migration and the crash-looping container said so).
  if (applied.unledgered.length > 0)
    throw new RecordRefused([unledgeredRefusal(applied.unledgered)]);

  // ---- allocate + structure + carry: ONE transaction (atomic per generation)
  let structure;
  try {
    structure = await runIngest(pool, tenant, async (c) => {
      const alloc = await allocateRun(c, {
        tenantId: tenant,
        corpusId: instance.corpusId,
        sourceCommit: options.sourceCommit,
        manifestSha256,
        buildId: lock.lock.buildId,
        policy: policyRow(policy),
        policySha256,
        ledgerIds: ledger.ids,
      });
      const stats = await buildStructure(c, {
        tenantId: tenant,
        corpusId: instance.corpusId,
        generation: alloc.generation,
        manifest,
        files,
        treeRoot: knowledgeDir,
        modelId,
      });
      // Nothing to do? Compare what we JUST wrote against what is already
      // serving, using the content hashes buildStructure computed — never a
      // second digest of our own, which could disagree with the real one and
      // skip a genuine edit. Identical means this generation is a duplicate, so
      // roll the whole transaction back: no rows persist, no flip, no embedding
      // spend. `pnpm serve` therefore costs nothing when the record has not
      // changed (2026-08-20).
      // Skip only when the SOURCE COMMIT matches too. A new commit over
      // identical bytes is still a new build fact — "every build records the
      // exact corpus that produced it" — so it earns a generation; a plain
      // restart, which names no commit, does not.
      // Every one of the three is scoped to the CORPUS as well as the tenant.
      // A generation number is allocated per (tenant, corpus), so two records
      // under one tenant both hold a generation 5, and `ORDER BY run_id DESC
      // LIMIT 1` over tenant+generation alone would answer these questions from
      // whichever of them was ingested last. Latent today — `instance.md`'s
      // `name:` is tenant_id and corpus_id both, so the CLI cannot reach the
      // state — but the schema is multi-corpus by design and a skip decided
      // from another record's run is the one wrong answer here that publishes
      // nothing at all (review 2026-08-25).
      const active = await activeGenerationOf(c, tenant, instance.corpusId);
      if (
        active !== null &&
        (await sameCommit(c, tenant, instance.corpusId, active, options.sourceCommit)) &&
        (await sameGovernance(c, tenant, instance.corpusId, active, policySha256, ledger.ids)) &&
        (await sameCorpus(c, tenant, instance.corpusId, active, alloc.generation))
      ) {
        throw new UnchangedCorpus(active);
      }
      return { ...alloc, stats };
    });
  } catch (error) {
    if (error instanceof UnchangedCorpus) {
      log(`unchanged: generation ${error.activeGeneration} already serves this corpus`);
      return {
        runId: 0,
        generation: error.activeGeneration,
        nodes: 0,
        sources: 0,
        chunks: 0,
        carried: 0,
        embedded: 0,
        failed: 0,
        ready: true,
        centroids: 0,
        flipped: false,
        unsearchable: 0,
        unsearchableSources: [],
        refusal: null,
        health: { ok: true, reasons: [] } as unknown as GenerationHealth,
        unchanged: true,
      };
    }
    throw error;
  }
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
    const refusal = await flipRefusal(c, {
      tenantId: tenant,
      corpusId: instance.corpusId,
      newGeneration: generation,
      force: options.force === true,
      log,
    });
    if (refusal !== null) return { ready, centroids, health, flipped: false, refusal };
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
    unsearchable: stats.unsearchable,
    unsearchableSources: stats.unsearchableSources,
    refusal: fin.refusal,
    health: fin.health,
    unchanged: false,
  };
}

/** Python f"{x:.0%}" analogue. */
function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(0)}%`;
}
