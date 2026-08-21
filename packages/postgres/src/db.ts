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
 * A connection could not be ESTABLISHED in time — retryable.
 *
 * This is the other half of what `connectionTimeoutMillis` bounds, and
 * conflating it with saturation is a production outage waiting for an idle
 * period. A serverless endpoint suspends its compute after minutes of
 * inactivity (Neon: 5 by default); ksor holds no idle connections, so the
 * FIRST request after a quiet spell must open a fresh one, which wakes the
 * compute. If that wake outruns the bound, pg raises the same timeout text a
 * saturated pool raises — and treating it as saturation means the one request
 * most likely to hit a cold start is the one request that is never retried.
 * Measured against a black-holed endpoint before this split: failed at 10007ms
 * after exactly one attempt, with five retries and a 30s budget unused.
 */
export class ConnectTimeoutError extends Error {
  constructor(ms: number) {
    super(
      `could not establish a database connection within ${ms}ms — the endpoint may be ` +
        "waking from suspend; this is retried",
    );
    this.name = "ConnectTimeoutError";
  }
}

/**
 * The pool checkout timed out — never retried: under saturation a retry is
 * a thundering herd aimed at the component already drowning.
 */
export class PoolTimeoutError extends Error {
  constructor(detail = "the configured checkout bound") {
    super(
      `pool checkout timed out (${detail}) — the pool is saturated; ` +
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
  // A wake-from-suspend is the archetypal operational failure: transient, and
  // healed by trying again a moment later.
  if (error instanceof ConnectTimeoutError) return true;
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
  if (error === null || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code !== undefined && NEVER_RETRY_SQLSTATE.has(code);
}

/** sslmode values pg 8 treats as FULL verification and pg 9 will not. */
const WEAK_SSLMODES = ["require", "prefer", "verify-ca"];

/**
 * Is this DSN pointed at the local machine?
 *
 * `URL.hostname` keeps the BRACKETS on an IPv6 literal, so a bare `"::1"`
 * comparison never matched and `postgresql://u@[::1]/db` was treated as remote
 * (found while pinning the TLS posture, audit finding 28).
 */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  return host === "" || host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Warn once when a remote DSN's TLS posture is inherited rather than chosen.
 *
 * With pg 8, `sslmode=require|prefer|verify-ca` all resolve to full
 * verification — so ksor gets verified TLS today by accident of a default, not
 * by decision, and nothing in the repo states or tests the posture. The driver
 * itself warns that those modes adopt libpq semantics (NO certificate
 * verification) in pg 9, which would silently downgrade every adopter on a
 * dependency bump. `pg` is pinned `^8.23.0` so semver blocks that today; this
 * makes the posture legible now and names the one-word fix.
 */
export function tlsAdvisory(dsn: string): string | null {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  if (isLoopbackHost(url.hostname)) return null;
  const mode = (url.searchParams.get("sslmode") ?? "").toLowerCase();
  if (!WEAK_SSLMODES.includes(mode)) return null;
  return (
    `db TLS: sslmode=${mode} is verified TODAY (pg 8 treats it as verify-full) but becomes ` +
    "UNVERIFIED under libpq semantics in pg 9 — write sslmode=verify-full in the DSN to say so " +
    "explicitly and keep the guarantee across a driver upgrade."
  );
}

/**
 * Close every connection when its call finishes, instead of returning it to
 * the pool.
 *
 * OFF by default, because the default is measured better. On the shipped shape
 * (`min: 0`, 10s idle) a quiet server already holds ZERO connections — nothing
 * for a serverless compute to suspend, nothing billed on a per-connection plan
 * — and inside a burst the handshake is paid once. Measured against a live
 * database: reconnect 7.92ms, warm query 0.31ms, so per-request teardown pays
 * roughly 7.6ms on EVERY call rather than only after a genuine idle period, and
 * a remote TLS endpoint is worse because the handshake adds round trips that
 * number does not contain (decision 17).
 *
 * It exists because decision 17 names the deployment that would want it: one
 * where per-request connection is genuinely cheaper — a local pooler sidecar,
 * or a runtime that reuses no process between invocations, where a pool is a
 * fiction anyway. The owner of such a deployment should not have to patch the
 * kernel to get it.
 */
export function connectPerRequest(): boolean {
  return (process.env["KSOR_DB_CONNECT_PER_REQUEST"] ?? "") === "1";
}

/**
 * The TLS posture ksor CHOOSES, rather than inherits.
 *
 * pg 8 resolves `sslmode=require|prefer|verify-ca` to full verification, so the
 * guarantee today comes from a driver default — and the driver's own warning
 * says those modes adopt libpq semantics (NO certificate verification) in pg 9.
 * `pg` is pinned `^8.23.0`, so semver blocks that today; passing the option
 * explicitly means the bump cannot silently downgrade a deployment when it
 * comes (audit finding 28).
 *
 * Returns `undefined` where TLS is not in play, so nothing changes for a
 * loopback dev database or a DSN that disables TLS deliberately:
 *
 *   loopback host            no TLS — leave the driver alone
 *   sslmode=disable          the operator said no TLS, explicitly
 *   sslmode=no-verify        the operator OPTED OUT of verification, explicitly
 *   anything else, remote    verify, and say so
 *
 * Behaviour is unchanged on pg 8. The point is that it stays unchanged.
 */
export function tlsOptionsFor(dsn: string): { rejectUnauthorized: boolean } | undefined {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return undefined;
  }
  if (isLoopbackHost(url.hostname)) return undefined;
  const mode = (url.searchParams.get("sslmode") ?? "").toLowerCase();
  if (mode === "disable" || mode === "no-verify") return undefined;
  return { rejectUnauthorized: true };
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
  /** Native checkout+connect bound (ms). Default 10s — never 0 (unbounded). */
  readonly connectionTimeoutMs?: number;
  /** Recycle a connection after this many seconds so stale sockets behind a
   *  transaction pooler don't accumulate. Default 900s; 0 disables. */
  readonly maxLifetimeSeconds?: number;
  /**
   * How long an idle connection is kept before it is closed. STATED, never
   * inherited: pg-pool defaults this to 10s but only reaps while the pool is
   * ABOVE `minSize`, so the two settings together decide whether a quiet
   * server holds open connections at all. Default 10s; 0 disables reaping.
   */
  readonly idleTimeoutMs?: number;
}

/**
 * A named domain pool. TCP keepalive is on so a black-holed connection is
 * detected instead of hanging (node-postgres exposes only the initial-delay
 * knob, not idle/interval/count — the oracle's 30/10/3 tuning is not
 * reachable from JS; the 30s initial delay is the closest expressible
 * setting, recorded as a divergence).
 */
export function createPool(dsn: string, options: DomainPoolOptions): pg.Pool {
  // The SAFE default is bounded, not unbounded (review, 2026-08-19: a live
  // black-holed endpoint hung runRead forever with connectionTimeoutMillis:0
  // — the safe behaviour must be the default, not something each call site
  // remembers to pass). pg's connectionTimeoutMillis bounds BOTH the connect
  // handshake AND the wait for a checkout from a full pool (pg-pool only
  // arms the pending-queue timer when this is non-zero), and it removes the
  // waiter from the queue instead of the hand-rolled "let the late winner
  // complete and bounce" — so we use the native mechanism, not a Promise.race.
  const tls = tlsOptionsFor(dsn);
  const pool = new pg.Pool({
    connectionString: dsn,
    // Stated, not inherited — see tlsOptionsFor. Omitted entirely when TLS is
    // not in play, so a loopback dev database is untouched.
    ...(tls === undefined ? {} : { ssl: tls }),
    max: options.maxSize,
    min: Math.min(options.minSize, options.maxSize),
    keepAlive: true,
    keepAliveInitialDelayMillis: 30_000,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 10_000,
    maxLifetimeSeconds: options.maxLifetimeSeconds ?? 900,
    // Stated explicitly. pg-pool reaps an idle connection only when the pool
    // is ABOVE `min` (index.js:409), so `min` and this value together decide
    // whether an idle server keeps sockets open. With min 0 — the default — a
    // quiet server drops to ZERO open connections after this long.
    idleTimeoutMillis: options.idleTimeoutMs ?? 10_000,
  });
  // pg REQUIRES an error listener on the Pool. An IDLE client that the server
  // terminates — a restart, a failover, `pg_terminate_backend`, a
  // `DROP DATABASE ... WITH (FORCE)` — emits 'error' on the pool with no
  // request to attach it to, and with no listener Node turns that into an
  // UNCAUGHT EXCEPTION that kills the process. A long-running `ksor serve`
  // would therefore die on a routine database failover rather than reconnect.
  // pg discards the broken client itself; our job is to not crash, and to say
  // what happened without leaking the DSN (found via a CI flake whose real
  // subject was this, 2026-08-20).
  pool.on("error", (error: Error & { code?: string }) => {
    const code = error.code === undefined ? "" : ` ${error.code}`;
    console.error(`db pool: idle client error (${error.name}${code}) — connection discarded`);
  });

  // How many clients are CHECKED OUT and actually connected.
  //
  // pg-pool's `totalCount` cannot answer that: `newClient` pushes the client
  // into `_clients` BEFORE the connect resolves (pg-pool 3.14 index.js:242,
  // `totalCount` is `_clients.length`), so a pool whose every slot is still
  // completing a TCP+TLS+auth handshake reports itself full. Using it to
  // detect saturation therefore called a COLD BURST against a waking compute
  // "saturated" and shed those requests permanently — the precise opposite of
  // what the classification exists to do (round-4 review of #43).
  //
  // `acquire` fires only after a client is connected and handed to a caller,
  // and `release` fires when it comes back, so the difference is the number of
  // live, working connections. Public events only — no private fields.
  const counted = pool as pg.Pool & { ksorBusy?: number };
  counted.ksorBusy = 0;
  pool.on("acquire", () => {
    counted.ksorBusy = (counted.ksorBusy ?? 0) + 1;
  });
  pool.on("release", () => {
    counted.ksorBusy = Math.max(0, (counted.ksorBusy ?? 0) - 1);
  });
  return pool;
}

/**
 * Connections that are established RIGHT NOW: idle ones plus checked-out ones.
 * Distinct from `totalCount`, which also counts sockets still handshaking.
 */
export function connectedCount(pool: pg.Pool): number {
  const busy = (pool as pg.Pool & { ksorBusy?: number }).ksorBusy ?? 0;
  return pool.idleCount + busy;
}

/**
 * Open `count` connections now, rather than on the first requests.
 *
 * `min` does NOT do this in pg-pool: it only suppresses idle reaping
 * (verified — a pool built with min 5 sits at totalCount 0 until something
 * queries it). The predecessor's psycopg pool DID prewarm, and its recorded
 * reason was that a cold or scaled-out instance otherwise "opened up to 19
 * connections ON DEMAND, each a fresh TCP+TLS+auth" on a user's request. ksor
 * inherited the NUMBER without the MECHANISM, so it got neither the prewarm
 * nor an idle floor it chose — decision 6's warning, exactly.
 *
 * Opt-in and off by default: a KSoR that holds no idle connections is the
 * shape most adopters want against a managed endpoint. Failures are warnings,
 * never fatal — an unreachable database at boot is already tolerated, and a
 * prewarm that could refuse to start the server would be worse than a cold
 * first request.
 */
export async function prewarmPool(pool: pg.Pool, count: number): Promise<number> {
  if (count <= 0) return 0;
  // Never ask for more than the pool can hand out at once. `createPool` clamps
  // min to max, but the caller's number is unclamped — and requesting max+1
  // checkouts before releasing ANY of them deadlocks until the connect timeout
  // expires, turning a misconfigured KSOR_CONTENT_POOL_MIN into a stalled boot
  // (review of PR #43).
  const max = (pool as { options?: { max?: number } }).options?.max ?? count;
  count = Math.min(count, max);
  const clients = await Promise.allSettled(Array.from({ length: count }, () => pool.connect()));
  let opened = 0;
  for (const result of clients) {
    if (result.status === "fulfilled") {
      opened += 1;
      result.value.release();
    }
  }
  if (opened < count) {
    console.error(
      `db pool: prewarm opened ${opened}/${count} connections — serving anyway, ` +
        "the rest open on demand",
    );
  }
  return opened;
}

/** pg's checkout/connect timeout messages; mapped to our shedding error.
 * pg 8 uses both phrasings — the pending-queue timeout and the connect
 * timeout — so match both (found live in the saturation test, 2026-08-19). */
function isPgTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    /timeout exceeded when trying to connect|connection terminated due to connection timeout/i.test(
      error.message,
    )
  );
}

