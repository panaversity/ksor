/**
 * The takedown ledger's OTHER baseline: every entry any COMMITTED version of
 * `.ksor/takedowns.yaml` has ever carried.
 *
 * The committed lock is a baseline too, and a good one — it holds each entry's
 * digest, so an entry retargeted in place is caught. What it cannot do is prove
 * that an entry was never deleted, because the lock travels in the SAME change
 * as the ledger: delete the row, recompute `ledger_sha256`, empty
 * `ledger_entries`, and the two agree with each other about a denial that is
 * gone. Only history remembers.
 *
 * This lives in the record module because THREE surfaces need the same answer —
 * `ksor build`, the emitted checker, and the site's stage (decision 19: a
 * surface that refuses must refuse on both surfaces). Plain `git log` / `git
 * show`, so nothing here needs installing.
 */
import { spawnSync } from "node:child_process";

import { entryDigest, parseLedger, type LedgerBaselineEntry } from "./ledger";

const LEDGER = ".ksor/takedowns.yaml";

export interface HistoricLedger {
  /** False outside any repository, and false without a git binary. */
  readonly repository: boolean;
  readonly shallow: boolean;
  /** Null when history could not be read; empty in a repository with no commit. */
  readonly entries: readonly LedgerBaselineEntry[] | null;
  /**
   * Why `entries` is null, in the caller's words. Two different states reached
   * one refusal that asserted "this is a shallow clone" as fact — a diagnosis
   * stated for a state nobody distinguished (27352a4).
   */
  readonly unreadable: "shallow" | "unreadable" | null;
}

/** One git query, read-only. Null on any non-zero exit, including no git at all. */
export function git(root: string, args: readonly string[]): string | null {
  const r = spawnSync("git", [...args], { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
}

export function historicLedger(root: string): HistoricLedger {
  const inside = git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside === null || inside.trim() !== "true") {
    return { repository: false, shallow: false, entries: null, unreadable: null };
  }
  const shallow = (git(root, ["rev-parse", "--is-shallow-repository"]) ?? "").trim() === "true";
  // `ksor init` runs `git init`, so a fresh scaffold IS a repository — with no
  // commit in it. `git log` exits non-zero there, which read as "history is
  // unreadable" and refused the first build an adopter ever runs with a message
  // about a shallow clone (found live). A repository with no commits has no
  // history for a ledger id to disappear from, so its baseline is empty and
  // verified, not missing.
  const born = git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]) !== null;
  const entries = shallow ? null : born ? historicEntries(root) : [];
  return {
    repository: true,
    shallow,
    entries,
    unreadable: entries !== null ? null : shallow ? "shallow" : "unreadable",
  };
}

/**
 * Every id history has ever recorded, each with the text it carried the FIRST
 * time it was written. A version that parses contributes each entry's digest,
 * so an entry EDITED in place is caught, not only one deleted; a version that
 * no longer parses still contributes its ids, read permissively — the point
 * there is that an id once written never disappears.
 *
 * FIRST, not every: keying this by `id\tdigest` kept one baseline entry per
 * version an id ever had, so a tamper that was COMMITTED and then UNDONE left
 * two digests for one id, the restored entry matched only one of them, and
 * `ksor-ledger-amended` fired for good. The record became permanently
 * unbuildable — by a tamper that had already been put right — and the only
 * escape was rewriting git history, which is not a remedy a refusal may
 * demand (found in review, 2026-08-25).
 *
 * Taking the OLDEST is what makes the guarantee both enforceable and
 * escapable. It still refuses a committed tamper (the baseline is what the
 * entry said when it was written, so committing the edit does not launder
 * it), and the remedy it names — put the entry back — now actually clears
 * it. Taking the NEWEST would have done the opposite on both counts.
 */
function historicEntries(root: string): readonly LedgerBaselineEntry[] | null {
  const prefix = (git(root, ["rev-parse", "--show-prefix"]) ?? "").trim();
  const commits = git(root, ["log", "--format=%H", "--", LEDGER]);
  if (commits === null) return null;
  const seen = new Map<string, LedgerBaselineEntry>();
  for (const sha of commits.split("\n").filter((s) => s !== "")) {
    const text = git(root, ["show", `${sha}:${prefix}${LEDGER}`]);
    if (text === null) continue;
    const where = sha.slice(0, 7);
    const parsed = parseLedger(text, LEDGER);
    // `git log` is newest-first, so an OLDER version overwriting a newer one
    // leaves the oldest — the text the id was written with.
    if (parsed.ok) {
      for (const entry of parsed.ledger.entries) {
        seen.set(entry.id, { id: entry.id, digest: entryDigest(entry), entry, where });
      }
      continue;
    }
    for (const m of text.matchAll(/^\s*(?:-\s+)?id:\s*["']?([^\s"']+)/gm)) {
      const id = m[1] ?? "";
      // Presence only, and never over a digest: a version that stopped
      // parsing proves the id existed, and proves nothing about its text, so
      // it must not erase what an older readable version already said.
      if (!seen.has(id)) seen.set(id, { id, digest: null, where });
    }
  }
  return [...seen.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
