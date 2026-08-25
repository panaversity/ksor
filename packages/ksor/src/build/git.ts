/**
 * What `ksor build` asks git (build spec §2, record spec §5): the last
 * commit touching an input, whether the inputs differ from it, and every id
 * the takedown ledger has ever carried. Read-only, and honest about a
 * repository it cannot read — a shallow clone has no history to verify
 * against, which is a refusal upstream, never a silent pass.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  git as run,
  historicLedger,
  type LedgerBaselineEntry,
} from "@panaversity/ksor-content/record";

/** The inputs a projection reads; nothing else moves `source_commit` (the lock itself included). */
export const INPUTS: readonly string[] = [
  "knowledge",
  "instance.md",
  ".ksor/governance.yaml",
  ".ksor/takedowns.yaml",
];

export interface GitFacts {
  /** False outside any repository (or without a git binary). */
  readonly repository: boolean;
  readonly shallow: boolean;
  readonly sourceCommit: string | null;
  readonly dirty: boolean;
  /**
   * Every ledger entry any committed version of the file has carried — id and,
   * where that version parses, the digest of its text — or null when history is
   * unreadable.
   */
  readonly historicLedger: readonly LedgerBaselineEntry[] | null;
  /**
   * Why `historicLedger` is null, in the caller's words. Two different states
   * reached one refusal that asserted "this is a shallow clone" as fact — the
   * same mistake a repository with no commit already cost us once (27352a4):
   * a diagnosis stated for a state nobody distinguished.
   */
  readonly historyUnreadable: "shallow" | "unreadable" | null;
}

/**
 * The governance files git has been told to ignore. `.ksor/` was one ignored
 * DIRECTORY before the profile, and the policy and the ledger now live inside
 * it — so `git add -A` stages neither, the migration commits green locally,
 * and the clone CI builds from has no policy at all. What is invisible to a
 * clone is invisible to every surface, so the build says so by name.
 */
export function ignoredGovernance(root: string): readonly string[] {
  // Only files that are THERE: `git check-ignore` answers about a pattern, not
  // about a file, so asking about the ledger of a record that has never had a
  // takedown would refuse a level-0 record for a file it does not want.
  const paths = [".ksor/governance.yaml", ".ksor/takedowns.yaml"].filter((rel) =>
    existsSync(join(root, rel)),
  );
  if (paths.length === 0) return [];
  const out = run(root, ["check-ignore", "--", ...paths]);
  if (out === null) return [];
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => paths.includes(line));
}

export function gitFacts(root: string): GitFacts {
  // The ledger half is the record module's, because the site's stage and the
  // emitted checker need the identical answer and cannot import this file.
  const history = historicLedger(root);
  if (!history.repository) {
    return {
      repository: false,
      shallow: false,
      sourceCommit: null,
      dirty: true,
      historicLedger: null,
      historyUnreadable: null,
    };
  }
  const born = run(root, ["rev-parse", "--verify", "--quiet", "HEAD"]) !== null;
  const head = born ? run(root, ["log", "-1", "--format=%H", "--", ...INPUTS]) : "";
  const sourceCommit = head === null || head.trim() === "" ? null : head.trim();
  // Untracked counts as dirty: an input git has never seen is not in any commit.
  const status = run(root, ["status", "--porcelain", "--untracked-files=all", "--", ...INPUTS]);
  const dirty = sourceCommit === null || status === null || status.trim() !== "";
  return {
    repository: true,
    shallow: history.shallow,
    sourceCommit,
    dirty,
    historicLedger: history.entries,
    historyUnreadable: history.unreadable,
  };
}
