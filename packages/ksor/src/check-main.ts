/**
 * The emitted checker — the scaffold's `check` script. Built by tsdown
 * into `.agents/skills/format-checker/check.mjs` (and its `.claude` twin)
 * with the record module and its parser bundled in, so an adopter's CI runs
 * it with bare `node` and no install (record spec §6). One rule set: this
 * file is a thin caller of `checkRecord` and `checkScaffoldStructure`, and
 * prints in the line format the hand-written checker always used.
 *
 * Read-only: it refuses a stale index (`ksor-index-stale`) and never writes
 * one — `ksor build` is the verb that regenerates.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkRecord,
  checkScaffoldStructure,
  formatRefusal,
  loadRecord,
  loadScaffoldStructure,
  parseLock,
  sortRefusals,
  type LedgerBaseline,
} from "@panaversity/ksor-content/record";

// The script lives at <root>/.agents/skills/format-checker/check.mjs.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The committed lock's id set is the one ledger baseline a dependency-free check can read. */
function lockBaseline(): LedgerBaseline[] {
  const lockPath = path.join(root, "build.lock.json");
  if (!existsSync(lockPath)) return [];
  const parsed = parseLock(readFileSync(lockPath, "utf8"));
  return parsed.ok ? [{ source: "build.lock.json", ids: parsed.lock.ledger_ids }] : [];
}

const record = checkRecord(loadRecord(root), { mode: "check", ledgerBaselines: lockBaseline() });
const structure = checkScaffoldStructure(loadScaffoldStructure(root));
const problems = sortRefusals([...record.refusals, ...structure]);

if (problems.length > 0) {
  console.error(`format-checker: ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ${formatRefusal(p)}\n`);
  // exitCode, never exit(): exit() drops queued pipe writes, truncating the
  // report mid-word for any reader slower than a file (found 2026-08-18 — 800
  // problems arrived as 309 through a pipe).
  process.exitCode = 1;
} else {
  console.log("format-checker: ok — the record is well-formed");
}
