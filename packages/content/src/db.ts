/**
 * The content pool spec (oracle SC/db.py): two access paths mirroring the
 * schema roles —
 *
 * - `runRead`    pins `SET LOCAL ROLE sor_content_runtime`, binds the tenant
 *   GUC, retries (idempotent reads).
 * - `runIngest`  pins `sor_content_ingest`, binds the tenant GUC, EXACTLY
 *   one attempt — reruns are the recovery path, not retries.
 *
 * Role pinning is in-transaction (`SET LOCAL ROLE` resets with the txn), so
 * any over-privileged DSN drops to least privilege before touching a table,
 * and FORCE RLS walls even owners. Role and statement_timeout ARE GUCs, so
 * the whole scope binds in the one set_config statement scopedTxn already
 * sends.
 */

import type pg from "pg";
import {
  createPool,
  neverRetry,
  isOperationalError,
  PoolTimeoutError,
  runScopedIn,
  type Gucs,
} from "@panaversity/ksor-postgres";
import { envFloat, envInt } from "./env.js";
import { WHOLE_RECORD_SCOPE } from "./lib/audience.js";

export const TENANT_GUC = "app.tenant_id";
export const RUNTIME_ROLE = "sor_content_runtime";
export const INGEST_ROLE = "sor_content_ingest";
export const AUDITOR_ROLE = "sor_content_auditor";

export const READ_STATEMENT_TIMEOUT_MS = 15_000;
export const AUDIT_STATEMENT_TIMEOUT_MS = 5_000;
export const PROBE_STATEMENT_TIMEOUT_MS = 5_000;
/** Total budget for a readiness answer, retries included. */
export const PROBE_DEADLINE_MS = 8_000;
/**
 * A hard per-request deadline on the read path: with the pool's native
 * checkout bound handling saturation, this caps the total time across
 * operational retries so a connection dropping mid-statement can't stack
 * attempts × the statement timeout (review, 2026-08-19).
 */
export const READ_DEADLINE_MS = 30_000;

/**
 * Neon serverless autosuspends; the first read after a wake fails at the
 * connection level while compute boots (measured 4–10s). Five attempts with
 * a 1s LINEAR step (1+2+3+4 = 10s of backoff) wait out the boot; saturation
 * is never retried — a genuine outage fails fast.
 */
const READ_RETRY_ATTEMPTS = (): number => envInt("KSOR_READ_RETRY_ATTEMPTS", 5, 1);
const READ_RETRY_BACKOFF_S = (): number => envFloat("KSOR_READ_RETRY_BACKOFF_S", 1.0, 0);

/**
 * Raw driver errors carry role/relation/host state that would reach the MCP
 * wire; a read failure is sanitized to the CLASS NAME only. Authored
 * tool-guidance errors flow through untouched.
 */
export class ContentStoreError extends Error {
  constructor(className: string) {
    super(`content store temporarily unavailable (${className})`);
    this.name = "ContentStoreError";
  }
}

function isDriverError(error: unknown): boolean {
  if (error instanceof PoolTimeoutError) return true;
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  return code !== undefined || isOperationalError(error) || neverRetry(error);
}

function sanitized(error: unknown): never {
  if (isDriverError(error)) {
    // pg's DatabaseError carries name="error" — the constructor name is
    // the diagnostic the oracle's class-name contract meant.
    throw new ContentStoreError(error instanceof Error ? error.constructor.name : "Error");
  }
  throw error;
}

export type DbOp<T> = (client: pg.PoolClient) => Promise<T>;

export function contentPool(dsn: string, maxSize?: number): pg.Pool {
  // Read at the domain altitude so every composition gets the knob (the
  // oracle's old platform default of 10 sat 8x below the admitted
  // concurrency of its host).
  const max = maxSize ?? envInt("KSOR_CONTENT_POOL_MAX", 20, 1);
  // ZERO idle connections by default. Two settings decide this together, so
  // both are stated here rather than inherited:
  //
  //   min = 0  -> pg-pool reaps idle connections (it only reaps while ABOVE
  //               min, so any non-zero min pins that many open FOREVER)
  //   idle 10s -> how long after last use one is closed
  //
  // A quiet `ksor serve` therefore holds NO open connection to the record's
  // database, and a busy one still reuses connections across requests — the
  // handshake is ~26x the cost of a pooled query even on localhost, and far
  // more over TLS to a managed endpoint.
  //
  // The predecessor defaulted min to 2 as a PREWARM (its psycopg pool opened
  // them eagerly, so a cold instance did not open a connection per request on
  // a user's first query). pg-pool does not prewarm, so ksor inherited the
  // number without the mechanism: no prewarm, and sockets held open anyway.
  // The dial now means what it says — set KSOR_CONTENT_POOL_MIN above 0 and
  // the composition root prewarms exactly that many (prewarmPool).
  const min = envInt("KSOR_CONTENT_POOL_MIN", 0, 0);
  const idleMs = envInt("KSOR_CONTENT_POOL_IDLE_MS", 10_000, 0);
  return createPool(dsn, { maxSize: max, minSize: min, idleTimeoutMs: idleMs });
}