async function acquire(pool: pg.Pool): Promise<pg.PoolClient> {
  try {
    return await pool.connect();
  } catch (error) {
    // `connectionTimeoutMillis` bounds TWO different failures and pg reports
    // them with the same text. Which one it was is decided by the pool's own
    // state at the moment it gave up:
    //
    //   every slot taken  -> we WAITED for a busy pool. Saturation: shed, and
    //                        never retry, or the retry is a thundering herd
    //                        aimed at the component already drowning.
    //   slots to spare    -> the pool had room and the CONNECT itself failed.
    //                        A cold start, a wake-from-suspend, a slow TLS
    //                        handshake — all retryable, and all of them the
    //                        normal first request against a serverless endpoint.
    if (isPgTimeout(error)) {
      const max = (pool as { options?: { max?: number } }).options?.max ?? Infinity;
      // Saturation means the pool's connections are ESTABLISHED and all busy.
      // Counting sockets that are merely mid-handshake made a cold burst look
      // like load (round-4 review of #43).
      const saturated = connectedCount(pool) >= max && pool.idleCount === 0;
      if (saturated) throw new PoolTimeoutError();
      const ms =
        (pool as { options?: { connectionTimeoutMillis?: number } }).options
          ?.connectionTimeoutMillis ?? 0;
      throw new ConnectTimeoutError(ms);
    }
    throw error;
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
): Promise<T> {
  return withGuardedClient(pool, async (client) => {
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
    }
  });
}

