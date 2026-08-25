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

import {
  AudienceError,
  EmbeddingSpaceMismatch,
  GovernanceGateError,
  SchemaVersionError,
  TextSearchConfigMismatch,
  validateViewer,
} from "@panaversity/ksor-content";

import { isRefusal, notReadyReason, refusalBody } from "./refusal-body.js";

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

describe("a governance refusal carries the remedy WITHOUT the record's own identifiers", () => {
  // This is where the leak lived, and this file is why it lived: the test above
  // hands `GovernanceGateError` a message that happens to name no document, so
  // the pass-through looked safe. The real ones interpolate the `stable_id`s of
  // WITHDRAWN documents, and under KSOR_AUTH=disabled-public the 503 reaches
  // anybody. The db-tier twin composes the errors through the real gate; this
  // is the same guarantee at unit cost, on the class's own contract.
  const withdrawn = ["knowledge/hr/allegation-2026-03", "knowledge/legal/settlement-doe"];
  const governance = (): GovernanceGateError =>
    new GovernanceGateError(
      "ksor-takedown-unledgered: 2 denial(s) carry no ledger entry\n  fix: ksor migrate --write",
      withdrawn,
    );

  it("names them to the OPERATOR — the logs are where the fix happens", () => {
    expect(governance().message).toContain("knowledge/hr/allegation-2026-03");
  });

  it("and to nobody else", () => {
    const serialized = JSON.stringify(refusalBody(governance()));
    for (const stableId of withdrawn) {
      expect(serialized, `a 503 enumerated a withdrawn document:\n${serialized}`).not.toContain(
        stableId,
      );
    }
  });

  it("sends `wire` itself, not the operator's copy with the names trimmed off", () => {
    // The seam, pinned by identity rather than by absence. A `not.toContain`
    // suite passes for any text that merely happens to omit today's fixtures —
    // including a future message that names a document some other way. This
    // fails the moment the body stops being the text the author marked public.
    //
    // The summary LINE cannot discriminate: `message` is `wire` plus a suffix,
    // so both share a first line by construction. That is the redesign working,
    // not a hole — the identifiers can no longer be written where the old
    // messages put them.
    const error = governance();
    expect(refusalBody(error).error.data?.detail).toBe(error.wire);
    expect(error.wire, "and the two really are different texts").not.toBe(error.message);
  });

  it("keeps the slug and the remedy, which is the whole point of sending anything", () => {
    const body = refusalBody(governance());
    expect(body.error.data?.detail).toContain("ksor-takedown-unledgered");
    expect(body.error.data?.detail).toContain("ksor migrate --write");
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

describe("what the UNAUTHENTICATED readiness probe may say", () => {
  // /ready collapsed every rejection to `false` and hardcoded "content store
  // unreachable", so a governance refusal — which no retry can fix, about a
  // database that had just answered — was reported forever as a network
  // problem, while POST /mcp returned the real remedy. One door, two stories.
  it("stops calling a governance refusal a network fault", () => {
    const reason = notReadyReason(new GovernanceGateError("ksor-takedown-unledgered: 2 …", ["x"]));
    expect(reason, "the old lie").not.toContain("unreachable");
    expect(reason).toContain("GovernanceGateError");
    expect(reason, "and where the operator should look").toMatch(/log/i);
  });

  it("still says unreachable when the store genuinely is", () => {
    expect(notReadyReason(new Error("connect ECONNREFUSED"))).toContain("unreachable");
  });

  it("says LESS than the 503 body does, deliberately", () => {
    // /ready is unauthenticated on EVERY posture — a bearer-gated door still
    // answers it to anyone who can reach the port, which POST /mcp does not. So
    // the probe names the class and points at the logs; it does not repeat the
    // record's governance state to an anonymous prober.
    const error = new GovernanceGateError("ksor-takedown-unledgered: 2 denial(s) …\n  fix: …", []);
    const reason = notReadyReason(error);
    expect(reason).not.toContain("ksor-takedown-unledgered");
    expect(reason).not.toContain("denial");
  });
});

describe("every refusal compose REFUSES is a refusal this module SERVES", () => {
  /**
   * Two lists that had to agree, and did not.
   *
   * `compose` re-throws five classes rather than deferring them — they are
   * verdicts, not outages. `isAuthored` listed three. The other two fell to the
   * driver branch, so on the RETRY path (store asleep at boot, awake later) a
   * one-character typo in KSOR_AUDIENCE answered every request with "the content
   * store is unavailable (AudienceError)" — a refusal misdiagnosing itself as
   * the outage it is not, about a database that had just replied, while the real
   * text naming the fix reached nobody.
   *
   * The two lists are now one predicate, so this cannot drift again; these
   * assert the behaviour that made the drift matter.
   */
  const cases: readonly [string, Error][] = [
    [
      "AudienceError",
      new AudienceError("ksor-viewer-unregistered", "the viewer list names `internel`\n  fix: …"),
    ],
    ["EmbeddingSpaceMismatch", new EmbeddingSpaceMismatch(["chunks.embedding is vector(768)"])],
  ];

  for (const [name, error] of cases) {
    it(`does not report ${name} as a store outage`, () => {
      const body = refusalBody(error);
      expect(body.error.message, "it is a verdict, not an outage").not.toContain(
        "content store is unavailable",
      );
      expect(body.error.data?.detail, "and its own text must reach the caller").toBeDefined();
    });

    it(`does not tell the readiness probe ${name} is a network fault`, () => {
      expect(notReadyReason(error)).not.toContain("unreachable");
      expect(notReadyReason(error)).toContain(name);
    });
  }

  it("carries the audience refusal's slug and its fix", () => {
    const detail = refusalBody(cases[0]![1]).error.data?.detail ?? "";
    expect(detail).toContain("ksor-viewer-unregistered");
    expect(detail).toContain("fix:");
  });

  it("but NOT the record's own audience registry", () => {
    // The unknown name is the operator's own typo, from their env. The REGISTRY
    // is the record's governance vocabulary — the same class of thing as the
    // withdrawn document paths above, and it does not belong on an
    // unauthenticated wire just because the operator mistyped a variable.
    const error = validateViewerError();
    const serialized = JSON.stringify(refusalBody(error));
    expect(serialized, `the registry reached the wire:\n${serialized}`).not.toContain("boardroom");
    expect(error.message, "the operator still gets it").toContain("boardroom");
  });
});

/** The real refusal `validateViewer` raises, not a hand-written approximation. */
function validateViewerError(): AudienceError {
  try {
    validateViewer(["boardroom", "legal-hold"], ["public", "internel"]);
  } catch (error) {
    return error as AudienceError;
  }
  throw new Error("validateViewer did not refuse");
}

describe("isRefusal — the membership itself, since compose now reads this table", () => {
  // Enumerated here because this is the only copy. Each of these is a VERDICT
  // about the record: compose re-throws it instead of deferring, and this
  // module serves its text. A class missing from the table is deferred forever
  // by one and reported as a store outage by the other, which is what happened.
  const verdicts: readonly [string, Error][] = [
    ["SchemaVersionError", new SchemaVersionError("database schema is 2.1")],
    ["TextSearchConfigMismatch", new TextSearchConfigMismatch("english", "simple")],
    ["EmbeddingSpaceMismatch", new EmbeddingSpaceMismatch(["chunks.embedding is vector(768)"])],
    ["GovernanceGateError", new GovernanceGateError("ksor-takedown-unledgered: 1 …", ["k/x"])],
    ["AudienceError", new AudienceError("ksor-viewer-unregistered", "…", ["internal"])],
  ];

  for (const [name, error] of verdicts) {
    it(`counts ${name} as a refusal`, () => {
      expect(isRefusal(error)).toBe(true);
    });
  }

  it("and an infrastructure failure as not one — the fail-closed default", () => {
    // Anything unenrolled falls to the driver branch: its text is withheld and
    // the boot defers rather than refusing. Forgetting to enrol a class costs a
    // caller some detail; it never leaks and never fails open.
    expect(isRefusal(new Error("connect ECONNREFUSED"))).toBe(false);
    expect(isRefusal("not even an error")).toBe(false);
  });
});
