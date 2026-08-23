import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildDefaultGateway,
  buildServer,
  listServedTools,
  type ServiceContext,
} from "@panaversity/ksor-content-gateway";

/**
 * Every field an agent receives from `tools/list`, pinned.
 *
 * Written after a refactor silently changed them. Moving the output schemas
 * between modules by RETYPING them produced a `read` tool advertising a `text`
 * field as `content`, missing `sections`, `snapshot_status`, `window_from` /
 * `window_to` and the token estimates — every read reply would have failed its
 * own structured-output validation. Unit tests stayed green, typecheck stayed
 * green, the build stayed green. Only a capture of the real served surface,
 * taken before the change and diffed after, caught it.
 *
 * So the capture is committed. This is the "assert on shipped bytes" rule
 * (paid for with shipped defects) applied to the agent surface — and it needs
 * no database, because building a server and listing its tools never touches
 * one. That is the whole reason this can live in the integration tier rather
 * than behind KSOR_DB_URL.
 *
 * When a change to the surface is INTENDED, regenerate deliberately:
 *   KSOR_UPDATE_SURFACE_GOLDEN=1 pnpm exec vitest run --config \
 *     vitest.integration.config.ts packages/ksor/src/served-surface.integration.test.ts
 * and read the diff in the commit — that diff is the review.
 */

const GOLDEN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "served-surface.golden.json",
);

/** Registration only closes over ctx; nothing here reaches Postgres. */
const STUB = {
  instance: { instructions: "This record is authoritative for the acceptance suite." },
  pool: null,
  ring: null,
} as unknown as ServiceContext;

describe("the served surface", () => {
  it("matches the committed capture, field for field", async () => {
    const tools = await listServedTools(buildServer(STUB, "0.0.0", buildDefaultGateway));
    // JSON round-trip first: in-process the reply is passed BY REFERENCE, so
    // optional keys are present with the value `undefined`. Over the wire they
    // are dropped. The golden is the WIRE shape, which is what agents see.
    const actual = JSON.parse(JSON.stringify(tools)) as unknown;
    const rendered = `${JSON.stringify(sortDeep(actual), null, 2)}\n`;

    if (process.env["KSOR_UPDATE_SURFACE_GOLDEN"] === "1") {
      writeFileSync(GOLDEN, rendered);
    }
    // Compare CONTENT, not the fixture's whitespace: `pnpm fmt` reformats JSON
    // in the tree, so a byte comparison against the file on disk fails on
    // formatting churn that changes nothing an agent receives. Both sides are
    // re-normalised through the same sort, so every real difference still shows.
    const golden = JSON.stringify(sortDeep(JSON.parse(readFileSync(GOLDEN, "utf8"))), null, 2);
    expect(JSON.stringify(sortDeep(actual), null, 2)).toBe(golden);
  });

  it("still carries the three things the golden exists to protect", async () => {
    const tools = await listServedTools(buildServer(STUB, "0.0.0", buildDefaultGateway));
    const wire = JSON.parse(JSON.stringify(tools)) as ReadonlyArray<{
      name: string;
      outputSchema?: { properties?: Record<string, unknown>; required?: string[] };
    }>;
    const read = wire.find((t) => t.name === "read");
    // The field the retyped schema got WRONG. Named explicitly so the failure
    // says which promise broke, not just that some bytes moved.
    expect(Object.keys(read?.outputSchema?.properties ?? {})).toContain("text");
    expect(read?.outputSchema?.required).toContain("snapshot_status");

    const search = wire.find((t) => t.name === "search");
    expect(Object.keys(search?.outputSchema?.properties ?? {})).toContain("snapshot");
    expect(search?.outputSchema?.required).toContain("abstained");
  });
});

/** Deterministic key order, so the golden compares on content not on emission order. */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
