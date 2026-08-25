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
 * The baseline may be INCOMPLETE only if it SAYS so: every version history
 * holds is read, or `entries` comes back null and the caller reports that it
 * could not verify. A version silently skipped would contribute neither
 * digests nor ids while the answer still read "verified"
 * (`git-ledger.integration.test.ts`).
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

/**
 * `spawnSync` defaults to a 1 MB stdout buffer, and past it the child is KILLED
 * — `status` comes back null, so the query reads as a failure. A ledger with a
 * few thousand entries, or one entry carrying a long reason, clears 1 MB
 * easily, and the version was then dropped from the baseline while the caller
 * was still told history had been verified. The ceiling stays finite on
 * purpose: past it this returns null, which is a state the caller SAYS.
 */
const MAX_BUFFER = 64 * 1024 * 1024;

/** One git query, read-only. Null on any non-zero exit, including no git at all. */
export function git(root: string, args: readonly string[]): string | null {
  const r = spawnSync("git", [...args], { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER });
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
  // TWO paths for one file, because git means two different things by "path"
  // here and each call is right on its own:
  //
  //   `git show <rev>:<path>` and `ls-tree --full-tree` read a path relative to
  //   the REPOSITORY ROOT — hence `atRoot`, built from `--show-prefix`.
  //
  //   a `git log -- <pathspec>` is relative to the CWD, and the cwd is already
  //   the record root — hence `LEDGER`, bare.
  //
  // Prefixing both asked `git log` for `docs-sor/docs-sor/.ksor/takedowns.yaml`
  // whenever a record sat below its repository root, which is an ordinary
  // shape. A pathspec matching nothing is not an ERROR: `git log` exits 0 and
  // prints nothing, so the baseline came back EMPTY and non-null — verified,
  // holding nothing — and a deleted denial republished with the build exiting
  // 0. Every case in the test file was `mkdtemp` + `git init` in ONE directory,
  // where the prefix is always empty, so no number of cases in that shape could
  // have caught it (found in review, 2026-08-25).
  const prefix = (git(root, ["rev-parse", "--show-prefix"]) ?? "").trim();
  const atRoot = `${prefix}${LEDGER}`;
  // `--full-history` because `git log -- <path>` SIMPLIFIES by default: a merge
  // TREESAME to a parent is followed through that parent alone, so a branch
  // whose net effect on the ledger was nil is pruned whole — a denial added and
  // withdrawn inside one pull request never entered the baseline, and
  // `ksor-ledger-shrank` could not fire for it. That is precisely the deletion
  // the committed lock cannot catch either, since the lock travels in the same
  // pull request; if history does not remember it, nothing does.
  //
  // `--topo-order` because the walk below lets an OLDER version overwrite a
  // newer one, and across branches the default ordering is by commit DATE,
  // which need not follow ancestry. Topological order does, so "oldest" means
  // the ancestor rather than whichever machine's clock was behind.
  const commits = git(root, ["log", "--full-history", "--topo-order", "--format=%H", "--", LEDGER]);
  if (commits === null) return null;
  const seen = new Map<string, LedgerBaselineEntry>();
  for (const sha of commits.split("\n").filter((s) => s !== "")) {
    const text = git(root, ["show", `${sha}:${atRoot}`]);
    if (text === null) {
      // `git show` failing means one of two things, and they used to be one
      // silent `continue`: the commit DELETED the ledger (expected — it has no
      // version to contribute), or the bytes could not be read (a killed query,
      // a missing object). `ls-tree` separates them — it exits 0 either way and
      // prints nothing when the path is absent — so an unreadable version stops
      // being counted as a verified empty one. Asked only on failure, so the
      // ordinary walk still costs one git call per commit.
      const listed = git(root, ["ls-tree", "--full-tree", "--name-only", sha, "--", atRoot]);
      if (listed !== null && listed.trim() === "") continue;
      return null;
    }
    const where = sha.slice(0, 7);
    const parsed = parseLedger(text, LEDGER);
    // The walk is newest-first in topological order, so an OLDER version
    // overwriting a newer one leaves the oldest — the text the id was written
    // with.
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
