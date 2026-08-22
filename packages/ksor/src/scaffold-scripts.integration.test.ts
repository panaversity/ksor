/**
 * A scaffold script must not be named after a pnpm COMMAND.
 *
 * `pnpm setup` is pnpm's own installer ("Sets up pnpm"), and it wins: the
 * scaffold shipped a `setup` script, three documents told the adopter to run
 * it, and `pnpm setup` printed "No changes to the environment were made",
 * exited 0, and applied no DDL at all. The next command in the runbook then
 * failed with `relation "corpora" does not exist`, blaming the database for a
 * step that never ran — and on some shells it also edits the user's rc file
 * (round-7 review of #43, reproduced live).
 *
 * pnpm falls back to a script only for the npm-compatible shortcuts (`test`,
 * `start`, `run x`); every other command name is taken. So the rule is the
 * general one, not a patch for `setup`: a script whose name is a pnpm command
 * is unreachable, and the adopter finds out by having the runbook silently do
 * nothing.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(path.join(here, "..", "templates", "scaffold", "package.json"), "utf8"),
) as { scripts: Record<string, string> };

/**
 * pnpm command names that SHADOW a script of the same name (pnpm 11 --help,
 * checked 2026-08-21). `test` and `start` are deliberately absent: those two
 * are npm-compatible shortcuts that DO run the script.
 */
const PNPM_COMMANDS = new Set([
  "add",
  "approve-builds",
  "audit",
  "bin",
  "config",
  "dedupe",
  "deploy",
  "dlx",
  "doctor",
  "env",
  "exec",
  "fetch",
  "import",
  "init",
  "install",
  "licenses",
  "link",
  "list",
  "ls",
  "outdated",
  "pack",
  "patch",
  "prune",
  "publish",
  "rebuild",
  "remove",
  "root",
  "run",
  "server",
  "setup",
  "store",
  "unlink",
  "update",
  "why",
]);

/**
 * Every `pnpm <word>` the scaffold's own documents tell an adopter to run must
 * resolve to something: one of its scripts, or a real pnpm command.
 *
 * The `setup` defect had two halves, and these two describes cover one each:
 *
 *   the manifest half   a script NAMED after a pnpm command is unreachable —
 *                       "no script is named after a pnpm command", below.
 *   the runbook half    three documents confidently instructed the adopter to
 *                       run a step, and nothing checked the prose against the
 *                       manifest. A renamed or deleted script leaves the
 *                       instructions behind exactly the same way — this
 *                       describe, verified by renaming `provision` and
 *                       watching both runbooks fail.
 *
 * (round-7 review of #43.)
 */
const RUNBOOKS = ["README.md", "AGENTS.md"] as const;

describe("the scaffold's runbooks name commands that exist", () => {
  it.each(RUNBOOKS)("%s", (file) => {
    const text = readFileSync(path.join(here, "..", "templates", "scaffold", file), "utf8");
    // CODE contexts only — inline `pnpm x` and lines inside a fenced block.
    // Matching bare prose picks up ordinary sentences that happen to follow the
    // word "pnpm", which says nothing about what the adopter is told to RUN.
    const fenced = [...text.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]).join("\n");
    const inline = [...text.matchAll(/`pnpm (?:--\S+ )*([a-z][\w:-]*)[^`]*`/g)].map((m) => m[1]!);
    const inBlocks = [...fenced.matchAll(/^\s*pnpm (?:--\S+ )*([a-z][\w:-]*)/gm)].map((m) => m[1]!);
    const named = new Set([...inline, ...inBlocks]);
    const known = new Set([...Object.keys(manifest.scripts), ...PNPM_COMMANDS, "test", "start"]);
    const unknown = [...named].filter((name) => !known.has(name));
    expect(
      unknown,
      `${file} tells the adopter to run commands that are neither a scaffold script nor a pnpm command: ${unknown.join(", ")}`,
    ).toEqual([]);
  });
});

/**
 * No adopter-facing document may claim that `pnpm serve` publishes.
 *
 * `serve` was `pnpm schema && pnpm grant && pnpm ingest && ksor serve` and is
 * now `ksor serve` alone. The prose describing the old chain has been corrected
 * FOUR separate times — the README's deploy section, the README's file table,
 * AGENTS.md's runbook, and instance.md's own comment — each time found by a
 * person reading it, not by a test. The earlier guard cannot catch it: it
 * checks that a named command EXISTS, and `pnpm serve` does exist. What is
 * wrong is the claim attached to it.
 *
 * So the claim itself is the thing asserted. Publishing is `pnpm refresh`;
 * serving is `pnpm serve`; a document that fuses them is wrong however it
 * phrases it.
 */
describe("no document claims that serving publishes", () => {
  const ADOPTER_FACING = [
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "instance.md",
    "env.example",
  ] as const;

  /** Shapes that assert the retired chain, in any of its phrasings. */
  const FUSED: readonly RegExp[] = [
    /schema\s*(?:→|->|&&)\s*grant/i,
    /pnpm serve[^\r\n]{0,80}\bingest\b/i,
    /`?pnpm serve`? is the only command/i,
  ];

  it.each(ADOPTER_FACING)("%s", (file) => {
    // Read it OUTRIGHT. This skipped a missing file for years, and one of the
    // five names was `.env.example` while the scaffold emits `env.example` —
    // so the row for the file that actually carries the serve variables never
    // ran, in the guard whose claim had already been wrong four times. A name
    // that stops matching must fail here, not quietly stop asserting.
    const full = path.join(here, "..", "templates", "scaffold", file);
    const text = readFileSync(full, "utf8");
    for (const shape of FUSED) {
      const hit = shape.exec(text);
      expect(
        hit,
        `${file} still describes serving as publishing: ${JSON.stringify(hit?.[0] ?? "")}. ` +
          "Publishing is `pnpm refresh`; `pnpm serve` is `ksor serve` and chains nothing.",
      ).toBeNull();
    }
  });

  it("…and the scripts themselves keep them separate", () => {
    expect(manifest.scripts["serve"], "serving is one command").toBe("ksor serve");
    expect(manifest.scripts["refresh"], "publishing is its own act").toContain("ingest");
  });
});

describe("the scaffold's npm scripts are all reachable", () => {
  it("no script is named after a pnpm command", () => {
    const shadowed = Object.keys(manifest.scripts).filter((name) => PNPM_COMMANDS.has(name));
    expect(
      shadowed,
      `pnpm would run its OWN command instead of these: ${shadowed.join(", ")} — rename them`,
    ).toEqual([]);
  });

  it("still ships the runbook's steps under SOME name", () => {
    // The rename is only safe if the work still exists; this fails if a step
    // is dropped rather than renamed.
    const bodies = Object.values(manifest.scripts).join(" ; ");
    for (const required of ["ksor schema", "ksor grant", "ksor ingest", "ksor serve"]) {
      expect(bodies, `${required} must be reachable through a script`).toContain(required);
    }
  });
});
