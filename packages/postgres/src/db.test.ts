import { describe, expect, it } from "vitest";

import {
  ConnectTimeoutError,
  PoolTimeoutError,
  isOperationalError,
  neverRetry,
  pooledEndpointFor,
  scopedTxn,
  pinnedTlsDsn,
  tlsPosture,
} from "./db.js";

describe("pooledEndpointFor — classify, never transform", () => {
  it("detects Neon pooler hosts, pgbouncer, and port 6432", () => {
    expect(pooledEndpointFor("postgres://u:p@ep-x-pooler.aws.neon.tech/db")).toBe(true);
    expect(pooledEndpointFor("postgres://u:p@host/db?pgbouncer=true")).toBe(true);
    expect(pooledEndpointFor("postgres://u:p@host:6432/db")).toBe(true);
    expect(pooledEndpointFor("postgres://u:p@ep-x.aws.neon.tech/db")).toBe(false);
    expect(pooledEndpointFor("postgres://u:p@host:5432/db")).toBe(false);
  });

  it("an env override wins over the sniff, both directions", () => {
    const dsn = "postgres://u:p@host:5432/db";
    process.env["KSOR_DB_POOLED_ENDPOINT"] = "true";
    expect(pooledEndpointFor(dsn)).toBe(true);
    process.env["KSOR_DB_POOLED_ENDPOINT"] = "0";
    expect(pooledEndpointFor("postgres://u:p@ep-x-pooler.neon.tech/db")).toBe(false);
    delete process.env["KSOR_DB_POOLED_ENDPOINT"];
  });
});

describe("error classification — the retry/shed contract", () => {
  const withCode = (code: string): Error => Object.assign(new Error(code), { code });

  it("retries only connection-level (operational) errors", () => {
    expect(isOperationalError(withCode("08006")), "connection failure class").toBe(true);
    expect(isOperationalError(withCode("57P03")), "cannot connect now (booting)").toBe(true);
    expect(isOperationalError(withCode("ECONNRESET")), "syscall reset").toBe(true);
    expect(isOperationalError(withCode("42601")), "syntax error is NOT operational").toBe(false);
  });

  it("never retries a statement timeout or saturation", () => {
    expect(neverRetry(withCode("57014")), "query_canceled — slow, not dropped").toBe(true);
    expect(neverRetry(withCode("53300")), "too_many_connections — shed").toBe(true);
    expect(neverRetry(new PoolTimeoutError()), "checkout shed").toBe(true);
    expect(isOperationalError(withCode("57014")), "a canceled statement is not retryable").toBe(
      false,
    );
  });

  it("a bare connection-drop message (no code) is operational", () => {
    expect(isOperationalError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isOperationalError(new Error("some app-level failure"))).toBe(false);
  });
});

