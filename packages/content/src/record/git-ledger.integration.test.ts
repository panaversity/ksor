import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { historicLedger } from "./git-ledger.js";
import { checkLedgerAppendOnly, parseLedger } from "./ledger.js";

const LEDGER = ".ksor/takedowns.yaml";

/** A repository of its own per test, with an identity, so no global git config is read. */
function newRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ksor-git-ledger-"));
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
  mkdirSync(path.join(root, ".ksor"), { recursive: true });
  for (const [key, value] of [
    ["init.defaultBranch", "main"],
    ["user.email", "walk@example.test"],
    ["user.name", "Walk"],
    ["commit.gpgsign", "false"],
  ] as const) {
    execFileSync("git", ["config", "--local", key, value], { cwd: root, stdio: "pipe" });
  }
  return root;
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
