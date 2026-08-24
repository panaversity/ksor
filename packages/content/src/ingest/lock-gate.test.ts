import { describe, expect, it } from "vitest";

import type { RecordFiles } from "../record/check.js";
import { checkLock, conceptHashes, formatRefusals, sha256OfDocument } from "./lock-gate.js";

const DOC = "---\ntype: Document\n---\nBody.\n";
const record: RecordFiles = {
  files: new Map([
    ["instance.md", "---\nformat: 2\n---\n"],
    ["knowledge/index.md", "# Index\n"],
    ["knowledge/a.md", DOC],
    ["knowledge/a.summary.md", "---\ntype: Summary\n---\nS.\n"],
    ["knowledge/pol/b.md", DOC + "more\n"],
    ["knowledge/pol/README.md", "# nope\n"],
  ]),
  dirs: ["knowledge/pol"],
};

function lockFor(docs: Record<string, string>): string {
  return JSON.stringify({
    format: 1,
    build_id: "sha256:abc",
    as_of: "2026-08-25T12:00:00Z",
    ksor_version: "0.1.0",
    documents: Object.entries(docs).map(([path, sha256]) => ({ path, sha256, status: "stable" })),
  });
}

describe("conceptHashes — the set the lock must name exactly", () => {
  it("hashes concepts only: no index, no companion, no reserved name", () => {
    expect([...conceptHashes(record).keys()].sort()).toEqual(["a.md", "pol/b.md"]);
    expect(conceptHashes(record).get("a.md")).toBe(sha256OfDocument(DOC));
  });
});

describe("checkLock", () => {
  const good = { "a.md": sha256OfDocument(DOC), "pol/b.md": sha256OfDocument(DOC + "more\n") };

  it("ksor-lock-missing when there is no lock at all", () => {
    const r = checkLock(null, record);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.slug).toBe("ksor-lock-missing");
  });

  it("accepts a lock whose hashes match the tree, and hands back build_id and as_of", () => {
    const r = checkLock(lockFor(good), record);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lock.buildId).toBe("sha256:abc");
      expect(r.lock.asOf).toBe("2026-08-25T12:00:00Z");
    }
  });

  it("ksor-lock-stale when a document was edited, added or removed since the lock", () => {
    const edited = checkLock(lockFor({ ...good, "a.md": "0".repeat(64) }), record);
    expect(edited.ok).toBe(false);
    if (!edited.ok) {
      expect(edited.refusal.slug).toBe("ksor-lock-stale");
      expect(edited.refusal.why).toContain("a.md (edited since the lock)");
    }
    const added = checkLock(lockFor({ "a.md": good["a.md"] }), record);
    if (!added.ok) expect(added.refusal.why).toContain("pol/b.md (not in the lock)");
    const removed = checkLock(lockFor({ ...good, "gone.md": "x" }), record);
    if (!removed.ok)
      expect(removed.refusal.why).toContain("gone.md (in the lock, not in the tree)");
  });

  it("ksor-lock-stale for a lock this reader cannot read (bad JSON, wrong format)", () => {
    const bad = checkLock("{not json", record);
    if (!bad.ok) expect(bad.refusal.slug).toBe("ksor-lock-stale");
    const wrong = checkLock(
      JSON.stringify({ format: 2, build_id: "x", as_of: "y", documents: [] }),
      record,
    );
    if (!wrong.ok) expect(wrong.refusal.why).toMatch(/`format`/);
  });

  it("formatRefusals puts the slug first on the first line", () => {
    const r = checkLock(null, record);
    if (r.ok) return;
    const text = formatRefusals([r.refusal]);
    expect(text.split("\n")[0]).toMatch(/^ksor-lock-missing: build\.lock\.json/);
    expect(text).toMatch(/\n  why: .*\n  fix: /);
  });
});
