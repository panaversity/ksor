/**
 * A door whose boot checks have not passed must refuse REQUESTS, not merely
 * report itself unhealthy.
 *
 * The boot checks — schema compatibility and the governance gate — can only be
 * warnings when the store is unreachable at boot, which on a serverless compute
 * is the ordinary cold start. Round 5 made them deferrable; round 6 found two
 * holes in that, both proved live against a running server:
 *
 *   1. Only the SCHEMA half was retried, so a cold start permanently skipped
 *      the governance gate and the door served a `visibility: internal`
 *      document from a record declaring no audience model.
 *   2. Once both were retried, `/ready` correctly answered {"ready":false} —
 *      and a direct POST to /mcp STILL returned that document in full, because
 *      a readiness probe governs ROUTING, not access. Anything that reaches the
 *      port ignores it.
 *
 * So the gate belongs on the request path. Most of this file asserts the
 * SOURCE, because the behaviour is a property of where each check sits — and
 * that is exactly how a fourth hole got in: a database read was added just
 * BELOW the deferred block, where nothing was looking. Two things were added
 * for it. The pool reads are ENROLLED, so a new one fails by name. And the last
 * test drives `compose` against a store that is genuinely not there, because
 * "the door comes up" is a claim about a running process, not about a slice of
 * text — the boot it was reading passed every source assertion here while
 * exiting 3.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compose } from "./compose.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const HTTP = readFileSync(path.join(here, "http.ts"), "utf8");
const COMPOSE = readFileSync(path.join(here, "compose.ts"), "utf8");

describe("deferred boot checks gate the door, not just the probe", () => {
  it("the MCP request path awaits the boot checks before dispatching", () => {
    const handler = HTTP.slice(
      HTTP.indexOf("const handleMcp"),
      HTTP.indexOf("const mcp = bodyLimit"),
    );
    expect(handler, "every request must be gated, not only /ready").toContain("await verifyBoot()");
    // …and BEFORE the handler runs, or the refusal would come after the answer.
    expect(
      handler.indexOf("await verifyBoot()"),
      "the check must precede mcpHandler.fetch",
    ).toBeLessThan(handler.indexOf("mcpHandler.fetch"));
  });

  it("/health says the boot checks have not passed, instead of reading normal", () => {
    // During a deferred boot the door refuses 100% of requests and /health
    // reported a perfectly ordinary posture — corpus, gate, auth — with nothing
    // saying so. /ready knows, but /ready answers a load balancer; /health is
    // what a person curls (review finding 5).
    const health = HTTP.slice(
      HTTP.indexOf('app.get("/health"'),
      HTTP.indexOf('app.get("/.well-known'),
    );
    expect(health, "the state must be ON the body").toContain("boot_checks");
  });

  it("/health reports the store NOW, not only whether boot once passed", () => {
    // `boot_checks: "passed"` is a fact about the PAST. Walked live: with the
    // store totally unreachable and 100% of requests refused, /health answered
    // 200 with every field green, while /ready correctly said
    // {"ready":false,"reason":"content store unreachable"}. /health is the one a
    // person curls when they want to know what is wrong, and in a post-boot
    // outage it read healthy (resilience walk, 2026-08-25).
    const health = HTTP.slice(
      HTTP.indexOf('app.get("/health"'),
      HTTP.indexOf('app.get("/.well-known'),
    );
    expect(health, "a reachability field must be on the body").toContain("store:");
    // …through the SAME coalesced probe /ready uses, never a second one: a
    // second probe on an endpoint that is unauthenticated under
    // KSOR_AUTH=disabled-public is the pool-exhaustion amplifier /ready's
    // coalescing was written to prevent.
    expect(health, "share the probe, do not add one").toContain("await readiness()");
  });

  it("the 413 names the knob that raises it", () => {
    // "request body too large" and nothing else: not the limit, not the
    // variable (review finding 6). Errors are documentation.
    const limit = HTTP.slice(HTTP.indexOf("const mcp = bodyLimit"), HTTP.indexOf("const isListen"));
    expect(limit).toContain("KSOR_MAX_BODY_BYTES");
    expect(limit, "and the value it is set to").toContain("maxBodyBytes");
  });

  it("builds the refusal body through the one function that decides what may leave", () => {
    // Deliberately NOT an assertion about the body's contents. This file greps
    // source, which is the right instrument for "does the check sit before
    // dispatch" — position is a property of source — and the wrong one for
    // "what does the response contain".
    //
    // It was used for both, and that is how the leak survived: the old
    // assertion required the literal string `data: { detail: message }` in
    // http.ts, so a test with reasoning attached PINNED a driver error's host,
    // address, port and database user onto the wire. What goes in the body is
    // now asserted against real bodies in refusal-body.test.ts; all this may
    // legitimately check is that the handler routes through it.
    expect(HTTP, "the 503 body must not be assembled inline again").toContain("refusalBody(error)");
    expect(HTTP, "and the full text must still reach the operator's logs").toContain(
      "refusing requests — boot checks failing",
    );
  });

  it("schema and governance are ONE deferred set — deferring one defers both", () => {
    // They were two separate calls, and the governance one ran only on the
    // branch where the schema check had already succeeded.
    const checks = COMPOSE.slice(
      COMPOSE.indexOf("const bootChecks"),
      COMPOSE.indexOf("let verifyBoot"),
    );
    expect(checks).toContain("assertSchemaCompatible(pool)");
    expect(checks).toContain("assertGovernanceServable(pool, instance)");
  });

  it("shares ONE in-flight attempt, so a burst cannot multiply boot checks", () => {
    // The door awaits verifyBoot on every request until it passes. Memoizing
    // only the settled result meant a burst against a waking database started
    // one full check chain PER REQUEST — the pool-exhaustion amplifier
    // /ready's coalescing exists to prevent, on a hotter path (round-9 review
    // of #43).
    const closure = COMPOSE.slice(COMPOSE.indexOf("let verified = false;"));
    expect(closure, "an in-flight attempt must be shared").toContain(
      "if (inFlight !== null) return inFlight;",
    );
    // …and cleared on BOTH outcomes, or a failed attempt would never be retried.
    const body = closure.slice(0, closure.indexOf("};"));
    expect(body.split("inFlight = null;").length - 1, "cleared on success AND failure").toBe(2);
  });

  it("the governance gate is not called anywhere outside the deferred set", () => {
    // A second call site is how the two drifted apart the first time.
    const calls = COMPOSE.split("assertGovernanceServable(").length - 1;
    expect(calls, "one call, inside bootChecks (plus the import)").toBe(1);
  });

  it("a refusal is never deferred, and decides that with the SHARED table", () => {
    // This used to spell the classes out here, and `refusal-body.ts` spelled a
    // DIFFERENT set out for the wire — so two of them were refused by one and
    // unrecognised by the other, and a governance verdict was served to callers
    // as "the content store is unavailable". The membership itself is asserted
    // where the table lives (`refusal-body.test.ts`); what belongs here is that
    // compose reads that table rather than keeping a second copy.
    const guard = COMPOSE.slice(COMPOSE.indexOf("await withPgRetry(bootChecks"));
    const beforeDeferral = guard.slice(0, guard.indexOf("boot checks DEFERRED:"));
    expect(beforeDeferral, "the shared predicate, not a re-listed set").toContain(
      "if (isRefusal(error)) throw error;",
    );
    expect(
      COMPOSE.split("instanceof SchemaVersionError").length - 1,
      "no second copy of the list",
    ).toBe(0);
  });

  it("logs the WHOLE deferred cause, not just its class", () => {
    // `pg` reports most connection failures as a bare `Error`, so "content
    // store unreachable (Error)" told an operator nothing — not the host, the
    // user, or whether it was DNS, TLS or a password. The detail existed only
    // from the first REQUEST onwards, so an instance nobody called never
    // explained itself at all.
    const deferral = COMPOSE.slice(COMPOSE.indexOf("boot checks DEFERRED:"));
    expect(deferral.slice(0, deferral.indexOf("let verified"))).toContain("error.stack");
  });

  /**
   * EVERY database read in compose.ts is enrolled here with the reason it
   * survives a cold start. Nothing structural stopped a new one being added
   * after the deferred block — and one was (`servingPolicy`), which printed
   * "DEFERRED … NOT READY" and then exited 3 two statements later.
   *
   * Enrolled rather than positional, the way import graphs are (coding
   * principle 7): a new read fails this test by NAME and its author has to say
   * which of the three shapes it is.
   */
  it("every read that touches the pool is enrolled, and the deferred ones are inside the set", () => {
    const POOL_READS: Readonly<Record<string, "deferred" | "caught" | "opt-in">> = {
      assertSchemaCompatible: "deferred",
      storedTextSearchConfig: "deferred",
      assertGovernanceServable: "deferred",
      servingPolicy: "deferred",
      // What is being served — a row, so it sits beside the policy in the set:
      // the boot line and /health say NONE on a never-ingested record instead
      // of coming up green about nothing.
      publishedGeneration: "deferred",
      // Moved into the set (review finding 3): it was the one fail-closed check
      // that a cold start turned OFF for the life of the process, so a door that
      // recovered served cosine across two embedding spaces with the calibrated
      // floor measured in a space the record no longer used — and /ready said
      // true throughout.
      checkEmbeddingSpace: "deferred",
      // Never throws — Promise.allSettled, logs what it could not open.
      prewarmPool: "opt-in",
    };
    const found = [...COMPOSE.matchAll(/(\w+)\(\s*pool\b/g)].map((m) => m[1]!);
    const unenrolled = [...new Set(found)].filter((name) => !(name in POOL_READS));
    expect(
      unenrolled,
      `unenrolled database read(s) in compose.ts: ${unenrolled.join(", ")} — a read outside the ` +
        "deferred set exits the process on a cold start, after boot has already announced " +
        "DEFERRED. Put it in bootChecks, or catch it, then enrol it here",
    ).toEqual([]);
    const checks = COMPOSE.slice(
      COMPOSE.indexOf("const bootChecks"),
      COMPOSE.indexOf("let verifyBoot"),
    );
    for (const [name, shape] of Object.entries(POOL_READS)) {
      if (shape === "deferred")
        expect(checks, `${name} is enrolled deferred`).toContain(`${name}(`);
    }
  });
});