describe("pinnedTlsDsn — act on the driver's warning instead of forwarding it", () => {
  it("spells a weak remote sslmode out as verify-full", () => {
    for (const mode of ["require", "prefer", "verify-ca"]) {
      const out = pinnedTlsDsn(`postgresql://u@db.example.com/x?sslmode=${mode}`);
      expect(out, mode).toContain("sslmode=verify-full");
      expect(out, mode).not.toContain(`sslmode=${mode}&`);
    }
  });

  it("keeps every other query parameter, and their values", () => {
    const out = pinnedTlsDsn(
      "postgresql://u:p@ep-x-pooler.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    );
    const params = new URL(out).searchParams;
    expect(params.get("sslmode")).toBe("verify-full");
    // channel_binding=require is NOT an sslmode and must survive untouched.
    expect(params.get("channel_binding")).toBe("require");
    expect(new URL(out).hostname).toBe("ep-x-pooler.aws.neon.tech");
    expect(new URL(out).password).toBe("p");
  });

  it("leaves loopback and the explicit opt-outs exactly as written", () => {
    for (const dsn of [
      "postgresql://u@localhost:5432/db?sslmode=require",
      "postgresql://u@127.0.0.1:5432/db?sslmode=prefer",
      "postgresql://u@[::1]:5432/db?sslmode=require",
      "postgresql://u@db.example.com/x?sslmode=disable",
      "postgresql://u@db.example.com/x?sslmode=no-verify",
      "postgresql://u@db.example.com/x?sslmode=verify-full",
      "postgresql://u@db.example.com/x",
    ]) {
      expect(pinnedTlsDsn(dsn), dsn).toBe(dsn);
    }
  });

  it("never throws on an unparseable DSN", () => {
    expect(pinnedTlsDsn("not a url")).toBe("not a url");
    expect(pinnedTlsDsn("")).toBe("");
  });
});

describe("tlsPosture — one phrase, stating what IS", () => {
  it("says nothing about a loopback DSN — a local socket needs no certificate story", () => {
    expect(tlsPosture("postgresql://u@localhost:5432/db?sslmode=require")).toBeNull();
  });

  it("names the pin so the boot report explains the DSN the operator wrote", () => {
    const out = tlsPosture("postgresql://u@db.example.com/x?sslmode=require");
    expect(out).toContain("verified");
    expect(out).toContain("sslmode=require");
    expect(out).toContain("verify-full");
  });

  it("distinguishes verified, off, and deliberately unverified", () => {
    expect(tlsPosture("postgresql://u@db.example.com/x?sslmode=verify-full")).toBe("TLS verified");
    expect(tlsPosture("postgresql://u@db.example.com/x")).toBe("TLS verified");
    expect(tlsPosture("postgresql://u@db.example.com/x?sslmode=disable")).toContain("off");
    expect(tlsPosture("postgresql://u@db.example.com/x?sslmode=no-verify")).toContain("UNVERIFIED");
  });

  it("never throws on an unparseable DSN", () => {
    expect(tlsPosture("not a url")).toBeNull();
  });
});

describe("connect timeout vs pool saturation", () => {
  // `connectionTimeoutMillis` bounds both, and pg reports them with the same
  // text. Only one of them is safe to retry.
  const timeoutError = new Error("timeout exceeded when trying to connect");

  /**
   * `total` and `busy` are DIFFERENT numbers and the split lives on the gap
   * between them. pg-pool's `totalCount` counts sockets that are still
   * completing their handshake (it pushes the client before connect resolves,
   * 3.14 index.js:242), while `busy` — tracked from the pool's own
   * acquire/release events — counts connections that actually work. A pool can
   * be "full" by the first and empty by the second: that is a cold burst
   * against a waking compute, and shedding it was the round-4 defect.
   */
  const fakePool = (o: { max: number; total: number; idle: number; busy?: number }): unknown => ({
    options: { max: o.max, connectionTimeoutMillis: 10_000 },
    totalCount: o.total,
    idleCount: o.idle,
    ksorBusy: o.busy ?? 0,
    connect: () => Promise.reject(timeoutError),
  });

  it("classifies a WAIT on a fully busy pool as saturation — never retried", async () => {
    // Four connections that CONNECTED and are all checked out.
    const pool = fakePool({
      max: 4,
      total: 4,
      idle: 0,
      busy: 4,
    }) as Parameters<typeof scopedTxn>[0];
    await expect(scopedTxn(pool, {}, async () => undefined)).rejects.toBeInstanceOf(
      PoolTimeoutError,
    );
    expect(neverRetry(new PoolTimeoutError())).toBe(true);
  });

  it("classifies a failure with slots to spare as a CONNECT failure — retried", async () => {
    const pool = fakePool({ max: 20, total: 1, idle: 0 }) as Parameters<typeof scopedTxn>[0];
    await expect(scopedTxn(pool, {}, async () => undefined)).rejects.toBeInstanceOf(
      ConnectTimeoutError,
    );
    expect(neverRetry(new ConnectTimeoutError(10_000))).toBe(false);
    expect(isOperationalError(new ConnectTimeoutError(10_000))).toBe(true);
  });

  it("a pool FULL of handshaking sockets is a cold burst, not saturation", async () => {
    // Every slot taken by pg-pool's count, and NOTHING connected: the shape of
    // a burst arriving at a suspended compute. Shedding these threw away the
    // requests the classification exists to keep, and gave identical callers
    // opposite verdicts depending on arrival order (round-4 review of #43).
    const pool = fakePool({
      max: 20,
      total: 20,
      idle: 0,
      busy: 0,
    }) as Parameters<typeof scopedTxn>[0];
    await expect(scopedTxn(pool, {}, async () => undefined)).rejects.toBeInstanceOf(
      ConnectTimeoutError,
    );
  });

  it("an empty pool that cannot connect is a cold start, not saturation", async () => {
    // The exact shape of the first request after a serverless endpoint suspends.
    const pool = fakePool({ max: 20, total: 0, idle: 0 }) as Parameters<typeof scopedTxn>[0];
    await expect(scopedTxn(pool, {}, async () => undefined)).rejects.toBeInstanceOf(
      ConnectTimeoutError,
    );
  });

  it("a pool at max with an idle connection is not saturation either", async () => {
    const pool = fakePool({ max: 4, total: 4, idle: 1 }) as Parameters<typeof scopedTxn>[0];
    await expect(scopedTxn(pool, {}, async () => undefined)).rejects.toBeInstanceOf(
      ConnectTimeoutError,
    );
  });

  it("says which bound it hit, so an operator can tell the two apart", () => {
    expect(new ConnectTimeoutError(10_000).message).toMatch(/waking from suspend/);
    expect(new PoolTimeoutError().message).toMatch(/saturated/);
  });
});
