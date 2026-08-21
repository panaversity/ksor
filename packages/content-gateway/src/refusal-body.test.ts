/**
 * What a 503 refusal is allowed to put on the wire.
 *
 * The deferred-boot refusal returns the thrown error's message in full, under
 * `data.detail`. For the three AUTHORED failures that is the point — a schema
 * that is too old, a governance violation, or a text-search mismatch each carry
 * a multi-line remedy an operator has to act on, and truncating it to one line
 * would be the "errors are documentation" principle broken at the moment it
 * matters most.
 *
 * A DRIVER error is a different thing on the same channel. `pg` writes the host,
 * the port, the resolved address and the database user into its connection and
 * authentication failures, and `storedTextSearchConfig` queried the pool with no
 * catch at all, so those went out verbatim.
 *
 * The test that covered this asserted the leak: it grepped `http.ts` for the
 * literal string `data: { detail: message }`. That is a legitimate way to pin
 * where a check SITS — position is a property of source — and the wrong way to
 * pin what a response CONTAINS. So the defect was held in place by an assertion
 * with reasoning attached. Payloads need a real response; this file builds one.
 */

import { describe, expect, it } from "vitest";

import { GovernanceGateError, SchemaVersionError } from "@panaversity/ksor-content";

import { refusalBody } from "./refusal-body.js";

/** A pg connection failure, in the shape the driver actually produces. */
const driverError = (): Error =>
  Object.assign(
    new Error(
      'connection to server at "ep-secret-corp-9f2.eu-central-1.aws.neon.tech" (10.4.7.22), ' +
        'port 5432 failed: FATAL: password authentication failed for user "sor_content_runtime"',
    ),
    { code: "28P01" },
  );

const SECRETS = [
  "ep-secret-corp-9f2",
  "neon.tech",
  "10.4.7.22",
  "5432",
  "sor_content_runtime",
  "password authentication",
];

describe("an authored refusal carries its whole remedy", () => {
  it("keeps the multi-line detail — that IS the fix instruction", () => {
    const authored = new SchemaVersionError(
      "database schema is 2.1; this build requires >= 2.4.\n" +
        "Run `ksor schema --instance instance.md --apply` to migrate it forward.",
    );
    const body = refusalBody(authored);
    expect(body.error.message).toContain("this record cannot be served:");
    expect(body.error.data?.detail, "the operator needs the second line").toContain(
      "ksor schema --instance instance.md --apply",
    );
    expect(body.error.data?.detail).toBe(authored.message);
  });

  it("does the same for a governance refusal", () => {
    const body = refusalBody(new GovernanceGateError("a document declares visibility:\nfix: …"));
    expect(body.error.data?.detail).toContain("fix:");
  });
});

describe("a driver error is refused WITHOUT its detail", () => {
  it("puts no host, address, port or database user on the wire", () => {
    const serialized = JSON.stringify(refusalBody(driverError()));
    for (const secret of SECRETS) {
      expect(serialized, `leaked ${secret} into a 503 body:\n${serialized}`).not.toContain(secret);
    }
  });

  it("still refuses, and still says the record cannot be served", () => {
    const body = refusalBody(driverError());
    expect(body.error.message).toContain("this record cannot be served");
    expect(body.error.code).toBe(-32001);
  });

  it("says the class of failure and where to look, instead of nothing", () => {
    // Honest absence, never silent weakness: the caller learns this is an
    // infrastructure fault rather than their request, and the operator is sent
    // to the place the real message IS written.
    const body = refusalBody(driverError());
    expect(body.error.message.toLowerCase()).toMatch(/unavailable|store/);
    expect(body.error.data?.detail, "no detail at all beats a leaked one").toBeUndefined();
  });

  it("treats an unknown non-Error throw the same way", () => {
    const serialized = JSON.stringify(refusalBody("postgres://user:hunter2@db.internal/x"));
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("db.internal");
  });
});
