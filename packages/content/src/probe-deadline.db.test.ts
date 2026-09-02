/**
 * The readiness budget against a REAL socket and a REAL clock.
 *
 * `probe-deadline.test.ts` holds the wrapper's arithmetic on a fake clock.
 * This holds the claim the wrapper was written for — a probe against an
 * endpoint that accepts the connection and never speaks answers at the budget,
 * not at pg's 10s `connectionTimeoutMillis` — through `runProbe` and a pool,
 * with wall-clock time. That is the 8.07s measured live on 2026-08-21, made a
 * test.
 *
 * It sits in the db tier because of its SHAPE, not because it needs a
 * database: it opens a listening socket and waits eight real seconds, neither
 * of which the unit tier admits. No `KSOR_DB_URL` is read — the black hole is
 * a local TCP server that accepts and writes nothing, which is exactly what a
 * suspended serverless Postgres looks like from the client's side.
 */

import { createServer, type Server, type Socket } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PROBE_DEADLINE_MS, ProbeDeadlineError, contentPool, runProbe } from "./db.js";

describe("runProbe answers at the budget against a socket that never speaks", () => {
  let server: Server;
  let port = 0;
  const held: Socket[] = [];

  beforeAll(async () => {
    server = createServer((socket) => {
      // Accept, then say nothing: pg waits for the startup reply forever.
      held.push(socket);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    port = address.port;
  });

  afterAll(async () => {
    for (const socket of held) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("rejects with ProbeDeadlineError inside PROBE_DEADLINE_MS, not pg's connect timeout", async () => {
    const pool = contentPool(`postgres://probe@127.0.0.1:${port}/probe`, 1);
    const started = Date.now();
    const error: unknown = await runProbe(pool, "probe-tenant", async () => "unreachable").then(
      () => null,
      (caught: unknown) => caught,
    );
    // Measured BEFORE the pool is ended: `end()` waits for the losing connect,
    // which is bounded by pg's 10s timeout, and folding that in reported the
    // probe at 10.0s when it had answered at 8.0s (found writing this).
    const elapsed = Date.now() - started;
    await pool.end().catch(() => undefined);
    expect(error, `answered in ${elapsed}ms with ${String(error)}`).toBeInstanceOf(
      ProbeDeadlineError,
    );
    // The window is the budget, with room for a loaded machine above it and
    // none for something firing early below it.
    expect(elapsed, `answered in ${elapsed}ms`).toBeGreaterThanOrEqual(PROBE_DEADLINE_MS - 50);
    expect(elapsed, `answered in ${elapsed}ms`).toBeLessThan(PROBE_DEADLINE_MS + 2_000);
  }, 30_000);
});
