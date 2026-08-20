import { describe, expect, it } from "vitest";

import { isOperationalError, neverRetry, pooledEndpointFor, PoolTimeoutError } from "./db.js";

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
