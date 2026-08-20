import { describe, expect, it } from "vitest";

import {
  ConnectTimeoutError,
  PoolTimeoutError,
  isOperationalError,
  neverRetry,
  pooledEndpointFor,
  scopedTxn,
  tlsAdvisory,
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

describe("tlsAdvisory", () => {
  it("is silent for a loopback DSN — a local socket needs no certificate story", () => {
    for (const dsn of [
      "postgresql://u@localhost:5432/db?sslmode=require",
      "postgresql://u@127.0.0.1:5432/db?sslmode=prefer",
    ]) {
      expect(tlsAdvisory(dsn), dsn).toBeNull();
    }
  });

  it("is silent when the DSN states the posture explicitly", () => {
    expect(tlsAdvisory("postgresql://u@db.example.com/x?sslmode=verify-full")).toBeNull();
    expect(tlsAdvisory("postgresql://u@db.example.com/x?sslmode=disable")).toBeNull();
  });

  it("names the weak mode and the one-word fix for a remote DSN", () => {
    for (const mode of ["require", "prefer", "verify-ca"]) {
      const out = tlsAdvisory(`postgresql://u@db.example.com/x?sslmode=${mode}`);
      expect(out, mode).toContain(mode);
      expect(out, mode).toContain("verify-full");
    }
  });

  it("never throws on an unparseable DSN", () => {
    expect(tlsAdvisory("not a url")).toBeNull();
    expect(tlsAdvisory("")).toBeNull();
  });
});

describe("connect timeout vs pool saturation", () => {
  // `connectionTimeoutMillis` bounds both, and pg reports them with the same
  // text. Only one of them is safe to retry.
  const timeoutError = new Error("timeout exceeded when trying to connect");

  const fakePool = (o: { max: number; total: number; idle: number }): unknown => ({
    options: { max: o.max, connectionTimeoutMillis: 10_000 },
    totalCount: o.total,
    idleCount: o.idle,
    connect: () => Promise.reject(timeoutError),
  });

  it("classifies a WAIT on a fully busy pool as saturation — never retried", async () => {
    const pool = fakePool({ max: 4, total: 4, idle: 0 }) as Parameters<typeof scopedTxn>[0];
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
