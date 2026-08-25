import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { historicLedger } from "./git-ledger.js";
import { checkLedgerAppendOnly, parseLedger } from "./ledger.js";

const LEDGER = ".ksor/takedowns.yaml";

const IDENTITY = [
  ["init.defaultBranch", "main"],
  ["user.email", "walk@example.test"],
  ["user.name", "Walk"],
  ["commit.gpgsign", "false"],
] as const;

/** A repository of its own per test, with an identity, so no global git config is read. */
function newRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ksor-git-ledger-"));
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
  mkdirSync(path.join(root, ".ksor"), { recursive: true });
  for (const [key, value] of IDENTITY) {
    execFileSync("git", ["config", "--local", key, value], { cwd: root, stdio: "pipe" });
  }
  return root;
}

/**
 * A repository whose RECORD lives one directory DOWN, so `git rev-parse
 * --show-prefix` is non-empty.
 *
 * That is the shape every other case in this file misses, and the miss is
 * structural rather than unlucky: `mkdtempSync` + `git init` in the SAME
 * directory always leaves the prefix empty, so a path bug that only appears
 * with a prefix could not fail here however many cases were added.
 */
function newNestedRepo(sub: string): { readonly repo: string; readonly record: string } {
  const repo = mkdtempSync(path.join(tmpdir(), "ksor-git-nested-"));
  execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "pipe" });
  for (const [key, value] of IDENTITY) {
    execFileSync("git", ["config", "--local", key, value], { cwd: repo, stdio: "pipe" });
  }
  const record = path.join(repo, sub);
  mkdirSync(path.join(record, ".ksor"), { recursive: true });
  return { repo, record };
}

function run(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
}

function commitTo(root: string, text: string, message: string): void {
  writeFileSync(path.join(root, LEDGER), text);
  run(root, "add", "-A");
  run(root, "commit", "-m", message);
}

/** The slugs `checkLedgerAppendOnly` raises for `text` against the repository's history. */
function refusalsIn(root: string, text: string): string[] {
  const parsed = parseLedger(text, LEDGER);
  if (!parsed.ok) throw new Error("the fixture ledger does not parse");
  const history = historicLedger(root);
  expect(history.entries, `history unreadable: ${history.unreadable}`).not.toBeNull();
  return checkLedgerAppendOnly(parsed.ledger, [
    { source: "git history", entries: history.entries ?? [] },
  ]).map((r) => r.slug);
}

function entry(id: string, reason: string): string {
  return [
    `- id: ${id}`,
    "  stable_id: knowledge/hr/handbook",
    "  scope: node",
    "  expected: removed",
    '  by: "human:ciso"',
    "  at: 2026-08-01T00:00:00Z",
    `  reason: ${reason}`,
    "",
  ].join("\n");
}

