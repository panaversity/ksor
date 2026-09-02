/**
 * The test tiers are disjoint by filename, and the unit tier is the one that
 * has to say so — its `include` is the broad `*.test.ts`, so every other tier's
 * suffix must appear in its `exclude` or that tier's files run as unit tests.
 *
 * Found live (2026-09-02): `*.agent.test.ts` was added with its own config and
 * no exclude here, so `pnpm test:unit` collected the skill-eval harness and,
 * on a machine with a logged-in `claude`, ran a real agent for five minutes
 * inside the unit tier — twice, at about $2 a run, and it was the reason two
 * "unit + integration" gate runs blew the ten-minute cap. A new tier lands by
 * adding its suffix to the unit exclude, and this is where that is held.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name: string): string => readFileSync(path.join(root, name), "utf8");

/** Every `vitest.<tier>.config.ts` beside the unit config, and the suffix it owns. */
const tiers = readdirSync(root)
  .filter((f) => /^vitest\.[a-z]+\.config\.ts$/.test(f))
  .map((f) => ({ file: f, suffix: `.${f.split(".")[1] as string}.test.ts` }));

describe("the unit tier excludes every other tier's suffix", () => {
  const unit = read("vitest.config.ts");

  it("there are tiers to exclude", () => {
    expect(tiers.map((t) => t.suffix).sort()).toEqual([
      ".agent.test.ts",
      ".db.test.ts",
      ".integration.test.ts",
    ]);
  });

  it.each(tiers)("$file's suffix is excluded from vitest.config.ts", ({ file, suffix }) => {
    expect(
      unit.includes(`"**/*${suffix}"`),
      `vitest.config.ts includes "**/*.test.ts" and does not exclude "**/*${suffix}", so ` +
        `${file}'s suites run in the unit tier as well as their own`,
    ).toBe(true);
  });

  it.each(tiers)("$file includes only its own suffix", ({ file, suffix }) => {
    const m = /include:\s*\[([^\]]*)\]/.exec(read(file));
    expect(m, `${file}: no include`).not.toBeNull();
    for (const pattern of (m?.[1] ?? "").split(",").map((s) => s.trim().replaceAll('"', ""))) {
      if (pattern === "") continue;
      expect(pattern.endsWith(suffix), `${file} includes ${pattern}, which is not its tier`).toBe(
        true,
      );
    }
  });
});
