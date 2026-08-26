/**
 * `check-corpus` is the PRODUCT-DOCS checker: identity, lifecycle and internal
 * links for the markdown shipped inside the npm package.
 *
 * It is not a record checker any more. It carried a second implementation of
 * the record's rules behind `--corpus <dir>` — `owner`/`provenance` required,
 * a `draft | review | approved | superseded` status set — which the KSoR
 * Profile retired, so running that flag against this repository's OWN migrated
 * record reported `status "stable" is not one of …` and demanded two keys the
 * profile refuses. These tests hold the docs half and hold the flag gone.
 *
 * The script resolves its docs directory from its own location, so the fixture
 * cases run against a COPY of it in a tmp tree — a test must never write into
 * the repository it is checking.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const script = path.join(scriptsDir, "check-corpus.mjs");

function runCheck(at: string, args: readonly string[] = []) {
  return spawnSync(process.execPath, [at, ...args], { encoding: "utf8" });
}

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * The script and the one module it imports, in a throwaway repository whose
 * `packages/ksor/docs` holds exactly `docs`. Returns the path to run.
 */
function harness(docs: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(path.join(tmpdir(), "ksor-check-corpus-"));
  roots.push(root);
  mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
  copyFileSync(script, path.join(root, "scripts", "check-corpus.mjs"));
  copyFileSync(
    path.join(scriptsDir, "lib", "frontmatter.mjs"),
    path.join(root, "scripts", "lib", "frontmatter.mjs"),
  );
  const docsDir = path.join(root, "packages", "ksor", "docs");
  mkdirSync(docsDir, { recursive: true });
  for (const [name, text] of Object.entries(docs)) writeFileSync(path.join(docsDir, name), text);
  return path.join(root, "scripts", "check-corpus.mjs");
}

describe("check-corpus", () => {
  it("passes the product docs this repository ships", () => {
    const result = runCheck(script);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("accepts a well-formed doc", () => {
    const at = harness({ "a.md": "---\ntitle: A\nstatus: draft\n---\n\n# A\n" });
    expect(runCheck(at).status).toBe(0);
  });

  it("rejects a doc with no frontmatter and teaches the fix", () => {
    const at = harness({ "rogue.md": "# No frontmatter at all\n" });
    const result = runCheck(at);
    expect(result.status).toBe(1);
    // Errors are documentation: the message must carry why + fix.
    expect(result.stderr).toContain("why:");
    expect(result.stderr).toContain("fix:");
    expect(result.stderr).toContain("rogue.md");
  });

  it("rejects a dead relative link", () => {
    const at = harness({
      "linked.md": "---\ntitle: Linked\nstatus: draft\n---\n\nSee [missing](./nope.md).\n",
    });
    const result = runCheck(at);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("dead relative link");
  });

  it("rejects authored id:/name: keys — identity derives from the path", () => {
    const at = harness({
      "twin.md": "---\ntitle: Twin\nid: authored-twin\nstatus: draft\n---\n\n# Twin\n",
    });
    const result = runCheck(at);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('authored "id:" frontmatter key');
  });

  it("rejects an invalid status and an empty status", () => {
    const invalid = runCheck(
      harness({ "f.md": "---\ntitle: Freeform\nstatus: finished\n---\n\n# F\n" }),
    );
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('status "finished" is not one of');

    const empty = runCheck(harness({ "f.md": "---\ntitle: Freeform\nstatus:\n---\n\n# F\n" }));
    expect(empty.status).toBe(1);
    expect(empty.stderr).toContain("status key has no value");
  });

  it("accepts a YAML-quoted lifecycle value", () => {
    const at = harness({ "q.md": '---\ntitle: Quoted\nstatus: "draft"\n---\n\n# Q\n' });
    expect(runCheck(at).status).toBe(0);
  });

  /**
   * The retired flag. Silence would be the wrong answer for an operator who
   * runs what they were told about, so the refusal names where the rules went.
   */
  it("refuses --corpus by name, pointing at the one rule set", () => {
    const result = runCheck(script, ["--corpus", scriptsDir]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown argument");
    expect(result.stderr).toContain("ksor build");
  });
});
