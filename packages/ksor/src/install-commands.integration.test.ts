/**
 * Every documented way to RUN the published CLI pins a version.
 *
 * A bare `npx @panaversity/ksor init` is spec `*`, which any cached version
 * satisfies — so npx runs whatever that machine already has without consulting
 * the registry. Found live on a Windows box following the README: it replayed
 * `0.0.0`, the name-reservation stub published 2026-08-17, whose whole
 * implementation prints "the name is reserved; this is not a release" and exits
 * 2. Thirty-nine releases later the reader met a placeholder, and nothing about
 * that output says the cause is a stale cache.
 *
 * `pnpm dlx` and `bunx` cache the same way (dlx reuses its cache for 24h by
 * default; bunx resolves from the install cache before the registry), so
 * decision 25's "meet the adopter's package manager" means all three forms
 * carry the pin or the trap is closed for one third of adopters.
 *
 * This is the drift test for that, in the tier AGENTS.md assigns repo-tree
 * scans. The alternative is noticing the next unpinned snippet by hand.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const read = (rel: string): string => readFileSync(path.join(repoRoot, rel), "utf8");

/** The runners that resolve a package spec at call time — each one caches. */
const RUNNERS = ["npx", "pnpm dlx", "bunx", "npm exec", "yarn dlx"];

/**
 * `npm install -g @panaversity/ksor` is NOT here and must not be: an install
 * resolves the `latest` dist-tag by definition, so pinning it would freeze
 * adopters on whatever version the README last named.
 */
const SPEC = new RegExp(`(${RUNNERS.join("|")})\\s+(@panaversity/ksor(@[^\\s]+)?)`, "g");

describe("documented run-the-CLI commands pin a version", () => {
  it.each([
    ["README.md", "the product pitch — the first command any adopter runs"],
    ["packages/ksor/README.md", "the README shipped inside the npm tarball"],
  ])("%s", (file, why) => {
    const found = [...read(file).matchAll(SPEC)];
    expect(found.length, `${why} — no runner invocation found at all`).toBeGreaterThan(0);
    const unpinned = found.filter((m) => !m[3]).map((m) => m[0]);
    expect(
      unpinned,
      `${why} — unpinned, so a stale runner cache decides the version: ${unpinned.join(" | ")}`,
    ).toEqual([]);
  });
});
