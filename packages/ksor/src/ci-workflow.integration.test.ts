/**
 * The one workflow file nothing else reads.
 *
 * `init-windows` runs a hand-written list of test files, and vitest treats
 * those arguments as FILTERS: a filter matching nothing is dropped in silence
 * as long as another filter matches something. So the job named four files,
 * ran three, and stayed green after one of them was deleted — while the two
 * drift suites the profile added were never named at all and therefore never
 * ran on the runner that exists to catch line-ending drift.
 *
 * Two assertions, both about the same failure: a name in the workflow that
 * points at nothing, and a suite in the tree that the workflow points at
 * nowhere.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const workflow = readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
const here = fileURLToPath(new URL(".", import.meta.url));

/** Every `packages/…/*.test.ts` path the workflow spells out. */
const named: readonly string[] = [
  ...new Set(workflow.match(/packages\/[\w./[\]-]+\.test\.ts/g) ?? []),
].sort();

describe("the CI workflow names files that exist", () => {
  it("every test file the workflow spells out is in the tree", () => {
    expect(named.length).toBeGreaterThan(0);
    const missing = named.filter((rel) => !existsSync(path.join(repoRoot, rel)));
    expect(
      missing,
      "the workflow names these and the tree does not have them — vitest drops such a filter " +
        "in silence, so the job runs fewer tests than it claims: " +
        missing.join(", "),
    ).toEqual([]);
  });

  it("the Windows job's filter still covers every drift suite", () => {
    // The filter is a substring of the path, which is how it covers a drift
    // suite added later without anyone remembering to name it.
    const FILTER = "drift.integration.test.ts";
    expect(workflow).toContain(
      `pnpm exec vitest run --config vitest.integration.config.ts ${FILTER}`,
    );
    const drift = readdirSync(here)
      .filter((name) => name.endsWith("-drift.integration.test.ts"))
      .sort();
    expect(drift.length).toBeGreaterThan(1);
    const uncovered = drift.filter((name) => !`packages/ksor/src/${name}`.includes(FILTER));
    expect(
      uncovered,
      `these drift suites would not run on Windows: ${uncovered.join(", ")}`,
    ).toEqual([]);
  });
});
