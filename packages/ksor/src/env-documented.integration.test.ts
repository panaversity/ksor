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

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * Variables documented for the adopter somewhere OTHER than env.example,
 * because they belong to a different surface. Each names where.
 */
const DOCUMENTED_ELSEWHERE = new Map([
  ["KSOR_BASE_PATH", "scaffold README + AGENTS.md — a site build flag, not a server variable"],
  ["KSOR_AUDIENCE", "scaffold README + AGENTS.md — a site build flag"],
  ["KSOR_INSTANCE", "a CLI convenience for --instance; the flag is the documented form"],
  // A repo-only test gate. No shipped code reads it; `e2e-gate.ts` only NAMES
  // it, in the note a skipped browser suite prints, and that file is test
  // support that happens not to end in `.test.ts`.
  ["KSOR_E2E", "this repository's browser-suite gate — read by tests, named by e2e-gate.ts"],
  // RETIRED, replaced by KSOR_AUTH. The code still READS them, solely to tell an
  // operator following an old runbook what replaced them — documenting them in
  // env.example would present them as current, which is the opposite of the
  // point. They leave this list when the migration error does.
  ["KSOR_AUTH_DISABLED", "retired — buildAuth reads it only to name its replacement, KSOR_AUTH"],
  [
    "KSOR_ALLOW_PUBLIC_UNAUTHENTICATED",
    "retired — buildAuth reads it only to name its replacement, KSOR_AUTH",
  ],
]);

/**
 * Every shipped `.ts` under a directory — the SOURCE set, which is narrower than
 * "every file" in two ways that both matter here.
 *
 * Test files are excluded because a variable only a test reads is not something
 * an adopter can set; that is also why no exemption list for repo-only test
 * variables is needed — the scan never sees them.
 *
 * Transient trees are excluded because they are not the checkout: another suite
 * roots a fake npm install inside `packages/ksor` (it needs Node's upward module
 * resolution), holding a COPY of templates/scaffold. Descending into it scanned
 * those files a second time and made this scan's input depend on whether that
 * suite happened to be mid-run.
 *
 * The type comes from the readdir snapshot rather than a follow-up `statSync`,
 * so an entry deleted between the two calls can no longer crash the walk — it
 * did, on an `llms.txt` being cleaned up concurrently (CI run 32526491721).
 */
const TRANSIENT = /^ksor-fakeinstall-/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    if (TRANSIENT.test(name)) continue;
    const full = path.join(dir, name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** Every adopter-settable variable name the scanned source mentions. */
function variablesRead(): Set<string> {
  const read = new Set<string>();
  for (const file of sourceFiles(path.join(repoRoot, "packages"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/\b(KSOR_[A-Z0-9_]+|GEMINI_API_KEY)\b/g)) {
      read.add(m[1]!);
    }
  }
  return read;
}

describe("the adopter's env contract covers what the code reads", () => {
  it("scans the checkout's source, never another suite's transient install", () => {
    // init.integration.test.ts roots a fake npm install INSIDE packages/ksor (it
    // needs Node's upward module resolution to reach the real node_modules), and
    // fills it with a COPY of templates/scaffold. This walk used to descend into
    // it, which cost two ways: the copied .ts files were scanned twice, and a
    // `statSync` on an entry the other suite was concurrently deleting crashed
    // the run outright (CI 32526491721, ENOENT on a vanishing llms.txt).
    const transient = mkdtempSync(path.join(repoRoot, "packages", "ksor", "ksor-fakeinstall-"));
    try {
      const nested = path.join(transient, "templates", "scaffold", "system");
      mkdirSync(nested, { recursive: true });
      writeFileSync(path.join(nested, "copy.ts"), "process.env.KSOR_ONLY_IN_A_TRANSIENT_COPY;");

      const scanned = sourceFiles(path.join(repoRoot, "packages"));
      expect(
        scanned.filter((f) => f.includes("ksor-fakeinstall-")),
        "the env scan descended into a transient install tree",
      ).toEqual([]);
    } finally {
      rmSync(transient, { recursive: true, force: true });
    }
  });

  it("names every adopter-facing variable", () => {
    const read = variablesRead();
    const example = readFileSync(
      path.join(repoRoot, "packages", "ksor", "templates", "scaffold", "env.example"),
      "utf8",
    );

    const missing = [...read]
      .filter((name) => !DOCUMENTED_ELSEWHERE.has(name))
      .filter((name) => !example.includes(name))
      .sort();

    expect(
      missing,
      "the code reads these and the adopter's env.example never names them — document each, " +
        "or add it to DOCUMENTED_ELSEWHERE with the reason: " +
        missing.join(", "),
    ).toEqual([]);
  });

  /**
   * An exemption that NAMES a file is a claim about that file. `KSOR_DRAFTS`
   * was exempted as "scaffold README + AGENTS.md" and appeared in neither, so
   * the one variable that decides whether unapproved drafts reach the open web
   * was documented nowhere an adopter reads — and the guard whose whole purpose
   * is to make that a decision was silenced by the claim itself.
   */
  it("an exemption that names a file is true of that file", () => {
    const scaffold = path.join(repoRoot, "packages", "ksor", "templates", "scaffold");
    const wrong: string[] = [];
    for (const [name, reason] of DOCUMENTED_ELSEWHERE) {
      for (const [needle, file] of [
        ["README", "README.md"],
        ["AGENTS.md", "AGENTS.md"],
      ] as const) {
        if (!reason.includes(needle)) continue;
        if (!readFileSync(path.join(scaffold, file), "utf8").includes(name)) {
          wrong.push(`${name} is not in templates/scaffold/${file}`);
        }
      }
    }
    expect(wrong, "an exemption names a place the variable is not documented").toEqual([]);
  });

  it("the exemption lists are honest — every name on them is still read", () => {
    // An exemption for a variable that no longer exists is a stale excuse.
    const read = variablesRead();
    const stale = [...DOCUMENTED_ELSEWHERE.keys()].filter((name) => !read.has(name)).sort();
    expect(
      stale,
      "these names are exempted but no scanned source reads them — a stale excuse: " +
        stale.join(", "),
    ).toEqual([]);
  });
});