/**
 * Check a client out with an 'error' listener attached for the WHOLE checkout,
 * and hand a broken one back for destruction rather than reuse.
 *
 * pg-pool 3.14 removes the client's own 'error' listener on checkout
 * (`_acquireClient`: `client.removeListener('error', idleListener)`) and only
 * re-attaches it in `_release`. Between those two points a pg Client has ZERO
 * error listeners, while `Client._handleErrorEvent` emits 'error'
 * unconditionally — so a connection dying mid-statement became an UNCAUGHT
 * EXCEPTION and took the whole process down with exit 1.
 *
 * The pool-level listener does not cover this: pg-pool forwards to the pool
 * only for IDLE clients, which is why the same deployment showed two endings —
 * an idle-time drop logged "idle client error … connection discarded" and
 * served on, while a drop during a query killed the server. On an endpoint that
 * suspends its compute, the second is the first request after an idle period
 * (review 2026-08-20; reproduced in checkout-error.db.test.ts, which fails with
 * "Connection terminated unexpectedly" escaping uncaught without this).
 *
 * The listener is deliberately NOT removed on the error path: pg can emit a
 * late 'error' after the query has already rejected, and a client being
 * destroyed has nothing left to say that anyone needs to hear.
 */
export async function withGuardedClient<T>(
  pool: pg.Pool,
  op: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await acquire(pool);
  let socketError: Error | undefined;
  const guard = (error: Error): void => {
    socketError = error;
  };
  client.on("error", guard);
  try {
    return await op(client);
  } finally {
    if (socketError === undefined) {
      client.removeListener("error", guard);
      // `release(true)` DESTROYS the connection instead of returning it to the
      // pool, so the next call opens a fresh one — literal connect-per-request.
      client.release(connectPerRequest());
    } else {
      // Release WITH the error so pg-pool destroys this connection instead of
      // returning a dead socket to the pool for the next borrower to trip over.
      client.release(socketError);
    }
  }
}

