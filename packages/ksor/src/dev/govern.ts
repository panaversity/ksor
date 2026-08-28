/**
 * `ksor dev` governance: run the SAME record checker `ksor build` runs on every
 * save, in `check` mode (never writes), and report refusals. The dev server
 * keeps the last good state when a save breaks a rule — the author sees the page
 * they had, plus the refusal on stderr.
 */
import {
  checkRecord,
  formatRefusal,
  loadRecord,
  parseLock,
  resolveInstanceDir,
  type Refusal,
} from "@panaversity/ksor-content/record";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface GovernResult {
  readonly refusals: readonly Refusal[];
  /** A human line for the dev log: clean, or the count and first slug. */
  readonly line: string;
}

/**
 * The ledger baseline for dev mode. We reuse `build.lock.json` when it exists so
 * the departed-authority escape hatch (checkLedgerActors against an accepted
 * lock) works during development exactly as it does in build. No lock ⇒ no
 * baseline, which is the strict default the checker requires by contract.
 */
function ledgerBaselines(
  root: string,
): { source: string; entries: readonly { id: string; digest: string }[]; accepted?: boolean }[] {
  const lockPath = path.join(root, "build.lock.json");
  if (!existsSync(lockPath)) return [];
  const committed = parseLock(readFileSync(lockPath, "utf8"));
  if (!committed.ok) return [];
  return [{ source: "build.lock.json", entries: committed.lock.ledger_entries, accepted: true }];
}

/** Run the record checker over the live tree at `root`. */
export function govern(root: string): GovernResult {
  const record = loadRecord(root);
  const result = checkRecord(record, { mode: "check", ledgerBaselines: ledgerBaselines(root) });
  if (result.refusals.length === 0) {
    return { refusals: [], line: "ksor dev: governance clean" };
  }
  const lines = result.refusals.map((r) => formatRefusal(r));
  return {
    refusals: result.refusals,
    line: `ksor dev: ${result.refusals.length} governance problem(s):\n${lines.map((l) => `  ${l}`).join("\n")}`,
  };
}

/** The record root for a dev invocation, or null when none can be found. */
export function devRoot(cwd: string, instance: string | null): string | null {
  if (instance !== null) {
    const abs = path.resolve(cwd, instance);
    return path.dirname(abs);
  }
  return resolveInstanceDir(cwd);
}
