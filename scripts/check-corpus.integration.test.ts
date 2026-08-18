import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./check-corpus.mjs", import.meta.url));

function runCheck(args: readonly string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

let tempDir: string | null = null;
afterEach(() => {
  if (tempDir !== null) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

function makeCorpus(): string {
  tempDir = mkdtempSync(path.join(tmpdir(), "ksor-corpus-"));
  mkdirSync(path.join(tempDir, "knowledge"), { recursive: true });
  writeFileSync(path.join(tempDir, "instance.md"), "# Test corpus\n\nFixture instance.\n");
  return tempDir;
}

describe("check-corpus", () => {
  it("passes the repository's own corpus roots", () => {
    const result = runCheck([]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("accepts a valid governed document", () => {
    const corpus = makeCorpus();
    writeFileSync(
      path.join(corpus, "knowledge", "policy.md"),
      "---\ntitle: A policy\nstatus: approved\nowner: finance\nprovenance:\n  - board minutes 2026-01\n---\n\n# A policy\n",
    );
    expect(runCheck(["--corpus", corpus]).status).toBe(0);
  });

  it("rejects an ungoverned document and teaches the fix", () => {
    const corpus = makeCorpus();
    writeFileSync(path.join(corpus, "knowledge", "rogue.md"), "# No frontmatter at all\n");
    const result = runCheck(["--corpus", corpus]);
    expect(result.status).toBe(1);
    // Errors are documentation: the message must carry why + fix.
    expect(result.stderr).toContain("why:");
    expect(result.stderr).toContain("fix:");
    expect(result.stderr).toContain("rogue.md");
  });

  it("rejects a dead relative link", () => {
    const corpus = makeCorpus();
    writeFileSync(
      path.join(corpus, "knowledge", "linked.md"),
      "---\ntitle: Linked\nstatus: draft\nowner: ops\nprovenance:\n  - somewhere\n---\n\nSee [missing](./nope.md).\n",
    );
    const result = runCheck(["--corpus", corpus]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("dead relative link");
  });

  it("rejects authored id:/name: keys — identity derives from the path", () => {
    const corpus = makeCorpus();
    writeFileSync(
      path.join(corpus, "knowledge", "twin.md"),
      "---\ntitle: Twin\nid: authored-twin\nstatus: draft\nowner: ops\nprovenance:\n  - somewhere\n---\n\n# Twin\n",
    );
    const result = runCheck(["--corpus", corpus]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('authored "id:" frontmatter key');
  });

  it("rejects an invalid status and an empty status", () => {
    const corpus = makeCorpus();
    writeFileSync(
      path.join(corpus, "knowledge", "freeform.md"),
      "---\ntitle: Freeform\nstatus: finished\nowner: ops\nprovenance:\n  - somewhere\n---\n\n# F\n",
    );
    const invalid = runCheck(["--corpus", corpus]);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('status "finished" is not one of');

    writeFileSync(
      path.join(corpus, "knowledge", "freeform.md"),
      "---\ntitle: Freeform\nstatus:\nowner: ops\nprovenance:\n  - somewhere\n---\n\n# F\n",
    );
    const empty = runCheck(["--corpus", corpus]);
    expect(empty.status).toBe(1);
    expect(empty.stderr).toContain("status key has no value");
  });

  it("accepts a YAML-quoted lifecycle value", () => {
    const corpus = makeCorpus();
    writeFileSync(
      path.join(corpus, "knowledge", "quoted.md"),
      '---\ntitle: Quoted\nstatus: "approved"\nowner: ops\nprovenance:\n  - somewhere\n---\n\n# Q\n',
    );
    expect(runCheck(["--corpus", corpus]).status).toBe(0);
  });

  it("rejects a corpus with no instance.md", () => {
    const corpus = makeCorpus();
    rmSync(path.join(corpus, "instance.md"));
    const result = runCheck(["--corpus", corpus]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing instance.md");
  });
});
