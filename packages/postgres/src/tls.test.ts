/**
 * The TLS posture is CHOSEN, and a driver bump cannot change it.
 *
 * pg 8 resolves `sslmode=require|prefer|verify-ca` to full verification, so
 * ksor's verified TLS came from a default rather than a decision — and the
 * driver warns that those modes adopt libpq semantics (no certificate
 * verification) in pg 9. Nothing in the repo stated the posture and no test
 * asserted it, so the guarantee would have disappeared on a dependency bump
 * with every gate still green (audit finding 28).
 */

import { describe, expect, it } from "vitest";

import { tlsOptionsFor } from "./db.js";

describe("the TLS posture ksor passes to the driver", () => {
  it.each([
    ["postgresql://u@db.example.com/x?sslmode=require", true],
    ["postgresql://u@db.example.com/x?sslmode=verify-ca", true],
    ["postgresql://u@db.example.com/x?sslmode=verify-full", true],
    ["postgresql://u@db.example.com/x?sslmode=prefer", true],
    // No sslmode at all on a REMOTE host: still verify. A managed endpoint
    // that speaks TLS must not be reached unverified because a query string
    // was left off.
    ["postgresql://u@db.example.com/x", true],
  ])("%s verifies certificates", (dsn, expected) => {
    expect(tlsOptionsFor(dsn)?.rejectUnauthorized).toBe(expected);
  });

  it.each([
    // Loopback: no TLS in play; passing an ssl option would break local dev.
    "postgresql://ksor@127.0.0.1:5432/ksor",
    "postgresql://ksor@localhost:5432/ksor",
    "postgresql://ksor@[::1]:5432/ksor",
    // The operator said no, explicitly. Their call, not ours to override.
    "postgresql://u@db.example.com/x?sslmode=disable",
    "postgresql://u@db.example.com/x?sslmode=no-verify",
  ])("%s is left to the driver", (dsn) => {
    expect(tlsOptionsFor(dsn)).toBeUndefined();
  });

  it("a DSN that is not a URL does not throw", () => {
    expect(tlsOptionsFor("not a dsn")).toBeUndefined();
  });

  it("createPool passes it — the option is not merely computed", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "db.ts"),
      "utf8",
    );
    expect(src).toContain("const tls = tlsOptionsFor(dsn);");
    expect(src).toContain("...(tls === undefined ? {} : { ssl: tls })");
  });
});
