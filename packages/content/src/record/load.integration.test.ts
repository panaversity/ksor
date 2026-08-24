import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { checkRecord } from "./check.js";
import { loadRecord, resolveInstanceDir } from "./load.js";

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
