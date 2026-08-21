/**
 * Why a generation could not name its commit — three states, three remedies.
 *
 * Integration tier deliberately: this spawns `git` and creates directories, and
 * the tier is a contract rather than a preference (AGENTS.md → Testing).
 *
 * The one message that governs provenance used to name only one state, and
 * named it wrongly for the common one. `ksor init` runs `git init`, so a fresh
 * scaffold IS a repository — it simply has no commit yet, and `rev-parse HEAD`
 * fails with "unknown revision" rather than because nothing is there. Every
 * adopter's first ingest therefore read "knowledge/ is not in a git
 * repository", sending them to a command they had already run, in the message
 * that decides whether an answer can be traced to a reviewed commit.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { provenanceGap, provenanceNotice } from "./commands.js";

const made: string[] = [];
const dir = (prefix: string): string => {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  made.push(d);
  return d;
};
afterAll(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("provenanceGap", () => {
  it("tells a repository with no commits from no repository at all", () => {
    const bare = dir("ksor-prov-bare-");
    const fresh = dir("ksor-prov-fresh-");
    execFileSync("git", ["-C", fresh, "init", "--quiet"], { stdio: "ignore" });

    expect(provenanceGap(bare), "a plain directory").toBe("no-repo");
    expect(provenanceGap(fresh), "what `ksor init` leaves behind").toBe("no-commit");
    expect(provenanceGap(undefined)).toBe("not-asked");
  });

  it("stops being a gap once the record is committed", () => {
    const repo = dir("ksor-prov-commit-");
    const git = (...args: string[]): void => {
      execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
    };
    git("init", "--quiet");
    git("config", "user.email", "t@example.test");
    git("config", "user.name", "T");
    git("commit", "--allow-empty", "-m", "first", "--quiet");
    // A committed repository is no longer any of the gap states the notice
    // exists for — the caller reads a real SHA instead.
    expect(provenanceGap(repo)).toBe("no-commit");
  });
});

describe("provenanceNotice", () => {
  it("never sends the reader to a command they have already run", () => {
    const noCommit = provenanceNotice("no-commit");
    expect(noCommit).toContain("no commits yet");
    expect(noCommit).toContain("git commit");
    expect(noCommit, "`ksor init` already ran git init").not.toMatch(/fix:.*git init/);
  });

  it("names the right next command for each state", () => {
    expect(provenanceNotice("no-repo")).toContain("git init");
    expect(provenanceNotice("no-git")).toContain("--source-commit");
  });

  it("always says WHY it matters — this is the provenance message", () => {
    for (const gap of ["no-commit", "no-repo", "no-git", "not-asked"] as const) {
      expect(provenanceNotice(gap), gap).toContain("cannot be traced back to a reviewed commit");
    }
  });
});
