/**
 * The TLS pin must change the sslmode and NOTHING else the driver sees.
 *
 * `pinnedTlsDsn` rewrites a weak remote `sslmode` by parsing the DSN as a URL
 * and re-serializing it. Re-serializing a connection string is a real hazard:
 * an adopter's password is arbitrary bytes, and a round trip that re-encodes
 * one produces a DSN that authenticates as something else — a failure that only
 * appears against their database, never here.
 *
 * So this asserts against `pg`'s OWN view of the string (`Client`'s resolved
 * connectionParameters — the driver's parser, not a reimplementation of it):
 * every field the driver derives must be identical before and after, except the
 * TLS decision, which must be at least as strong.
 *
 * A `Client` is constructed and never connected; parsing happens in the
 * constructor, so this touches no network.
 */

import pg from "pg";
import { describe, expect, it } from "vitest";

import { pinnedTlsDsn, tlsPosture } from "./db.js";

interface DriverView {
  readonly user: unknown;
  readonly password: unknown;
  readonly host: unknown;
  readonly port: unknown;
  readonly database: unknown;
  readonly ssl: string;
}

function driverView(dsn: string): DriverView {
  // `connectionParameters` is the driver's resolved view of the string. It is
  // not in @types/pg, but it is where pg itself keeps the answer — reading it is
  // the whole point: this must assert against the DRIVER's parse, never a
  // second implementation of one.
  const p = (
    new pg.Client({ connectionString: dsn }) as unknown as {
      connectionParameters: Record<string, unknown>;
    }
  ).connectionParameters;
  return {
    user: p["user"],
    password: p["password"],
    host: p["host"],
    port: p["port"],
    database: p["database"],
    ssl: JSON.stringify(p["ssl"]),
  };
}

/** Passwords and names people actually paste, including ones a naive round trip mangles. */
const DSNS: readonly string[] = [
  "postgresql://u:p@db.example.com/x?sslmode=require",
  "postgresql://u:p%40ss@db.example.com/x?sslmode=require",
  "postgresql://u:p@ss@db.example.com/x?sslmode=require",
  "postgresql://u:a+b@db.example.com/x?sslmode=require",
  "postgresql://u:a%20b@db.example.com/x?sslmode=require",
  "postgresql://u:p w@db.example.com/x?sslmode=require",
  "postgresql://u:p%@db.example.com/x?sslmode=require",
  "postgresql://u:p[w]@db.example.com/x?sslmode=require",
  "postgresql://u:pass~word!@db.example.com/x?sslmode=require",
  "postgresql://u:%C3%A9t%C3%A9@db.example.com/x?sslmode=require",
  "postgresql://user@name:p@db.example.com/x?sslmode=require",
  "postgresql://u:p@db.example.com/my db?sslmode=require",
  "postgresql://u:p@db.example.com:6543/x?sslmode=prefer",
  "postgresql://u:p@db.example.com/x?sslmode=verify-ca&application_name=my app",
  "postgres://u:p@db.example.com/x?sslmode=require&options=-c%20search_path%3Dfoo",
  "postgresql://neondb_owner:npg_aH9i%2BL4A%2FuSOj@ep-x-pooler.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  "postgresql://u@[2001:db8::1]:5432/x?sslmode=require",
];

describe("pinnedTlsDsn preserves everything the driver derives", () => {
  it.each(DSNS)("%s", (dsn) => {
    const before = driverView(dsn);
    const after = driverView(pinnedTlsDsn(dsn));
    expect({ ...after, ssl: before.ssl }, `the pin altered a credential in: ${dsn}`).toEqual(
      before,
    );
    // pg 8 resolves the weak modes to full verification already, so the TLS
    // decision must come out BYTE-IDENTICAL too — the pin states what was
    // happening, it does not change it.
    expect(after.ssl, `the pin changed the TLS decision for: ${dsn}`).toBe(before.ssl);
  });
});

describe("a repeated sslmode is read the way the DRIVER reads it — last wins", () => {
  // Found by sweeping the driver's own parser (2026-08-21). `searchParams.get`
  // returns the FIRST value; pg takes the LAST. So `require&disable`, whose
  // effective mode is `disable`, looked weak to the pin — which then collapsed
  // the duplicates into one `verify-full` and turned TLS ON, while the boot line
  // announced "verified" for a DSN the operator had ended with `disable`. The
  // direction was safe; the report was not, and silently overruling an explicit
  // `disable` is not the pin's job.
  it("leaves a DSN whose EFFECTIVE mode is an explicit opt-out alone", () => {
    for (const dsn of [
      "postgresql://u:p@db.example.com/x?sslmode=require&sslmode=disable",
      "postgresql://u:p@db.example.com/x?sslmode=prefer&sslmode=no-verify",
    ]) {
      expect(pinnedTlsDsn(dsn), dsn).toBe(dsn);
      expect(driverView(pinnedTlsDsn(dsn)).ssl, dsn).toBe(driverView(dsn).ssl);
    }
  });

  it("still pins when the LAST value is the weak one", () => {
    const dsn = "postgresql://u:p@db.example.com/x?sslmode=disable&sslmode=require";
    expect(pinnedTlsDsn(dsn)).toContain("sslmode=verify-full");
    expect(driverView(pinnedTlsDsn(dsn)).ssl).toBe(driverView(dsn).ssl);
  });

  it("and the boot line reports the mode the driver will actually use", () => {
    expect(
      tlsPosture("postgresql://u:p@db.example.com/x?sslmode=require&sslmode=disable"),
    ).toContain("off");
    expect(
      tlsPosture("postgresql://u:p@db.example.com/x?sslmode=disable&sslmode=require"),
    ).toContain("verified");
  });
});
