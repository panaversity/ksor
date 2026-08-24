/**
 * The emitted checker, tortured with defects an adopter can really create —
 * a Finder `.DS_Store`, a BOM, CRLF line endings, a dangling symlink, a
 * reference-style link out of the record — and asserted by SLUG, because the
 * slug is the contract (product principle 4). The conformance fixture proves
 * the checker agrees with the kernel rules; this proves the loader in front of
 * them meets the filesystem honestly.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { INSTANCE, POLICY, doc } from "./__fixtures__/record-conformance.js";

const checker = fileURLToPath(
  new URL("../templates/scaffold/.agents/skills/format-checker/check.mjs", import.meta.url),
);
const ROOT_INDEX = '---\nokf_version: "0.2"\n---\n\n# Acme\n\n* [A](a.md) - A, in one sentence.\n';

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function project(files: Record<string, string | Buffer>): string {
  const root = mkdtempSync(path.join(tmpdir(), "ksor-torture-"));
  roots.push(root);
  const all: Record<string, string | Buffer> = {
    "instance.md": INSTANCE,
    ".ksor/governance.yaml": POLICY,
    "knowledge/a.md": doc("A"),
    "knowledge/index.md": ROOT_INDEX,
    "CLAUDE.md": "@AGENTS.md\n",
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  for (const tree of [".agents", ".claude"]) {
    mkdirSync(path.join(root, tree, "skills", "format-checker"), { recursive: true });
    copyFileSync(checker, path.join(root, tree, "skills", "format-checker", "check.mjs"));
  }
  return root;
}

function check(root: string): { readonly status: number | null; readonly out: string } {
  const r = spawnSync(process.execPath, [".agents/skills/format-checker/check.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe("the emitted checker meets the filesystem honestly", () => {
  it("passes a minimal record, and says so on stdout", () => {
    const r = check(project({}));
    expect(r.out).toContain("format-checker: ok");
    expect(r.status).toBe(0);
  });

  it("ignores .DS_Store, and reads a BOM and CRLF as the author's file rather than a defect", () => {
    const r = check(
      project({
        "knowledge/.DS_Store": Buffer.from([0, 1, 2]),
        "knowledge/a.md": `﻿${doc("A").replaceAll("\n", "\r\n")}`,
      }),
    );
    expect(r.out, r.out).toContain("format-checker: ok");
  });

  it("a dangling symlink is named, never a crash", () => {
    const root = project({});
    symlinkSync(path.join(root, "nowhere"), path.join(root, "knowledge", "ghost.md"));
    const r = check(root);
    expect(r.out).toContain("problem: ksor-symlink");
    expect(r.out).toContain("knowledge/ghost.md");
    expect(r.status).toBe(1);
  });

  it("a reference-style link out of the record escapes; one inside a code fence is code", () => {
    const body =
      "See [the handbook][hb].\n\n[hb]: ../../handbook.md\n\n```\n[x](../nope.md)\n```\n";
    const r = check(project({ "knowledge/a.md": doc("A", { body }) }));
    expect(r.out.match(/problem: ksor-link-escapes/g)).toHaveLength(1);
    expect(r.out).not.toContain("ksor-link-dead");
  });

  it("an unclosed frontmatter block is the first thing named, with a fix", () => {
    const r = check(project({ "knowledge/b.md": "---\ntitle: B\nbody without a fence\n" }));
    expect(r.out).toContain("problem: ksor-frontmatter-invalid");
    expect(r.out).toMatch(/fix: add a `---` line/);
  });

  it("the report survives a pipe: every problem line arrives", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 300; i += 1) files[`knowledge/bad-${i}.md`] = "no frontmatter\n";
    const r = check(project(files));
    expect(r.out.match(/problem: ksor-missing-key/g)?.length).toBe(300 * 4);
    expect(r.out).toContain(`format-checker: ${300 * 5} problem(s)`);
  });
});