/** The prewarm floor this deployment asked for — 0 (hold nothing) unless set. */
export function contentPoolMin(): number {
  return envInt("KSOR_CONTENT_POOL_MIN", 0, 0);
}

function gucsFor(tenantId: string, role: string, statementTimeoutMs: number | null): Gucs {
  const base: Record<string, string> = { [TENANT_GUC]: tenantId, role };
  if (statementTimeoutMs !== null) base["statement_timeout"] = String(statementTimeoutMs);
  return base;
}

/**
 * The read path. `extraGucs` exists so the search path folds the two HNSW
 * GUCs into the same one-statement bind (a plain filtered HNSW walk
 * silently under-returns without them).
 */
export async function runRead<T>(
  pool: pg.Pool,
  tenantId: string,
  op: DbOp<T>,
  extraGucs?: Gucs,
): Promise<T> {
  try {
    return await runScopedIn(
      pool,
      {
        ...gucsFor(tenantId, RUNTIME_ROLE, READ_STATEMENT_TIMEOUT_MS),
        // The audience scope is ALWAYS bound. The SQL predicate denies when it
        // is unset — deliberately, so a statement can never serve every tier
        // because nobody stated one — and this makes "the whole record" the
        // explicit default for a caller that does not narrow it, rather than
        // an accident of an unbound GUC. The serving door overrides it below
        // with the caller's actual tier (review of PR #43).
        ...WHOLE_RECORD_SCOPE,
        ...extraGucs,
      },
      op,
      {
        retry: true,
        attempts: READ_RETRY_ATTEMPTS(),
        backoffS: READ_RETRY_BACKOFF_S(),
        // A hard per-request deadline so a connection dropping mid-statement
        // cannot stack attempts × the 15s statement timeout (review,
        // 2026-08-19). The pool's native checkout bound handles saturation.
        deadlineMs: READ_DEADLINE_MS,
      },
    );
  } catch (error) {
    sanitized(error);
  }
}

/** The /ready and /health path: bounded budgets so a saturated pool reports fast. */
export class ProbeDeadlineError extends Error {
  constructor(ms: number) {
    super(`readiness probe did not answer within ${ms}ms`);
    this.name = "ProbeDeadlineError";
  }
}

/**
 * Bound ANY readiness work by the wall clock, not just a single probe.
 *
 * Readiness has ONE budget and everything it does shares it. Bounding only the
 * probe left a hole the moment readiness gained a second step: the deferred
 * schema check ran first as a bare query with no deadline of its own, and
 * /ready answered in 10.25s against an unreachable endpoint while claiming 8
 * (found live, 2026-08-21, driving the real server).
 *
 * The losing work is left to finish and release its own checkout; its rejection
 * is absorbed. The point is to stop WAITING, not to cancel work in flight.
 */
export async function withProbeDeadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProbeDeadlineError(PROBE_DEADLINE_MS)), PROBE_DEADLINE_MS);
    // Never hold the event loop open on a probe's behalf.
    timer.unref();
  });
  work.catch(() => undefined);
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function runProbe<T>(pool: pg.Pool, tenantId: string, op: DbOp<T>): Promise<T> {
  const work = runScopedIn(pool, gucsFor(tenantId, RUNTIME_ROLE, PROBE_STATEMENT_TIMEOUT_MS), op, {
    retry: true,
    // A readiness probe must ANSWER, not persist. Once a connect timeout became
    // retryable (right for a request, wrong for a probe), /ready took ~30s to
    // report 503 against an unreachable database — past the timeout of every
    // default readiness probe, so a container reads "no response" instead of
    // "not ready" (round-3 review of #43).
    deadlineMs: PROBE_DEADLINE_MS,
  });

  // …and a WALL-CLOCK bound on top, because `deadlineMs` alone cannot deliver
  // one: `runScopedIn` only consults it BETWEEN attempts, so the first attempt
  // is bounded by the pool's connectionTimeoutMillis (10s) — larger than this
  // budget. Against a black-holed endpoint the probe answered at ~10s, not 8s,
  // and the round-3 note that introduced the constant claimed the opposite
  // (round-4 review of #43, found independently by two reviewers).
  return withProbeDeadline(work);
}

/** The AUDITOR path: reads the §7 ledger under the read-only auditor role. */
export async function runAuditRead<T>(pool: pg.Pool, tenantId: string, op: DbOp<T>): Promise<T> {
  return runScopedIn(pool, gucsFor(tenantId, AUDITOR_ROLE, READ_STATEMENT_TIMEOUT_MS), op, {
    retry: true,
  });
}

/**
 * Exactly one attempt: retrying an observability write amplifies load
 * during the incident it should shed. Under saturation the audit sheds.
 */
export async function runAudit<T>(pool: pg.Pool, tenantId: string, op: DbOp<T>): Promise<T> {
  return runScopedIn(pool, gucsFor(tenantId, RUNTIME_ROLE, AUDIT_STATEMENT_TIMEOUT_MS), op, {
    retry: false,
  });
}

/** Ingest: no statement timeout, one attempt — reruns are the recovery path. */
export async function runIngest<T>(pool: pg.Pool, tenantId: string, op: DbOp<T>): Promise<T> {
  return runScopedIn(pool, gucsFor(tenantId, INGEST_ROLE, null), op, { retry: false });
}
