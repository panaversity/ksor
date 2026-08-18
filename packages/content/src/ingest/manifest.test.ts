// Manifest strictness offline: a bad manifest never half-ingests.
// Converted from the oracle's tests/test_manifest.py @ b554f91.

import { describe, expect, it } from "vitest";

import {
  ManifestError,
  manifestFile,
  manifestNode,
  manifestToJson,
  parseManifest,
  sourceId,
  topological,
} from "./manifest.js";

const GOOD = `
{"format": 1, "corpus_id": "acme.handbook", "source_commit": "e0e2794",
 "nodes": [
   {"stable_id": "gs", "slug": "getting-started", "title": "Getting Started", "kind": "section"},
   {"stable_id": "c1", "slug": "mcp-course", "title": "MCP Crash Course", "kind": "crash_course",
    "parent": "gs", "position": 1, "keywords": ["mcp"]}
 ],
 "files": [{"path": "docs/mcp/index.md", "node": "c1"}]}
`;

describe("parseManifest", () => {
  it("parses a good manifest", () => {
    const m = parseManifest(GOOD);
    expect(m.corpus_id).toBe("acme.handbook");
    expect(m.nodes[1]?.parent).toBe("gs");
    expect(m.nodes[1]?.keywords).toEqual(["mcp"]);
    expect(m.files[0]?.node).toBe("c1");
  });

  it("fills dataclass defaults for absent optional fields", () => {
    const first = parseManifest(GOOD).nodes[0];
    expect(first, "node: " + JSON.stringify(first)).toEqual(
      manifestNode({
        stable_id: "gs",
        slug: "getting-started",
        title: "Getting Started",
        kind: "section",
      }),
    );
    expect(first?.parent).toBeNull();
    expect(first?.position).toBe(0);
    expect(first?.summary).toBeNull();
    expect(first?.keywords).toEqual([]);
    expect(first?.permalink).toBeNull();
  });

  it("truncates a float position like Python int()", () => {
    const m = parseManifest(GOOD.replace('"position": 1', '"position": 2.7'));
    expect(m.nodes[1]?.position).toBe(2);
  });

  it.each([
    ['"format": 1', '"format": 9'],
    ['"corpus_id": "acme.handbook"', '"corpus_id": ""'],
    ['"parent": "gs"', '"parent": "ghost"'],
    ['"node": "c1"', '"node": "ghost"'],
  ])("fails loudly when %s becomes %s", (needle, mutation) => {
    expect(() => parseManifest(GOOD.replace(needle, mutation))).toThrow(ManifestError);
  });

  it("rejects non-JSON and non-object documents", () => {
    expect(() => parseManifest("{nope")).toThrow(/not valid JSON/);
    expect(() => parseManifest("[1, 2]")).toThrow(/must be an object/);
    expect(() => parseManifest("null")).toThrow(/must be an object/);
  });

  it("rejects duplicate stable_ids and duplicate file paths", () => {
    expect(() => parseManifest(GOOD.replace('"stable_id": "gs"', '"stable_id": "c1"'))).toThrow(
      /duplicate/,
    );
    const dupPath = GOOD.replace(
      '"files": [{"path": "docs/mcp/index.md", "node": "c1"}]',
      '"files": [{"path": "docs/mcp/index.md", "node": "c1"}, {"path": "docs/mcp/index.md", "node": "gs"}]',
    );
    expect(() => parseManifest(dupPath)).toThrow(/duplicate file paths/);
  });

  it("names the missing required entry field", () => {
    expect(() => parseManifest(GOOD.replace('"slug": "getting-started", ', ""))).toThrow(
      /entry 0: 'slug' must be a non-empty string/,
    );
  });
});

describe("topological", () => {
  it("orders parents first and catches cycles", () => {
    const childFirst = [
      manifestNode({ stable_id: "b", slug: "b", title: "B", kind: "k", parent: "a" }),
      manifestNode({ stable_id: "a", slug: "a", title: "A", kind: "k" }),
    ];
    expect(topological(childFirst).map((n) => n.stable_id)).toEqual(["a", "b"]);
    const cycle = [
      manifestNode({ stable_id: "x", slug: "x", title: "X", kind: "k", parent: "y" }),
      manifestNode({ stable_id: "y", slug: "y", title: "Y", kind: "k", parent: "x" }),
    ];
    expect(() => topological(cycle)).toThrow(/cycle/);
  });
});

describe("manifestToJson", () => {
  it("omits None/empty/zero-valued keys but always emits position", () => {
    const bare = manifestNode({ stable_id: "s", slug: "s", title: "S", kind: "section" });
    const json = manifestToJson({
      format: 1,
      corpus_id: "c",
      source_commit: "dev",
      nodes: [bare],
      files: [],
    });
    expect(json["nodes"]).toEqual([
      { stable_id: "s", slug: "s", title: "S", kind: "section", position: 0 },
    ]);
  });

  it("keeps file title only when set", () => {
    const files = [
      manifestFile({ path: "a.md", node: "s" }),
      manifestFile({ path: "b.md", node: "s", title: "B!" }),
    ];
    const nodes = [manifestNode({ stable_id: "s", slug: "s", title: "S", kind: "section" })];
    const json = manifestToJson({ format: 1, corpus_id: "c", source_commit: "dev", nodes, files });
    expect(json["files"]).toEqual([
      { path: "a.md", node: "s" },
      { path: "b.md", node: "s", title: "B!" },
    ]);
  });

  it("round-trips through the strict parser without loss", () => {
    const m = parseManifest(GOOD);
    expect(parseManifest(JSON.stringify(manifestToJson(m)))).toEqual(m);
  });
});

describe("sourceId", () => {
  it("strips .md and appends :prose", () => {
    expect(sourceId("docs/a/b.md")).toBe("docs/a/b:prose");
  });

  it("keeps the .mdx suffix — the oracle's deliberate asymmetry", () => {
    expect(sourceId("docs/a/b.mdx")).toBe("docs/a/b.mdx:prose");
  });
});