export interface RetryOptions {
  readonly retry?: boolean;
  readonly attempts?: number;
  readonly backoffS?: number;
  /** A hard per-request deadline (ms): retries stop once elapsed, so a
   *  connection dropping mid-statement can't stack N × the statement timeout
   *  (review, 2026-08-19). Omit for no cap. */
  readonly deadlineMs?: number;
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
  return withPgRetry(() => scopedTxn(pool, gucs, op), options);
}

/**
 * The retry POLICY on its own, for work that is not a scoped transaction.
 *
 * It was inlined in `runScopedIn`, so anything else that touches the database
 * — the boot schema gate, notably — either reimplemented it or, in practice,
 * ran once and treated a cold start as a permanent verdict. A serverless
 * compute takes a measured 4-10s to wake, so one attempt at boot is a coin
 * flip, and the gate that swallowed it stayed off for the process's whole life
 * (round-4 review of #43). One policy, one place.
 */
export async function withPgRetry<T>(op: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retry = options.retry ?? true;
  const attempts = retry ? (options.attempts ?? DB_RETRIES) : 1;
  const backoffS = options.backoffS ?? DB_BACKOFF_S;
  const deadline = options.deadlineMs === undefined ? null : Date.now() + options.deadlineMs;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await op();
    } catch (error) {
      lastError = error;
      const pastDeadline = deadline !== null && Date.now() >= deadline;
      if (
        neverRetry(error) ||
        !isOperationalError(error) ||
        attempt === attempts - 1 ||
        pastDeadline
      ) {
        throw error;
      }
      await sleep(backoffS * (attempt + 1));
    }
  }
  throw lastError;
}
