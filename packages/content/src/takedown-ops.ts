/**
 * The takedown WRITE plane — the operator door decision 14 designed and never
 * shipped.
 *
 * The denial mechanism was complete and correct on the serving side, but the
 * only way to invoke it was a hand-written INSERT: the one governance action
 * most likely to arrive as a legal deadline was reachable only by someone with
 * a psql prompt and knowledge of the table shape, and it left no row proving
 * who performed it (review 2026-08-20). Governance governs ACTS — a mechanism
 * with no door constrains nothing.
 *
 * Scope is decision 14's, unchanged: `node` denies exactly the listed
 * stable_id; `subtree` denies it and every descendant, resolved at serving
 * time. A container is never guessed at — the caller says which.
 */

import type pg from "pg";

import { runAuditRead, runIngest, runRead } from "./db.js";
import type { ContentInstance } from "./instance.js";

/**
 * The §7 row for a governance act, written INSIDE the same transaction as the
 * act. `logRead` deliberately covers only the four serving actions; a takedown
 * is a write-plane act, and separating the two writes would allow a denial with
 * no row proving it happened — the one outcome the ledger exists to prevent.
 */
async function recordAct(
  client: pg.PoolClient,
  instance: ContentInstance,
  detail: Record<string, unknown>,
  actor: string,
  // Imposing and lifting must be distinguishable by the INDEXED column, not
  // only by reading the JSON detail of every row (round-1 review of PR #43).
  action: "takedown_applied" | "takedown_revoked" = "takedown_applied",
): Promise<void> {
  await client.query(
    "INSERT INTO retrieval_log (tenant_id, corpus_id, actor, action, detail)" +
      " VALUES ($1, $2, $3, $5, $4::jsonb)",
    [instance.tenantId, instance.corpusId, actor, JSON.stringify(detail), action],
  );
}

export type TakedownScope = "node" | "subtree";

export interface TakedownRow {
  readonly stableId: string;
  readonly scope: TakedownScope;
  readonly reason: string;
  readonly createdAt: Date;
}

export interface TakedownOutcome {
  readonly stableId: string;
  readonly scope: TakedownScope;
  /** false when the row already said exactly this — the act is idempotent. */
  readonly changed: boolean;
  /** Does this stable_id name a document in the generation being served? */
  readonly resolves?: boolean;
}

/**
 * Deny a node (or its subtree) and record the act.
 *
 * The audit row is written in the SAME transaction as the denial: a takedown
 * that happened without a row proving it happened is exactly the shape the
 * §7 ledger exists to prevent.
 */
export async function applyTakedown(
  pool: pg.Pool,
  instance: ContentInstance,
  opts: { stableId: string; scope: TakedownScope; reason: string; actor: string },
): Promise<TakedownOutcome> {
  return runIngest(pool, instance.tenantId, async (client) => {
    // Does this id name anything in the SERVING generation? A typo used to
    // print "denied — no surface serves it from now on" while the document
    // carried on serving (round-2 review of #43). The denial is still
    // RECORDED either way — decision 14's identity guarantee means a denial
    // may precede the document it names — but the caller is told.
    const known = await client.query(
      `SELECT 1 FROM content_nodes n
         JOIN corpora c ON c.tenant_id = n.tenant_id AND c.corpus_id = $2
        WHERE n.tenant_id = $1 AND n.stable_id = $3 AND n.generation = c.active_generation
        LIMIT 1`,
      [instance.tenantId, instance.corpusId, opts.stableId],
    );
    const resolves = (known.rowCount ?? 0) > 0;
    const result = await client.query(
      "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, scope, reason)" +
        " VALUES ($1, $2, $3, $4, $5)" +
        " ON CONFLICT (tenant_id, corpus_id, stable_id) DO UPDATE" +
        "   SET scope = EXCLUDED.scope, reason = EXCLUDED.reason" +
        " WHERE takedown_denylist.scope IS DISTINCT FROM EXCLUDED.scope" +
        "    OR takedown_denylist.reason IS DISTINCT FROM EXCLUDED.reason" +
        " RETURNING stable_id",
      [instance.tenantId, instance.corpusId, opts.stableId, opts.scope, opts.reason],
    );
    const changed = result.rowCount === 1;
    await recordAct(
      client,
      instance,
      {
        stable_id: opts.stableId,
        scope: opts.scope,
        reason: opts.reason,
        change: changed ? "applied" : "unchanged",
      },
      opts.actor,
    );
    return { stableId: opts.stableId, scope: opts.scope, changed, resolves };
  });
}

/** Lift a denial. The ledger keeps the row that recorded imposing it. */
export async function revokeTakedown(
  pool: pg.Pool,
  instance: ContentInstance,
  opts: { stableId: string; actor: string },
): Promise<TakedownOutcome> {
  return runIngest(pool, instance.tenantId, async (client) => {
    const result = await client.query(
      "DELETE FROM takedown_denylist WHERE tenant_id = $1 AND corpus_id = $2 AND stable_id = $3",
      [instance.tenantId, instance.corpusId, opts.stableId],
    );
    const changed = (result.rowCount ?? 0) > 0;
    await recordAct(
      client,
      instance,
      { stable_id: opts.stableId, change: changed ? "revoked" : "not-denied" },
      opts.actor,
      "takedown_revoked",
    );
    return { stableId: opts.stableId, scope: "node" as TakedownScope, changed };
  });
}

