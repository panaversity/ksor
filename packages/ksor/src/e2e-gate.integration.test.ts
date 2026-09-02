/**
 * The `KSOR_E2E` gate has THREE hand-kept lists of the same set, and the tree
 * is the only one that is real.
 *
 * `pnpm test:e2e` names its browser suites by hand; `ci.yml` names the same
 * three again, one `run:` step each; and the suites themselves carry the gate.
 * Nothing held them equal, so a fourth gated suite would have run in neither
 * list — silently, because vitest treats a filter as a filter: a name matching
 * nothing is dropped as long as another name matches something, which is how
 * `init-windows` came to run three of the four files it spelled out and stay
 * green (`ci-workflow.integration.test.ts`). The command a reader is TOLD to
 * run would then not run the suite that told them.
 *
 * Four assertions, all of them about that one failure: the tree is the source
 * of the set, both hand-kept lists must cover it, and a skip note that names a
 * file must name its OWN file — an exemption that names a file is a claim about
 * that file, the rule `env-documented` learned the hard way when `KSOR_DRAFTS`
 * was exempted to two documents it appeared in neither of.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { e2eSkipNote } from "./e2e-gate.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const here = fileURLToPath(new URL(".", import.meta.url));

/** The gate as the suites actually write it — the one list nobody maintains. */
const GATE = 'process.env.KSOR_E2E === "1"';

/**
 * This file, which QUOTES the gate above and is not gated by it.
 *
 * Excluded by its own basename rather than by a pattern, because a pattern is
 * the thing this suite exists to distrust: it would exclude a future suite that
 * happened to match, which is the silent-drop failure again wearing this file's
 * clothes.
 */
const SELF = path.basename(fileURLToPath(import.meta.url));

/** Every suite in this directory that gates itself on `KSOR_E2E`, repo-relative. */
const gated: readonly string[] = readdirSync(here)
  .filter((name) => name.endsWith(".integration.test.ts") && name !== SELF)
  .filter((name) => readFileSync(path.join(here, name), "utf8").includes(GATE))
  .map((name) => `packages/ksor/src/${name}`)
  .sort();

describe("every KSOR_E2E-gated suite is reachable and says how to run itself", () => {
  it("the tree has gated suites at all — an empty set would pass everything below", () => {
    // The whole file is vacuous if this scan finds nothing, which is exactly how
    // a guard over a hand-kept list rots into a guard over the empty set.
    expect(gated.length, `no suite in packages/ksor/src contains ${GATE}`).toBeGreaterThan(1);
  });

  it("pnpm test:e2e names every one of them", () => {
    const manifest = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    const script = manifest.scripts["test:e2e"] ?? "";
    const missing = gated.filter((rel) => !script.includes(rel));
    expect(
      missing,
      "these suites gate on KSOR_E2E and `pnpm test:e2e` does not name them, so the command " +
        "the skip note tells a reader to run would not run them: " +
        missing.join(", "),
    ).toEqual([]);
  });

  it("the CI browser job runs every one of them", () => {
    // CI spells the same set out a second time, one `run:` per suite, rather
    // than calling `pnpm test:e2e` — so it is a second list to keep, and this
    // is what keeps it.
    const workflow = readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    const missing = gated.filter((rel) => !workflow.includes(rel));
    expect(
      missing,
      "these suites gate on KSOR_E2E and .github/workflows/ci.yml never names them, so they " +
        "run nowhere: " +
        missing.join(", "),
    ).toEqual([]);
  });

  it("each suite's skip note names its own path", () => {
    // `e2eSkipNote(file)` prints a command; a file argument copied from a
    // neighbour prints a command that runs the wrong suite, and a skipped test
    // is the one place nobody looks for a wrong answer.
    const wrong: string[] = [];
    for (const rel of gated) {
      const source = readFileSync(path.join(repoRoot, rel), "utf8");
      const call = /e2eSkipNote\(\s*"([^"]*)"\s*\)/.exec(source);
      if (call === null) {
        wrong.push(`${rel} gates on KSOR_E2E and calls no e2eSkipNote(…)`);
        continue;
      }
      if (call[1] !== rel) wrong.push(`${rel} passes e2eSkipNote("${call[1]}")`);
    }
    expect(
      wrong,
      "a skipped suite would print a command that does not run it: " + wrong.join(", "),
    ).toEqual([]);
  });

  it("the note it prints runs the suite it names", () => {
    const rel = gated[0] ?? "";
    const note = e2eSkipNote(rel);
    expect(note).toContain("playwright install chromium");
    expect(note).toContain(
      `KSOR_E2E=1 pnpm exec vitest run --config vitest.integration.config.ts ${rel}`,
    );
  });
});
