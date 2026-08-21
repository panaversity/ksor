/**
 * Every verb the binary has must be named where a reader looks for verbs.
 *
 * `takedown` and `grant` existed, worked, and appeared in `ksor --help` while
 * the bundled docs and `docs/status.md` — the file AGENTS.md calls "the only
 * authority on what is implemented" — listed neither. The scaffold's own
 * `pnpm build` shells out to `ksor takedown --export`, so an agent operating a
 * scaffolded project met a verb its documentation did not contain (round-6
 * review of #43).
 *
 * Product principle 1 is that docs are priority #1 because agents read them
 * before they ever run the product; AGENTS.md adds that any list rendered into
 * a doc is generated from source with a drift test, or not rendered at all.
 * This is that drift test — the list stays hand-written, and this fails when it
 * stops matching the binary.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { verbs } from "./index.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const read = (rel: string): string => readFileSync(path.join(repoRoot, rel), "utf8");

/**
 * `init` names the product's entry point and is described at length rather
 * than listed; everything else is a verb a reader has to be able to find.
 */
const EXEMPT = new Set(["init"]);

describe("the verb vocabulary is documented where it is claimed", () => {
  const expected = verbs.filter((v) => !EXEMPT.has(v));

  it("has verbs to check", () => {
    expect(expected.length).toBeGreaterThan(5);
  });

  it.each([
    ["docs/status.md", "the only authority on what is implemented"],
    ["packages/ksor/docs/index.md", "the docs shipped inside the npm tarball"],
  ])("%s names every verb", (file, why) => {
    const text = read(file);
    // `ksor <verb>` only. The looser form also accepted a bare `` `serve` ``
    // mentioned in any context, which is not the same as documenting the verb
    // (round-8 review of #43).
    const missing = expected.filter((verb) => !new RegExp(`\`ksor ${verb}\``).test(text));
    expect(missing, `${why} — missing: ${missing.join(", ")}`).toEqual([]);
  });
});