/** The ledger, readable at last — through the auditor role (schema 2.3). */
export interface LedgerRow {
  readonly action: string;
  readonly actor: string;
  readonly generation: number | null;
  readonly detail: Record<string, unknown>;
  readonly createdAt: Date;
}

export async function readLedger(
  pool: pg.Pool,
  instance: ContentInstance,
  limit: number,
): Promise<LedgerRow[]> {
  return runAuditRead(pool, instance.tenantId, async (client) => {
    const r = await client.query(
      // Scoped by CORPUS as well as tenant. Every governance write records
      // corpus_id and `listTakedowns` already scoped by it; this did not, so a
      // tenant serving two corpora — the shape AGENTS.md's open question 1 is
      // preparing for — got one record's audit answer polluted with the
      // other's, under the verb whose whole purpose is a per-record governance
      // trail (round-9 review of PR 43).
      "SELECT action, actor, generation, detail, created_at FROM retrieval_log" +
        " WHERE tenant_id = $1 AND corpus_id = $2 ORDER BY created_at DESC, id DESC LIMIT $3",
      [instance.tenantId, instance.corpusId, limit],
    );
    return r.rows.map((row: Record<string, unknown>) => ({
      action: String(row.action),
      actor: String(row.actor),
      generation: row.generation === null ? null : Number(row.generation),
      detail: (row.detail ?? {}) as Record<string, unknown>,
      createdAt: row.created_at as Date,
    }));
  });
}

/**
 * Every stable_id a build must not publish, with `subtree` denials EXPANDED to
 * their actual descendants by the same `parent_id` walk the serving side uses.
 *
 * The site cannot do this itself: it has no tree, so it matched a prefix — and
 * a section's stable_id ends in `/index` (or `#section`), so the prefix never
 * matched its children and every descendant of a subtree takedown kept
 * publishing. Decision 14 records exactly why a prefix is wrong here; the fix
 * is to resolve the walk where the tree lives and hand over a flat list
 * (round-2 review of #43).
 */
export async function deniedStableIds(pool: pg.Pool, instance: ContentInstance): Promise<string[]> {
  // The RUNTIME role, not ingest. `pnpm build` now runs this on every site
  // build host, and a host that needs to read a denial list must not hold
  // SELECT/INSERT/UPDATE/DELETE on the whole record — a build environment
  // could rewrite or drop the corpus (round-5 review of #43).
  return runRead(pool, instance.tenantId, async (client) => {
    const result = await client.query(
      `WITH RECURSIVE gen AS (
         SELECT active_generation AS g FROM corpora WHERE tenant_id = $1 AND corpus_id = $2
       ),
       seed AS (
         SELECT n.node_id, n.stable_id, d.scope
           FROM takedown_denylist d
           JOIN content_nodes n ON n.tenant_id = d.tenant_id AND n.stable_id = d.stable_id
           JOIN gen ON n.generation = gen.g
          WHERE d.tenant_id = $1 AND d.corpus_id = $2
       ),
       walk AS (
         SELECT node_id, stable_id, scope FROM seed
         UNION ALL
         SELECT c.node_id, c.stable_id, w.scope
           FROM content_nodes c
           JOIN walk w ON c.parent_id = w.node_id
           JOIN gen ON c.generation = gen.g
          WHERE c.tenant_id = $1 AND w.scope = 'subtree'
       )
       SELECT DISTINCT stable_id FROM walk
       UNION
       -- Denials naming a stable_id no CURRENT generation carries are still
       -- denied: identity outlives any one generation (decision 14).
       SELECT stable_id FROM takedown_denylist WHERE tenant_id = $1 AND corpus_id = $2`,
      [instance.tenantId, instance.corpusId],
    );
    return result.rows.map((r: { stable_id: string }) => String(r.stable_id)).sort();
  });
}

/**
 * The knowledge-relative DIRECTORIES that `--subtree` denials govern.
 *
 * Derived from the DESCENDANTS' `sources.origin_path`, never from the denied
 * node's own id or path, because neither works:
 *
 *   a section has no source     `knowledge/policies#section` is synthetic — the
 *                               tree node for a directory. Joining `sources` on
 *                               the denied node itself yields nothing, and a
 *                               section is the ordinary target of `--subtree`.
 *   a leaf's directory is not   `--subtree` on one document would emit that
 *   its subtree                 document's directory and deny every sibling.
 *
 * So: walk the descendants, take the directory of each one's file, and keep the
 * SHALLOWEST — a directory that contains another in the set is the subtree
 * root, and `startsWith` then covers subdirectories added later too. A denial
 * with no descendants contributes nothing, which is correct: its subtree is
 * itself, and the flat id list already holds it.
 */
