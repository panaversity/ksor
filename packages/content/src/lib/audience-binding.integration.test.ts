import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Every serving path in service.ts must bind the caller's audience scope — a
 * SHAPE check, deliberately, and not the guarantee itself.
 *
 * `runRead` binds the whole-record scope by default, which keeps library and
 * test callers working — and means a SERVING path that forgets to narrow would
 * silently serve every tier. The SQL backstop cannot catch that, because the
 * default IS bound. So the presence of a binding on every call is asserted here,
 * on the source, where the omission would happen — and this file runs without a
 * database, so a newly added unscoped read fails fast and locally.
 *
 * What it is NOT: the behavioural guarantee. That lives in
 * `governance-chain.db.test.ts`, which ingests real markdown, serves it through
 * these same functions at two tiers, and asserts what each tier can and cannot
 * see. Replacing `audienceScope`'s body with the whole-record sentinel — the
 * exact fail-open decision 15 exists to end — turns five of its tests red
 * (re-verified 2026-08-21). Read that file for the promise; read this one for
 * the shape.
 *
 * The distinction is the point. Asserting a payload by grepping source is how a
 * defect once came to be PINNED by a test (the 503 that named the database
 * host, refusal-body.test.ts). Source assertions may pin structure; behaviour
 * needs the real thing.
 */
const SERVICE = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "service.ts"),
  "utf8",
);

describe("every serving read narrows to the caller's audience", () => {
  it("binds audienceScope on EACH runRead — per call, not by counting", () => {
    // Counting `runRead(` against `audienceScope(ctx)` and comparing totals was
    // the old check, and totals cannot tell pairing from arithmetic: two
    // bindings on one call and none on another satisfies it exactly. Each call
    // is now inspected on its own.
    const calls = [...SERVICE.matchAll(/runRead\(/g)].map((m) => m.index ?? 0);
    expect(calls.length, "service.ts still has serving reads").toBeGreaterThan(0);

    // Each call's window ends where the NEXT one begins — never a fixed span. A
    // generous fixed window is exactly the bug this test is replacing: two of
    // these calls sit thirteen lines apart, so a 900-character window let the
    // second one's binding vouch for the first one's absence.
    const unscoped = calls
      .map((at, i) => ({
        at,
        line: SERVICE.slice(0, at).split("\n").length,
        window: SERVICE.slice(at, calls[i + 1] ?? SERVICE.length),
      }))
      .filter(({ window }) => !window.includes("audienceScope(ctx)"));

    expect(
      unscoped.map((u) => `service.ts:${u.line}`),
      "an unscoped serving read returns the WHOLE record, whatever tier the caller is",
    ).toEqual([]);
  });

  it("keeps the sentinel out of service.ts — the door narrows, it never widens", () => {
    expect(
      SERVICE.includes("WHOLE_RECORD_SCOPE"),
      "the serving door must not hand itself the whole record",
    ).toBe(false);
  });
});
