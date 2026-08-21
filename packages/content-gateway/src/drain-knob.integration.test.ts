/**
 * `KSOR_DRAIN_TIMEOUT_MS` must be read when the server starts, not when the
 * module is imported.
 *
 * `cli.ts` imports the gateway statically, so anything evaluated at module
 * scope runs BEFORE `main()` calls `loadDotEnv()`. A `const` there is frozen at
 * its default and an adopter's `.env` silently changes nothing — the same ESM
 * ordering that shipped a different setting inert in 0.0.4, found again here by
 * two independent reviewers (round-4 review of #43).
 *
 * This is a SOURCE assertion because that is where the defect lives: the value
 * is correct either way once the process is running with real container env
 * vars, and only the `.env` path breaks. A behavioural test would have to boot
 * a server per case and still would not name the cause.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HTTP = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "http.ts"),
  "utf8",
);

describe("env knobs are read after .env is loaded", () => {
  it("no top-level `const NAME = envInt(...)` in http.ts", () => {
    // Module scope = column 0. A knob read inside a function is indented.
    const topLevel = HTTP.split("\n").filter((line) =>
      /^const\s+\w+\s*=\s*env(Int|Float)\(/.test(line),
    );
    expect(
      topLevel,
      "these are evaluated at import time, before loadDotEnv() — read them inside runHttp instead",
    ).toEqual([]);
  });

  it("KSOR_DRAIN_TIMEOUT_MS is read from a function, and the drain uses that value", () => {
    expect(HTTP).toMatch(/const drainTimeoutMs = \(\): number =>/);
    expect(
      HTTP.includes("const drainDeadlineMs = drainTimeoutMs();"),
      "the shutdown path must read the knob at boot, not import",
    ).toBe(true);
    expect(HTTP, "and nothing may still reference the frozen constant").not.toContain(
      "DRAIN_TIMEOUT_MS)",
    );
  });
});