describe("the git baseline — a tamper must be escapable by undoing it", () => {
  let root = "";

  beforeEach(() => {
    root = newRepo();
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const commit = (text: string, message: string): void => commitTo(root, text, message);
  const refusalsFor = (text: string): string[] => refusalsIn(root, text);

  it("goes quiet again once a tampered entry is restored to what history first recorded", () => {
    const honest = entry("td-1", "personal data");
    commit(honest, "record the denial");
    commit(entry("td-1", "tampered"), "tamper with it");
    // The remedy the refusal asks for: put the entry back. `git revert` and a
    // hand edit reach the SAME tree, and the tree is what a checker reads.
    commit(honest, "put it back");

    // Keying the baseline by `id\tdigest` kept BOTH digests, so the restored
    // entry still failed to match the tampered one and `ksor-ledger-amended`
    // fired forever — a record made permanently unbuildable by a tamper that
    // had already been undone, with no remedy short of rewriting history
    // (found in review, 2026-08-25).
    expect(refusalsFor(honest)).toEqual([]);
  });

  it("still refuses an entry edited in place, and names it", () => {
    commit(entry("td-1", "personal data"), "record the denial");
    expect(refusalsFor(entry("td-1", "tampered"))).toEqual(["ksor-ledger-amended"]);
  });

  it("still refuses a committed tamper that is left in place", () => {
    commit(entry("td-1", "personal data"), "record the denial");
    const tampered = entry("td-1", "tampered");
    commit(tampered, "tamper and commit");
    // The baseline is what the entry said when it was FIRST written, so
    // committing the tamper does not launder it.
    expect(refusalsFor(tampered)).toEqual(["ksor-ledger-amended"]);
  });

  it("still refuses a deleted entry", () => {
    commit(entry("td-1", "personal data"), "record the denial");
    expect(refusalsFor("[]\n")).toEqual(["ksor-ledger-shrank"]);
  });
});

/**
 * The header's rule, tested rather than trusted: this baseline may be
 * INCOMPLETE only if it says so. Three ways a version could go missing while
 * `entries` still came back non-null — i.e. while the caller was told the
 * ledger had been VERIFIED against history.
 */
describe("the git baseline is complete, or it says it is not", () => {
  let root = "";

  beforeEach(() => {
    root = newRepo();
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("keeps an entry that was added and removed inside a merged branch", () => {
    const one = entry("td-1", "personal data");
    commitTo(root, one, "record td-1");
    const main = run(root, "branch", "--show-current").trim();
    run(root, "checkout", "-q", "-b", "side");
    commitTo(root, one + entry("td-2", "a second denial"), "record td-2 on the branch");
    commitTo(root, one, "remove td-2 before merging");
    run(root, "checkout", "-q", main);
    run(root, "merge", "-q", "--no-ff", "side", "-m", "merge the branch");

    // `git log -- <path>` SIMPLIFIES history by default: a merge that is
    // TREESAME to a parent is followed through that parent alone, so a branch
    // whose net effect on the ledger was nil is pruned entirely and td-2 was
    // in no version the baseline ever saw. A denial recorded and quietly
    // withdrawn inside one pull request is exactly what this baseline exists
    // to catch, and it is the one thing the committed lock can never catch,
    // because the lock travels in that same pull request.
    expect(refusalsIn(root, one)).toEqual(["ksor-ledger-shrank"]);
  });

  it("says a version is unreadable rather than skipping it, when its bytes are gone", () => {
    commitTo(root, entry("td-1", "personal data"), "record the denial");
    const blob = run(root, "rev-parse", `HEAD:${LEDGER}`).trim();
    // The version is still IN the tree; only its bytes cannot be fetched —
    // which is what a `git show` failure means when the path was not deleted.
    rmSync(path.join(root, ".git", "objects", blob.slice(0, 2), blob.slice(2)));

    const history = historicLedger(root);
    expect(history.entries, "a version that never arrived was reported as verified").toBeNull();
    expect(history.unreadable).toBe("unreadable");
  });

  it("reads a ledger version larger than the default spawn buffer", () => {
    // `spawnSync`'s default `maxBuffer` is 1 MB: past it the child is killed,
    // `status` is null, and the version reads as unfetchable. Skipping it left
    // the baseline empty and `entries` non-null — verified, over bytes that
    // never arrived.
    const big = entry("td-1", `"${"x".repeat(1_200_000)}"`);
    commitTo(root, big, "record a denial with a long reason");
    expect(refusalsIn(root, "[]\n")).toEqual(["ksor-ledger-shrank"]);
  });

  it("treats the commit that DELETED the ledger as a version with no entries", () => {
    commitTo(root, entry("td-1", "personal data"), "record the denial");
    run(root, "rm", "-q", LEDGER);
    run(root, "commit", "-m", "remove the ledger file");

    // The one case where `git show` failing is EXPECTED. It must not be
    // mistaken for a read failure, or a record that once withdrew its ledger
    // could never be built again.
    const history = historicLedger(root);
    expect(history.entries?.map((e) => e.id)).toEqual(["td-1"]);
    expect(refusalsIn(root, "[]\n")).toEqual(["ksor-ledger-shrank"]);
  });
});

/**
 * A record is not always its repository's root — `<repo>/docs-sor/` is an
 * ordinary shape, and it is the one this module got wrong. Two git calls here
 * need two DIFFERENT paths, which is easy to miss because each is right on its
 * own: `git show <rev>:<path>` and `ls-tree --full-tree` read a path relative
 * to the REPOSITORY ROOT, while a `git log -- <pathspec>` is relative to the
 * CWD, which is already the record root. Prefixing both asked `git log` for
 * `docs-sor/docs-sor/.ksor/takedowns.yaml`.
 *
 * The damage is that a pathspec matching nothing is not an ERROR: `git log`
 * exits 0 and prints nothing, so `commits` was `""` rather than null, and the
 * baseline came back EMPTY AND VERIFIED. Delete a denial, delete the lock, and
 * `ksor build` exits 0 with the denied document published again — the exact
 * failure this module's header says only history can catch.
 */
describe("the git baseline for a record BELOW its repository root", () => {
  let repo = "";

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("finds the ledger's history, and holds the entry rather than nothing", () => {
    const nested = newNestedRepo("docs-sor");
    repo = nested.repo;
    const { record } = nested;
    commitTo(record, entry("td-1", "personal data"), "record the denial");

    const history = historicLedger(record);
    expect(history.repository).toBe(true);
    // Not `not.toBeNull()`: an EMPTY baseline is non-null, and empty is the bug.
    expect(
      history.entries?.map((e) => e.id),
      "the history baseline is empty for a record below the repo root",
    ).toEqual(["td-1"]);
    // A digest proves the VERSION was read, not merely that the id was seen —
    // so `git show`'s repo-root-relative path still resolves from down here.
    expect(history.entries?.[0]?.digest, "the version was not read, only its id").not.toBeNull();

    // The refusal that was unreachable: the denial is gone from the ledger.
    expect(refusalsIn(record, "[]\n")).toEqual(["ksor-ledger-shrank"]);
  });

  it("still refuses an entry edited in place from down here", () => {
    const nested = newNestedRepo("teams/legal/record");
    repo = nested.repo;
    commitTo(nested.record, entry("td-1", "personal data"), "record the denial");
    expect(refusalsIn(nested.record, entry("td-1", "tampered"))).toEqual(["ksor-ledger-amended"]);
  });
});
