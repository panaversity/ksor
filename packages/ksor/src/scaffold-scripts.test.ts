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
