/**
 * What `ksor build` asks git (build spec §2, record spec §5): the last
 * commit touching an input, whether the inputs differ from it, and every id
 * the takedown ledger has ever carried. Read-only, and honest about a
 * repository it cannot read — a shallow clone has no history to verify
 * against, which is a refusal upstream, never a silent pass.
 */
import { spawnSync } from "node:child_process";

import {
  entryDigest,
  parseLedger,
  type LedgerBaselineEntry,
} from "@panaversity/ksor-content/record";

/** The inputs a projection reads; nothing else moves `source_commit` (the lock itself included). */
export const INPUTS: readonly string[] = [
  "knowledge",
  "instance.md",
  ".ksor/governance.yaml",
  ".ksor/takedowns.yaml",
];

const LEDGER = ".ksor/takedowns.yaml";

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

function run(root: string, args: readonly string[]): string | null {
  const r = spawnSync("git", [...args], { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
}

export function gitFacts(root: string): GitFacts {
  const inside = run(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside === null || inside.trim() !== "true") {
    return {
      repository: false,
      shallow: false,
      sourceCommit: null,
      dirty: true,
      historicLedger: null,
      historyUnreadable: null,
    };
  }
  const shallow = (run(root, ["rev-parse", "--is-shallow-repository"]) ?? "").trim() === "true";
  // `ksor init` runs `git init`, so a fresh scaffold IS a repository — with no
  // commit in it. `git log` exits non-zero there, which read as "history is
  // unreadable" and refused the first build an adopter ever runs with a message
  // about a shallow clone (found live). A repository with no commits has no
  // history for a ledger id to disappear from, so its baseline is empty and
  // verified, not missing.
  const born = run(root, ["rev-parse", "--verify", "--quiet", "HEAD"]) !== null;
  const head = born ? run(root, ["log", "-1", "--format=%H", "--", ...INPUTS]) : "";
  const sourceCommit = head === null || head.trim() === "" ? null : head.trim();
  // Untracked counts as dirty: an input git has never seen is not in any commit.
  const status = run(root, ["status", "--porcelain", "--untracked-files=all", "--", ...INPUTS]);
  const dirty = sourceCommit === null || status === null || status.trim() !== "";
  const historicLedger = shallow ? null : born ? historicEntries(root) : [];
  return {
    repository: true,
    shallow,
    sourceCommit,
    dirty,
    historicLedger,
    historyUnreadable: historicLedger !== null ? null : shallow ? "shallow" : "unreadable",
  };
}

/**
 * Every version of the ledger in history, entry by entry. A version that
 * parses contributes each entry's digest, so an entry EDITED in place is
 * caught, not only one deleted; a version that no longer parses still
 * contributes its ids, read permissively — the point there is that an id once
 * written never disappears.
 */
function historicEntries(root: string): readonly LedgerBaselineEntry[] | null {
  const prefix = (run(root, ["rev-parse", "--show-prefix"]) ?? "").trim();
  const commits = run(root, ["log", "--format=%H", "--", LEDGER]);
  if (commits === null) return null;
  const seen = new Map<string, LedgerBaselineEntry>();
  for (const sha of commits.split("\n").filter((s) => s !== "")) {
    const text = run(root, ["show", `${sha}:${prefix}${LEDGER}`]);
    if (text === null) continue;
    const where = sha.slice(0, 7);
    const parsed = parseLedger(text, LEDGER);
    if (parsed.ok) {
      for (const entry of parsed.ledger.entries) {
        seen.set(`${entry.id}\u0000${entryDigest(entry)}`, {
          id: entry.id,
          digest: entryDigest(entry),
          entry,
          where,
        });
      }
      continue;
    }
    for (const m of text.matchAll(/^\s*(?:-\s+)?id:\s*["']?([^\s"']+)/gm)) {
      const id = m[1] ?? "";
      const key = `${id}\u0000`;
      if (!seen.has(key)) seen.set(key, { id, digest: null, where });
    }
  }
  return [...seen.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
