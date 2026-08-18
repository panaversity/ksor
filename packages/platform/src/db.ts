/**
 * The platform database plumbing (oracle SP/db.py, converted under
 * decision 11): one borrowed connection, one explicit transaction, and ONE
 * `SELECT set_config(...)` statement binding `search_path='public'`
 * (unconditional — even a health probe) plus every GUC txn-locally.
 *
 * Session-scoped `SET` is forbidden: it leaks between clients under a
 * transaction pooler, and a leaked search_path once took a serving surface
 * dark while /health stayed green (oracle M-1, carried).
 */

import pg from "pg";

export const DB_RETRIES = 3;
export const DB_BACKOFF_S = 0.1;

/** GUC name → value, bound txn-locally in one round trip. */
export type Gucs = Readonly<Record<string, string>>;

/**
 * The pool checkout timed out — never retried: under saturation a retry is
 * a thundering herd aimed at the component already drowning.
 */
export class PoolTimeoutError extends Error {
  constructor(timeoutS: number) {
    super(
      `pool checkout exceeded ${timeoutS}s — the pool is saturated; ` +
        "shedding this request is the recovery path, retrying it is not",
    );
    this.name = "PoolTimeoutError";
  }
}

/** SQLSTATEs that must never be retried, checked BEFORE the retryable test. */
const NEVER_RETRY_SQLSTATE = new Set([
  "57014", // query_canceled (statement_timeout) — "slow, not dropped": surface it
  "53300", // too_many_connections — saturation sheds, never re-queues
]);

/**
 * Connection-level (operational) failures — the ONLY retryable class
 * (psycopg OperationalError parity). Neon serverless autosuspends: the
 * first read after a wake fails at the connection level while compute
 * boots (measured 4–10s in the oracle) — SQLSTATE 57P03 and raw socket
 * errors are exactly that shape.
 */
export function isOperationalError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  if (code !== undefined) {
    if (NEVER_RETRY_SQLSTATE.has(code)) return false;
    if (code.startsWith("08")) return true; // connection exception class
    if (code === "57P01" || code === "57P02" || code === "57P03") return true; // shutdown / crash / starting up
    if (
      code === "ECONNRESET" ||
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT" ||
      code === "EPIPE" ||
      code === "ENOTFOUND"
    ) {
      return true; // node syscall-level connection failures
    }
    return false;
  }
  // pg surfaces mid-query drops as plain Errors without a code.
  return /connection terminated|connection ended|client has encountered a connection error/i.test(
    error.message,
  );
}

export function neverRetry(error: unknown): boolean {
  if (error instanceof PoolTimeoutError) return true;
  const code = (error as { code?: string }).code;
  return code !== undefined && NEVER_RETRY_SQLSTATE.has(code);
}

/**
 * Whether a DSN points at a transaction-mode pooler. It CLASSIFIES, never
 * transforms. In the oracle the consequence was prepare_threshold=None;
 * node-postgres never auto-prepares statements, so the hazard cannot arise
 * here — the classifier is carried for the boot log (and any future driver
 * that does prepare). Order: env override, then sniff — Neon `-pooler`
 * host, `pgbouncer=true`, or port 6432. Log the REASON, never the DSN.
 */
export function pooledEndpointFor(dsn: string): boolean {
  const override = (process.env["KSOR_DB_POOLED_ENDPOINT"] ?? "").trim().toLowerCase();
  if (override === "1" || override === "true" || override === "yes") return true;
  if (override === "0" || override === "false" || override === "no") return false;
  let host = "";
  try {
    host = new URL(dsn).hostname;
  } catch {
    host = "";
  }
  if (/-pooler\b/.test(host)) return true;
  if (/pgbouncer=(true|1)\b/i.test(dsn)) return true;
  return /:6432\b|[?&]port=6432\b/.test(dsn);
}

export interface DomainPoolOptions {
  readonly maxSize: number;
  readonly minSize: number;
}

/**
 * A named domain pool. TCP keepalive is on so a black-holed connection is
 * detected instead of hanging (node-postgres exposes only the initial-delay
 * knob, not idle/interval/count — the oracle's 30/10/3 tuning is not
 * reachable from JS; the 30s initial delay is the closest expressible
 * setting, recorded as a divergence).
 */
export function createPool(dsn: string, options: DomainPoolOptions): pg.Pool {
  return new pg.Pool({
    connectionString: dsn,
    max: options.maxSize,
    min: Math.min(options.minSize, options.maxSize),
    keepAlive: true,
    keepAliveInitialDelayMillis: 30_000,
    // Checkout timeouts are enforced per-path by scopedTxn (the oracle's
    // per-runner checkout budgets), not globally here.
    connectionTimeoutMillis: 0,
  });
}

async function acquire(pool: pg.Pool, checkoutTimeoutS: number | null): Promise<pg.PoolClient> {
  if (checkoutTimeoutS === null) return pool.connect();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new PoolTimeoutError(checkoutTimeoutS)),
      checkoutTimeoutS * 1000,
    );
  });
  const checkout = pool.connect();
  try {
    return await Promise.race([checkout, timeout]);
  } catch (error) {
    // A late checkout must go back to the pool, not leak.
    void checkout.then((client) => client.release()).catch(() => undefined);
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * One connection, one transaction, one set_config statement for the whole
 * GUC scope (separate executes cost a full round trip each).
 */
export async function scopedTxn<T>(
  pool: pg.Pool,
  gucs: Gucs,
  op: (client: pg.PoolClient) => Promise<T>,
  checkoutTimeoutS: number | null = null,
): Promise<T> {
  const client = await acquire(pool, checkoutTimeoutS);
  try {
    await client.query("BEGIN");
    const entries = Object.entries({ search_path: "public", ...gucs });
    const calls = entries.map((_, i) => `set_config($${i * 2 + 1}, $${i * 2 + 2}, true)`);
    await client.query(`SELECT ${calls.join(", ")}`, entries.flat());
    const result = await op(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The rollback failing means the connection is gone; the original
      // error is the one that matters.
    }
    throw error;
  } finally {
    client.release();
  }
}

export interface RetryOptions {
  readonly retry?: boolean;
  readonly attempts?: number;
  readonly backoffS?: number;
  readonly checkoutTimeoutS?: number | null;
}

const sleep = (s: number): Promise<void> => new Promise((r) => setTimeout(r, s * 1000));

/**
 * Retries ONLY operational (connection-level) errors, linear backoff
 * `backoff * (attempt+1)`. QueryCanceled surfaces immediately ("slow, not
 * dropped"); PoolTimeout / TooManyConnections shed immediately.
 */
export async function runScopedIn<T>(
  pool: pg.Pool,
  gucs: Gucs,
  op: (client: pg.PoolClient) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retry = options.retry ?? true;
  const attempts = retry ? (options.attempts ?? DB_RETRIES) : 1;
  const backoffS = options.backoffS ?? DB_BACKOFF_S;
  const checkoutTimeoutS = options.checkoutTimeoutS ?? null;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await scopedTxn(pool, gucs, op, checkoutTimeoutS);
    } catch (error) {
      lastError = error;
      if (neverRetry(error) || !isOperationalError(error) || attempt === attempts - 1) throw error;
      await sleep(backoffS * (attempt + 1));
    }
  }
  throw lastError;
}
