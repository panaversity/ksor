/**
 * Every `ksor takedown` a refusal prints must be a command that RUNS.
 *
 * Decision 21 makes `--actor` mandatory on the three modes that write the
 * ledger — a governance act names its actor and the tool never guesses one —
 * and the refusal is raised from the ARGUMENTS, before a DSN is resolved. So a
 * remedy that omits the flag does not merely read oddly: pasted verbatim it
 * exits 1 on `ksor-takedown-unattributed`, and the author is now debugging the
 * fix line instead of the defect. Found 2026-08-25 in three of the ledger's
 * own remedies, while `governance-gate.ts` two files away printed the right
 * form — inconsistency, not disagreement, which is why one scan settles it
 * rather than three edits.
 *
 * Scanned over SOURCE rather than over the refusals a fixture happens to
 * reach, because the whole class is what matters and half these paths need a
 * database, a tree and a ledger to reach at all. The scaffold's byte-identical
 * copy is scanned with it: it ships into every adopter's repo, where the site
 * prints the same lines.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const TREES = [
  here,
  path.resolve(here, "..", "..", "ksor", "templates", "scaffold", "system", "site", "record"),
];

/**
 * `ksor takedown` and the arguments a reader would paste with it. An argument
 * is a flag, a placeholder, an interpolation, a path or an ALL-CAPS stand-in —
 * never a bare English word, so the prose that follows "`ksor takedown --list`
 * shows what is recorded" stops the match instead of joining it.
 */
const COMMAND =
  /ksor takedown(?: +(?:--[a-z-]+|<[^>\n`]+>|\$\{[^}\n]+\}|[A-Za-z0-9_.${}-]*\/[A-Za-z0-9_./<>${}-]*|[A-Z][A-Z_]*|subtree|node))*/g;

/** The three modes that WRITE the ledger (`writesLedger`); the rest need no actor. */
const WRITES = /--revoke|--removed|--reason|--scope/;

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) sources(file, out);
    else if (file.endsWith(".ts") && !file.includes(".test.")) out.push(file);
  }
  return out;
}

describe("a printed `ksor takedown` remedy runs as printed", () => {
  it("names --actor wherever the command it prints would write the ledger", () => {
    const unattributed: string[] = [];
    for (const tree of TREES) {
      for (const file of sources(tree)) {
        for (const command of readFileSync(file, "utf8").match(COMMAND) ?? []) {
          // A bare `ksor takedown` is prose about the verb, not a command.
          if (!command.includes("--") && !command.includes("/")) continue;
          if (!WRITES.test(command)) continue;
          if (command.includes("--actor")) continue;
          unattributed.push(`${path.relative(here, file)}: ${command}`);
        }
      }
    }
    expect(
      unattributed,
      "these print a command that exits 1 on `ksor-takedown-unattributed` when pasted — " +
        "decision 21 requires --actor on every mode that writes the ledger",
    ).toEqual([]);
  });

  /** The scan is only worth anything if it can see a command at all. */
  it("finds the commands it is scanning for", () => {
    const found = sources(here).flatMap((f) => readFileSync(f, "utf8").match(COMMAND) ?? []);
    expect(found.filter((c) => WRITES.test(c)).length).toBeGreaterThanOrEqual(4);
    expect(found).toContain("ksor takedown --list");
  });
});
