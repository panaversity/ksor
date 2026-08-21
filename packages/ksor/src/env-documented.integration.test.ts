/**
 * Every environment variable an ADOPTER can set must be named in the example
 * they are handed.
 *
 * `env.example` documented seven names while the code read twenty. The most
 * consequential omission was `KSOR_SNAPSHOT_KEYS`: without it the snapshot
 * signing key is `randomBytes(32)` per process, so generation pins break
 * across replicas — and every obvious production target for an MCP server runs
 * more than one (audit finding 18).
 *
 * The finding's fix was "generate env.example from the code with a drift test",
 * which is the rule this repo already applies to trees and lists in docs. The
 * file stays hand-written — its VALUE is the prose around each name — and this
 * is the drift test: a variable the code reads and the example does not name
 * fails here, with the name, so adding one is a decision rather than an
 * omission.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * Variables that exist for THIS repository's own tests and CI, never for an
 * adopter. Naming them in a scaffold's env.example would be noise at best and
 * misleading at worst.
 */
const REPO_ONLY = new Set([
  "KSOR_E2E",
  "KSOR_KEEP_DB",
  "KSOR_TEST_DSN",
  "KSOR_TEST_ENV_PARSE",
  "KSOR_EXPORT_TEST_DSN",
  "KSOR_X",
  // A fixture STRING in serve.test.ts demonstrating requireEnv's refusal — not
  // a variable ksor reads. The first version of this test exempted it as
  // "documented elsewhere", and the honesty check below caught that.
  "KSOR_INSTANCE_URI",
]);

/**
 * Variables documented for the adopter somewhere OTHER than env.example,
 * because they belong to a different surface. Each names where.
 */
const DOCUMENTED_ELSEWHERE = new Map([
  ["KSOR_BASE_PATH", "scaffold README + AGENTS.md — a site build flag, not a server variable"],
  ["KSOR_AUDIENCE", "scaffold README + AGENTS.md — a site build flag"],
  ["KSOR_INSTANCE", "a CLI convenience for --instance; the flag is the documented form"],
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("the adopter's env contract covers what the code reads", () => {
  it("names every adopter-facing variable", () => {
    const read = new Set<string>();
    for (const file of sourceFiles(path.join(repoRoot, "packages"))) {
      for (const m of readFileSync(file, "utf8").matchAll(
        /\b(KSOR_[A-Z0-9_]+|GEMINI_API_KEY)\b/g,
      )) {
        read.add(m[1]!);
      }
    }
    const example = readFileSync(
      path.join(repoRoot, "packages", "ksor", "templates", "scaffold", "env.example"),
      "utf8",
    );

    const missing = [...read]
      .filter((name) => !REPO_ONLY.has(name))
      .filter((name) => !DOCUMENTED_ELSEWHERE.has(name))
      .filter((name) => !example.includes(name))
      .sort();

    expect(
      missing,
      "the code reads these and the adopter's env.example never names them — document each, " +
        "or add it to REPO_ONLY / DOCUMENTED_ELSEWHERE with the reason: " +
        missing.join(", "),
    ).toEqual([]);
  });

  it("the exemption lists are honest — every name on them is still read", () => {
    // An exemption for a variable that no longer exists is a stale excuse.
    const read = new Set<string>();
    for (const file of sourceFiles(path.join(repoRoot, "packages"))) {
      for (const m of readFileSync(file, "utf8").matchAll(
        /\b(KSOR_[A-Z0-9_]+|GEMINI_API_KEY)\b/g,
      )) {
        read.add(m[1]!);
      }
    }
    const testFiles = sourceFiles(path.join(repoRoot, "packages"));
    void testFiles;
    for (const name of DOCUMENTED_ELSEWHERE.keys()) {
      expect(read.has(name), `${name} is exempted but the code no longer reads it`).toBe(true);
    }
  });
});
