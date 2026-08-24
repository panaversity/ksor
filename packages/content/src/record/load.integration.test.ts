import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { checkRecord } from "./check.js";
import { loadRecord, loadScaffoldStructure, resolveInstanceDir } from "./load.js";

function scratch(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ksor-record-"));
  mkdirSync(path.join(root, ".ksor"));
  mkdirSync(path.join(root, "knowledge", "surfaces", "empty"), { recursive: true });
  writeFileSync(
    path.join(root, "instance.md"),
    "---\nformat: 2\nname: acme\ntitle: Acme\ndescription: D.\n---\nHi.\n",
  );
  writeFileSync(
    path.join(root, ".ksor", "governance.yaml"),
    'version: "0.1"\napproval_authorities:\n  - actors: [human:you]\ntakedown_authorities:\n  actors: [human:you]\n',
  );
  writeFileSync(
    path.join(root, "knowledge", "a.md"),
    "---\ntype: Document\ntitle: A\ndescription: One.\nstatus: draft\nksor:\n  audience: [public]\n---\nBody.\n",
  );
  writeFileSync(
    path.join(root, "knowledge", "surfaces", "b.md"),
    "---\ntype: Document\ntitle: B\ndescription: Two.\nstatus: draft\nksor:\n  audience: [public]\n---\nBody.\n",
  );
  return root;
}

describe("resolveInstanceDir", () => {
  it("finds the nearest ancestor instance.md from a nested directory, and null outside any record", () => {
    const root = scratch();
    expect(resolveInstanceDir(path.join(root, "knowledge", "surfaces"))).toBe(root);
    expect(resolveInstanceDir(root)).toBe(root);
    expect(resolveInstanceDir(mkdtempSync(path.join(tmpdir(), "ksor-none-")))).toBe(null);
  });
});

describe("loadRecord + checkRecord on a real tree", () => {
  it("reads control files, every knowledge file and every directory (empty ones too), then checks clean", () => {
    const root = scratch();
    const record = loadRecord(root);
    expect([...record.files.keys()].sort()).toEqual([
      ".ksor/governance.yaml",
      "instance.md",
      "knowledge/a.md",
      "knowledge/surfaces/b.md",
    ]);
    expect(record.dirs).toEqual(["knowledge/surfaces", "knowledge/surfaces/empty"]);
    const out = checkRecord(record, { mode: "build" });
    expect(out.refusals).toEqual([]);
    expect([...out.indexes.keys()]).toEqual(["knowledge/index.md", "knowledge/surfaces/index.md"]);
    expect(out.indexes.get("knowledge/index.md")).toBe(
      '---\nokf_version: "0.2"\n---\n\n# Acme\n\n* [A](a.md) - One.\n* [Surfaces](surfaces/)\n',
    );
  });

  it("check mode on the same tree refuses the two missing indexes by path", () => {
    const out = checkRecord(loadRecord(scratch()), { mode: "check" });
    expect(out.refusals.map((r) => `${r.slug} ${r.path}`)).toEqual([
      "ksor-index-stale knowledge/index.md",
      "ksor-index-stale knowledge/surfaces/index.md",
    ]);
  });
});

describe("loadRecord — assets, symlinks and OS junk", () => {
  it("reads image bytes, reports a symlink without following it, and never reports .DS_Store", () => {
    const root = scratch();
    writeFileSync(path.join(root, "knowledge", "pic.png"), Buffer.from([1, 2, 3]));
    writeFileSync(path.join(root, "knowledge", ".DS_Store"), "junk");
    symlinkSync(path.join(root, "nowhere"), path.join(root, "knowledge", "dangling.md"));
    const record = loadRecord(root);
    expect([...(record.assets ?? new Map()).keys()]).toEqual(["knowledge/pic.png"]);
    expect([...(record.assets?.get("knowledge/pic.png") ?? [])]).toEqual([1, 2, 3]);
    expect(record.symlinks).toEqual(["knowledge/dangling.md"]);
    expect(record.files.has("knowledge/dangling.md")).toBe(false);
    const out = checkRecord(record, { mode: "build" });
    expect(out.refusals.map((r) => r.slug).sort()).toEqual(["ksor-asset-corrupt", "ksor-symlink"]);
  });
});

describe("loadScaffoldStructure", () => {
  it("digests both skill trees, reads the pointer, and lists content inside the site minus build output", () => {
    const root = scratch();
    writeFileSync(path.join(root, "CLAUDE.md"), "@AGENTS.md\n");
    mkdirSync(path.join(root, ".agents", "skills", "x"), { recursive: true });
    mkdirSync(path.join(root, ".claude", "skills", "x"), { recursive: true });
    writeFileSync(path.join(root, ".agents", "skills", "x", "SKILL.md"), "a");
    writeFileSync(path.join(root, ".claude", "skills", "x", "SKILL.md"), "b");
    mkdirSync(path.join(root, "system", "site", "out"), { recursive: true });
    mkdirSync(path.join(root, "system", "site", "content"), { recursive: true });
    writeFileSync(path.join(root, "system", "site", "out", "ignored.md"), "x");
    writeFileSync(path.join(root, "system", "site", "content", "leak.md"), "x");
    const shape = loadScaffoldStructure(root);
    expect(shape.claudeMd).toBe("@AGENTS.md\n");
    expect([...shape.agentsSkills.keys()]).toEqual(["x/SKILL.md"]);
    expect(shape.agentsSkills.get("x/SKILL.md")).not.toBe(shape.claudeSkills.get("x/SKILL.md"));
    expect(shape.siteContentFiles).toEqual(["system/site/content/leak.md"]);
  });
});
