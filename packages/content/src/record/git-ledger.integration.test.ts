import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { historicLedger } from "./git-ledger.js";
import { checkLedgerAppendOnly, parseLedger } from "./ledger.js";

const LEDGER = ".ksor/takedowns.yaml";

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
    root = mkdtempSync(path.join(tmpdir(), "ksor-git-ledger-"));
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
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const commit = (text: string, message: string): void => {
    writeFileSync(path.join(root, LEDGER), text);
    execFileSync("git", ["add", "-A"], { cwd: root, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", message], { cwd: root, stdio: "pipe" });
  };

  const refusalsFor = (text: string): string[] => {
    const parsed = parseLedger(text, LEDGER);
    if (!parsed.ok) throw new Error("the fixture ledger does not parse");
    const history = historicLedger(root);
    expect(history.entries, `history unreadable: ${history.unreadable}`).not.toBeNull();
    return checkLedgerAppendOnly(parsed.ledger, [
      { source: "git history", entries: history.entries ?? [] },
    ]).map((r) => r.slug);
  };

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
