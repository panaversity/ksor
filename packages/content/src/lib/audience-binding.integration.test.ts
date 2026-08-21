import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Every serving path in service.ts must bind the caller's audience scope.
 *
 * `runRead` binds the whole-record scope by default, which keeps library and
 * test callers working — and means a SERVING path that forgets to narrow would
 * silently serve every tier. The SQL backstop cannot catch that, because the
 * default IS bound. So the binding is asserted here, on the source, where the
 * omission would happen.
 */
const SERVICE = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "service.ts"),
  "utf8",
);

describe("every serving read narrows to the caller's audience", () => {
  it("binds audienceScope on each runRead in the serving paths", () => {
    // Each `runRead(` in service.ts is a path that returns record content.
    const calls = SERVICE.split("runRead(").length - 1;
    const scoped = SERVICE.split("audienceScope(ctx)").length - 1;
    expect(calls, "service.ts still has serving reads").toBeGreaterThan(0);
    expect(
      scoped,
      `${calls} runRead call(s) in service.ts but only ${scoped} bind audienceScope(ctx) — ` +
        "an unscoped serving read returns the whole record",
    ).toBe(calls);
  });

  it("keeps the sentinel out of service.ts — the door narrows, it never widens", () => {
    expect(
      SERVICE.includes("WHOLE_RECORD_SCOPE"),
      "the serving door must not hand itself the whole record",
    ).toBe(false);
  });
});
