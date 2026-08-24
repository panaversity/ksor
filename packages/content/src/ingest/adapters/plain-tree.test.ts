// Pure unit tier for the record adapter: identity, order, governance
// projection — over in-memory records that went through the ONE checker
// (fs walking lives in plain-tree.integration.test.ts).

import { describe, expect, it } from "vitest";

import { checkRecord, type RecordFiles } from "../../record/check.js";
import { buildManifestFromRecord, type PlainTreeResult } from "./plain-tree.js";

const POLICY = `version: "0.1"
audiences:
  internal:
    description: Staff
  board:
    description: The board
approval_authorities:
  - actors: [human:cfo]
takedown_authorities:
  actors: [human:ciso]
`;
const INSTANCE = `---
format: 2
name: acme
title: Acme
description: The Acme record.
---
Instructions.
`;

function doc(
  title: string,
  opts: { audience?: string; order?: number; status?: string; extra?: string } = {},
): string {
  const status = opts.status ?? "stable";
  return (
    `---\ntype: Document\ntitle: ${title}\ndescription: One sentence.\nstatus: ${status}\n` +
    (opts.order === undefined ? "" : `order: ${opts.order}\n`) +
    `generated: { by: "x/1", at: 2026-08-20T09:00:00Z }\n` +
    (opts.extra ?? "") +
    `ksor:\n  audience: [${opts.audience ?? "public"}]\n` +
    (status === "stable" ? `  approval: { by: "human:cfo", at: 2026-08-21T09:00:00Z }\n` : "") +
    `---\n\nBody of ${title}.\n`
  );
}

function build(files: Record<string, string>, dirs: string[] = []): PlainTreeResult {
  const record: RecordFiles = {
    files: new Map(
      Object.entries({ "instance.md": INSTANCE, ".ksor/governance.yaml": POLICY, ...files }),
    ),
    dirs,
  };
  const check = checkRecord(record, { mode: "build" });
  if (check.refusals.length > 0) throw new Error(JSON.stringify(check.refusals));
  return buildManifestFromRecord(check, dirs, { corpusId: "c", sourceCommit: "dev" });
}

describe("identity — path is the id (decision 26 retires sor_id)", () => {
  it("a concept is `knowledge/<id>`, a directory is `knowledge/<dir>#section`, an index is nothing", () => {
    const { manifest, sources } = build(
      {
        "knowledge/a.md": doc("A"),
        "knowledge/index.md": "# Acme\n",
        "knowledge/pol/index.md": "# Pol\n",
        "knowledge/pol/b.md": doc("B"),
      },
      ["knowledge/pol"],
    );
    expect(manifest.nodes.map((n) => `${n.kind} ${n.stable_id}`)).toEqual([
      "document knowledge/a",
      "section knowledge/pol#section",
      "document knowledge/pol/b",
    ]);
    expect(manifest.files.map((f) => f.path)).toEqual(["knowledge/a.md", "knowledge/pol/b.md"]);
    expect([...sources.values()], "an index is never chunked").not.toContain("knowledge/index.md");
    const b = manifest.nodes.find((n) => n.stable_id === "knowledge/pol/b");
    expect(b?.parent).toBe("knowledge/pol#section");
    expect(b?.title).toBe("B");
    expect(b?.summary, "the description rides the node's summary").toBe("One sentence.");
  });

  it("an EMPTY directory is still a section shell, and a section's title is humanised", () => {
    const { manifest } = build({ "knowledge/a.md": doc("A") }, ["knowledge/purchase-policies"]);
    const section = manifest.nodes.find((n) => n.kind === "section");
    expect(section?.stable_id).toBe("knowledge/purchase-policies#section");
    expect(section?.title).toBe("Purchase policies");
    expect(section?.governance.audience, "no descendants: visible to nobody").toEqual([]);
  });

  it("companions create no node and are never chunked", () => {
    const { manifest } = build({
      "knowledge/a.md": doc("A"),
      "knowledge/a.summary.md": "---\ntype: Summary\n---\nShort.\n",
      "knowledge/a.flashcards.yaml": "deck: {}\n",
    });
    expect(manifest.nodes.map((n) => n.stable_id)).toEqual(["knowledge/a"]);
    expect(manifest.files).toHaveLength(1);
  });
});