export async function deniedSubtreeDirs(
  pool: pg.Pool,
  instance: ContentInstance,
): Promise<string[]> {
  const paths = await runRead(pool, instance.tenantId, async (client) => {
    const result = await client.query(
      `WITH RECURSIVE gen AS (
         SELECT active_generation AS g FROM corpora WHERE tenant_id = $1 AND corpus_id = $2
       ),
       seed AS (
         SELECT n.node_id
           FROM takedown_denylist d
           JOIN content_nodes n ON n.tenant_id = d.tenant_id AND n.stable_id = d.stable_id
           JOIN gen ON n.generation = gen.g
          WHERE d.tenant_id = $1 AND d.corpus_id = $2 AND d.scope = 'subtree'
       ),
       walk AS (
         SELECT node_id FROM seed
         UNION ALL
         SELECT c.node_id
           FROM content_nodes c
           JOIN walk w ON c.parent_id = w.node_id
           JOIN gen ON c.generation = gen.g
          WHERE c.tenant_id = $1
       )
       SELECT DISTINCT s.origin_path
         FROM walk w
         JOIN content_nodes n ON n.node_id = w.node_id
         JOIN sources s ON s.tenant_id = n.tenant_id AND s.generation = n.generation
                       AND s.node_id = n.node_id
         -- The SEED's own file is excluded: for a leaf denial its directory is
         -- the parent, which would deny every sibling.
        WHERE w.node_id NOT IN (SELECT node_id FROM seed)`,
      [instance.tenantId, instance.corpusId],
    );
    return (result.rows as { origin_path: string }[]).map((r) => String(r.origin_path));
  });

  const dirs = new Set<string>();
  for (const raw of paths) {
    const normalized = raw.replace(/\\/g, "/");
    const slash = normalized.lastIndexOf("/");
    // A file at the record root means the whole record is denied.
    dirs.add(slash === -1 ? "/" : `${normalized.slice(0, slash)}/`);
  }
  // Keep only the shallowest: a directory contained by another in the set is
  // already covered by it, and the outer one is the actual subtree root.
  const all = [...dirs];
  return all.filter((dir) => !all.some((other) => other !== dir && dir.startsWith(other))).sort();
}

export async function listTakedowns(
  pool: pg.Pool,
  instance: ContentInstance,
): Promise<TakedownRow[]> {
  return runRead(pool, instance.tenantId, async (client) => {
    const result = await client.query(
      "SELECT stable_id, scope, reason, created_at FROM takedown_denylist" +
        " WHERE tenant_id = $1 AND corpus_id = $2 ORDER BY created_at, stable_id",
      [instance.tenantId, instance.corpusId],
    );
    return result.rows.map((r: Record<string, unknown>) => ({
      stableId: String(r.stable_id),
      scope: String(r.scope) as TakedownScope,
      reason: String(r.reason),
      createdAt: r.created_at as Date,
    }));
  });
}

/**
 * The manifest the SITE build consumes.
 *
 * Takedown was a serving-plane mechanism only, so a denied document stayed
 * published on the human surface — `llms.txt` included, the file written
 * specifically for AI crawlers (review 2026-08-20, reproduced). The site
 * compiles `knowledge/` from disk and must stay database-free for `pnpm dev`
 * (decision 11), so the database's answer is EXPORTED to a file the build
 * reads rather than the build opening a connection.
 *
 * `source` is what makes it fail closed: a build that finds `"none"` knows the
 * project declares no database and there is nothing to deny, while a build
 * that finds no file at all knows it was never told and can refuse.
 */
export interface DenylistManifest {
  readonly format: 1;
  readonly corpus_id: string;
  readonly source: "database" | "none";
  readonly exported_at: string;
  readonly denied: readonly { stable_id: string; scope: TakedownScope }[];
  /**
   * Directories a `--subtree` takedown governs, as knowledge-relative paths
   * ending in "/".
   *
   * The expanded id list above can only name what the ACTIVE generation
   * contains, and decision 14 chose serving-time resolution precisely because
   * "a subtree deny must also cover descendants a FUTURE re-ingest adds". The
   * site builds from DISK, where those files already exist while the database
   * has never seen them: a document added under a withdrawn section published
   * to /docs and llms.txt with no warning anywhere (round-5 review of #43).
   *
   * A directory is the right handle for the site because the site's tree IS the
   * file tree — this is not the stable_id prefix matching decision 14 rejects,
   * which fails because a frontmatter `sor_id:` decouples an id from its path.
   * These paths come from `sources.origin_path`, so they are the real
   * locations on disk regardless of any id override.
   */
  readonly denied_subtrees: readonly string[];
}

export function denylistManifest(
  corpusId: string,
  stableIds: readonly string[],
  now: Date,
  source: DenylistManifest["source"] = "database",
  deniedSubtrees: readonly string[] = [],
): DenylistManifest {
  return {
    format: 1,
    corpus_id: corpusId,
    source,
    denied_subtrees: [...deniedSubtrees].sort(),
    exported_at: now.toISOString(),
    // Already EXPANDED: every id here is denied outright, so the consumer
    // matches exact strings and never has to interpret scope.
    denied: stableIds.map((stable_id) => ({ stable_id, scope: "node" as TakedownScope })),
  };
}