/**
 * The fixture record. `provider: fake` needs no API key, so the only thing this
 * boot cannot reach is the database — which is the whole point.
 */
const INSTANCE = `---
format: 2
name: deferred-boot-fixture
title: Deferred Boot Fixture
description: Drives compose against a store that cannot be reached.
database:
  dsn_env: KSOR_DEFERRED_TEST_DSN
embedding:
  provider: fake
---

Answer only from this fixture.
`;

/** Port 1 on loopback: nothing listens, so every connect is an instant ECONNREFUSED. */
const UNREACHABLE = "postgres://ksor:ksor@127.0.0.1:1/ksor";

describe("a cold start against an unreachable store comes up NOT READY — it does not exit", () => {
  it("resolves with the checks deferred, and serves at most `public` until they pass", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ksor-deferred-boot-"));
    const instancePath = path.join(dir, "instance.md");
    writeFileSync(instancePath, INSTANCE);
    const saved = { ...process.env };
    const said: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]): void => {
      said.push(args.map((a) => String(a)).join(" "));
    };
    try {
      process.env["KSOR_DEFERRED_TEST_DSN"] = UNREACHABLE;
      // The operator asked for the RESTRICTED half. Validating that ask needs a
      // row from the database, which is exactly what is unreachable here.
      process.env["KSOR_AUDIENCE"] = "public,internal";
      // One attempt, no backoff: ECONNREFUSED is instant, and the shipped
      // default is five attempts with a linear 1s step — 10s of sleeping per
      // check, for a failure this test already knows the shape of.
      process.env["KSOR_READ_RETRY_ATTEMPTS"] = "1";
      process.env["KSOR_READ_RETRY_BACKOFF_S"] = "0";

      const composition = await compose(instancePath, "0.0.0-test");
      try {
        // The whole finding: boot PRINTED "DEFERRED … NOT READY" and then threw
        // two statements later on an unguarded `servingPolicy` read, so `main()`
        // exited 3 and the deploy crash-looped — against exactly the suspended
        // serverless Postgres decision 17 targets.
        expect(
          composition.verifyBoot,
          "an unverified instance must gate its requests",
        ).not.toBeNull();
        expect(said.join("\n")).toContain("boot checks DEFERRED");
        // Fail closed on the way there: nothing has validated `internal` against
        // the ingested policy's registry, so the door holds the one list that is
        // legal for every record.
        expect(composition.ctx.viewer, "unvalidated must never mean wide").toEqual(["public"]);
        // …and the ask is remembered, so the boot report can state what this
        // door will serve once the store answers.
        expect(composition.requestedViewer).toEqual(["public", "internal"]);
        // The embedding-space guard is the one fail-closed check a cold start
        // used to switch off permanently: caught, reduced to a skip reason, and
        // never retried, so /ready answered true on an instance whose vectors
        // had never been compared with the space its floor was calibrated in.
        // While the checks are deferred it must say it has not RUN — a reason
        // that reads like a verdict is what let this sit unnoticed.
        expect(composition.spaceSkipReason, "not a verdict — it has not run").toMatch(
          /not yet verified/i,
        );
      } finally {
        await composition.pool.end();
      }
    } finally {
      console.error = realError;
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  });
});
