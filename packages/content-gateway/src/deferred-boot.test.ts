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
 * So the gate belongs on the request path. This asserts the source, because the
 * behaviour is a property of where the check sits: the live walk is recorded in
 * the comments beside it, and the acceptance suite drives the real door.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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

  it("refuses with 503 and names the reason, rather than a bare error", () => {
    expect(HTTP).toContain("this record cannot be served:");
    expect(HTTP, "a refusal an operator can act on carries the full remedy").toContain(
      "data: { detail: message }",
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

  it("a refusal is never deferred — only an unreachable store is", () => {
    expect(COMPOSE).toContain(
      "if (error instanceof SchemaVersionError || error instanceof GovernanceGateError) throw error;",
    );
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
});