describe("ordering — the governed `order:` key, then name (lib/order-rule.ts)", () => {
  it("honors order over name, for documents and directories alike", () => {
    const { manifest } = build(
      {
        "knowledge/a.md": doc("A", { order: 2 }),
        "knowledge/b.md": doc("B", { order: 1 }),
        "knowledge/z/first.md": doc("F", { order: 0 }),
      },
      ["knowledge/z"],
    );
    expect(manifest.nodes.filter((n) => n.parent === null).map((n) => n.slug)).toEqual([
      "z",
      "b",
      "a",
    ]);
    expect(manifest.nodes.filter((n) => n.parent === null).map((n) => n.position)).toEqual([
      1, 2, 3,
    ]);
  });

  it("a directory ranks by the lowest order among its own concepts, unordered last", () => {
    const { manifest } = build(
      {
        "knowledge/a.md": doc("A"),
        "knowledge/late/x.md": doc("X"),
        "knowledge/early/y.md": doc("Y", { order: 1 }),
      },
      ["knowledge/late", "knowledge/early"],
    );
    expect(manifest.nodes.filter((n) => n.parent === null).map((n) => n.slug)).toEqual([
      "early",
      "a",
      "late",
    ]);
  });
});

describe("governance is projected from the profile, never re-read", () => {
  it("carries audience, status, tier, approval and effectivity onto the node", () => {
    const { manifest } = build({
      "knowledge/p.md": doc("P", {
        audience: "internal, board",
        extra:
          'verified:\n  - { by: "human:kim", at: 2026-08-22T10:00:00Z }\nstale_after: 2027-01-01T00:00:00Z\n',
      }),
    });
    const g = manifest.nodes[0]!.governance;
    expect(g.audience).toEqual(["internal", "board"]);
    expect(g.docStatus).toBe("stable");
    expect(g.trustTier, "a human verifier is tier 2").toBe(2);
    expect(g.approval).toEqual({ by: "human:cfo", at: "2026-08-21T09:00:00.000Z" });
    expect(g.generated).toEqual({ by: "x/1", at: "2026-08-20T09:00:00.000Z" });
    expect(g.staleAfter).toBe("2027-01-01T00:00:00.000Z");
    expect(g.verified).toEqual([{ by: "human:kim", at: "2026-08-22T10:00:00.000Z" }]);
  });

  it("a draft carries no approval and tier 0; a stable, unverified concept is tier 0 too", () => {
    const { manifest } = build({
      "knowledge/d.md": doc("D", { status: "draft" }),
      "knowledge/s.md": doc("S"),
    });
    const byId = new Map(manifest.nodes.map((n) => [n.stable_id, n.governance]));
    expect(byId.get("knowledge/d")).toMatchObject({
      docStatus: "draft",
      approval: null,
      trustTier: 0,
    });
    expect(byId.get("knowledge/s")).toMatchObject({ docStatus: "stable", trustTier: 0 });
  });

  it("a section carries the UNION of its descendants' audiences — the one predicate admits it iff a descendant is visible", () => {
    const { manifest } = build(
      {
        "knowledge/sec/pub.md": doc("Pub"),
        "knowledge/sec/deep/int.md": doc("Int", { audience: "internal" }),
        "knowledge/sec/deep/brd.md": doc("Brd", { audience: "board" }),
      },
      ["knowledge/sec", "knowledge/sec/deep"],
    );
    const byId = new Map(manifest.nodes.map((n) => [n.stable_id, n.governance.audience]));
    expect(byId.get("knowledge/sec#section")).toEqual(["board", "internal", "public"]);
    expect(byId.get("knowledge/sec/deep#section")).toEqual(["board", "internal"]);
  });

  it("superseded_by is carried as a stable_id", () => {
    const { manifest } = build({
      "knowledge/old.md": doc("Old", {
        status: "deprecated",
        extra: "",
      }).replace(
        "ksor:\n",
        'ksor:\n  deprecated: { by: "human:ciso", at: 2026-08-22T10:00:00Z }\n  superseded_by: new\n',
      ),
      "knowledge/new.md": doc("New"),
    });
    const old = manifest.nodes.find((n) => n.stable_id === "knowledge/old")!.governance;
    expect(old.docStatus).toBe("deprecated");
    expect(old.supersededBy).toBe("knowledge/new");
    expect(old.deprecated).toEqual({ by: "human:ciso", at: "2026-08-22T10:00:00.000Z" });
  });
});

describe("slugs", () => {
  it("a non-Latin name gets a stable derived slug rather than an empty one", () => {
    const { manifest } = build({ "knowledge/政策.md": doc("Policy") });
    expect(manifest.nodes[0]!.slug).toMatch(/^x-[0-9a-f]{8}$/);
  });
});
