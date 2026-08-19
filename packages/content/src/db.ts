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
  envFloat,
  envInt,
  neverRetry,
  isOperationalError,
  PoolTimeoutError,
  runScopedIn,
  type Gucs,
} from "@panaversity/ksor-platform";

export const TENANT_GUC = "app.tenant_id";
export const RUNTIME_ROLE = "sor_content_runtime";
export const INGEST_ROLE = "sor_content_ingest";

export const READ_STATEMENT_TIMEOUT_MS = 15_000;
export const AUDIT_STATEMENT_TIMEOUT_MS = 5_000;
export const PROBE_STATEMENT_TIMEOUT_MS = 5_000;
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
  // 0 is a legal prewarm floor — a dial that silently floors at 1 lies to
  // the operator.
  const min = envInt("KSOR_CONTENT_POOL_MIN", 2, 0);
  return createPool(dsn, { maxSize: max, minSize: min });
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
      { ...gucsFor(tenantId, RUNTIME_ROLE, READ_STATEMENT_TIMEOUT_MS), ...extraGucs },
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
export async function runProbe<T>(pool: pg.Pool, tenantId: string, op: DbOp<T>): Promise<T> {
  return runScopedIn(pool, gucsFor(tenantId, RUNTIME_ROLE, PROBE_STATEMENT_TIMEOUT_MS), op, {
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
