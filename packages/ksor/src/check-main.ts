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
  checkChangeControl,
  checkRecord,
  checkScaffoldStructure,
  formatRefusal,
  loadRecord,
  loadScaffoldStructure,
  parseLock,
  sortRefusals,
  type LedgerBaseline,
} from "@panaversity/ksor-content/record";

import { gitFacts } from "./build/git.js";

// The script lives at <root>/.agents/skills/format-checker/check.mjs.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * The committed lock, as a ledger baseline. It is NOT enough on its own: the
 * lock travels in the same pull request as the ledger and is hand-editable, so
 * `rm .ksor/takedowns.yaml` plus `"ledger_entries": []` printed "ok" and exited
 * 0 on an emitted scaffold while `ksor build` — which reads git history —
 * refused the same tree naming both lost ids.
 *
 * A lock that does not PARSE is refused rather than dropped: returning `[]`
 * there was a second way to empty the baseline without touching the ledger.
 */
function lockBaseline(): LedgerBaseline[] {
  const lockPath = path.join(root, "build.lock.json");
  if (!existsSync(lockPath)) return [];
  const parsed = parseLock(readFileSync(lockPath, "utf8"));
  if (parsed.ok) {
    // Accepted for the reason `build/index.ts` records: a passing build wrote
    // it, so those entries were judged once and are not re-judged.
    return [{ source: "build.lock.json", entries: parsed.lock.ledger_entries, accepted: true }];
  }
  console.error(
    `ksor-lock-invalid: build.lock.json — ${parsed.why}\n` +
      "  why: the lock is one of the two baselines the takedown ledger is judged against; a lock nothing can read is a baseline that quietly holds nothing\n" +
      "  fix: run `ksor build` and commit the lock it writes; do not edit it by hand",
  );
  process.exit(1);
}

/**
 * Git history, as the OTHER baseline — the one that is not in the pull request.
 * Bare `git log` / `git show` through `gitFacts`, so the checker stays
 * install-free: it is plain Node either way.
 *
 * History it cannot read is SAID, not assumed away. This checker takes no
 * arguments, so it has no `--allow-unverifiable-ledger` to offer, and one that
 * refused every shallow CI checkout would simply be turned off. So this is a
 * note beside the verdict rather than a refusal — honest absence, not silent
 * weakness; `ksor build` still refuses the same state outright.
 */
function historyBaseline(): LedgerBaseline[] {
  const facts = gitFacts(root);
  if (!facts.repository) return [];
  if (facts.historicLedger === null) {
    console.error(
      "ksor-ledger-unverifiable: .ksor/takedowns.yaml — the ledger's history could not be read " +
        `(${facts.historyUnreadable === "shallow" ? "this is a shallow clone" : "git could not read the file's log"}), ` +
        "so this run checked the ledger against the committed lock alone — an artefact that travels in the same change.\n" +
        "  fix: `git fetch --unshallow` (or check out with fetch-depth: 0) and run the check again; `ksor build` refuses this state outright",
    );
    return [];
  }
  return [{ source: "git history", entries: facts.historicLedger }];
}

const loaded = loadRecord(root);
const record = checkRecord(loaded, {
  mode: "check",
  ledgerBaselines: [...historyBaseline(), ...lockBaseline()],
});
// KSP R23 — a stable body edited under an unmoved `generated.at` — refuses
// here as it does in `ksor build`, or this gate is green while the deploy is
// red. It reads git; where it cannot, the note is beside the verdict, the
// posture `historyBaseline` takes for the ledger.
const change = checkChangeControl(root, record.concepts, loaded.files);
if (change.notice !== null) console.error(change.notice);
const structure = checkScaffoldStructure(loadScaffoldStructure(root));
const problems = sortRefusals([...record.refusals, ...change.refusals, ...structure]);

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
