// Pure unit tier for the plain-tree adapter: ordering, ids, titles, skips —
// all over in-memory trees (fs walking lives in plain-tree.integration.test.ts).
// Expectations oracle-verified against plain_tree.py @ b554f91 (probe run 2026-08-19).

import { describe, expect, it } from "vitest";

import { ManifestError, manifestToJson } from "../manifest.js";
import {
  buildManifestFromTree,
  frontmatterMeta,
  type PlainTreeResult,
  type TreeDir,
  type TreeEntry,
} from "./plain-tree.js";

function file(name: string, text = "# Body\n\ntext\n"): TreeEntry {
  return { kind: "file", name, text };
}

function dir(name: string, ...entries: TreeEntry[]): TreeDir {
  return { kind: "dir", name, entries };
}

function symlink(name: string): TreeEntry {
  return { kind: "symlink", name };
}

function build(root: TreeDir, onSkip?: (line: string) => void): PlainTreeResult {
  return buildManifestFromTree(root, {
    corpusId: "c",
    sourceCommit: "dev",
    onSkip: onSkip ?? (() => {}),
  });
}

describe("ordering", () => {
  // The rule itself, and its full decision table, live in lib/order-rule.ts and
  // lib/order-conformance.ts — asserted there against BOTH surfaces. These are
  // the adapter's own edges: the governed key it reads, and the shapes only a
  // real tree has.
  //
  // These tests used to assert `position:` / `sidebar_position:`, the
  // predecessor's Docusaurus keys. No compliant record may declare either — the
  // format checker closes the frontmatter key set and `order` is the ordering
  // key in it — so the adapter was reading keys that never appear and ignoring
  // the one that does (found live 2026-08-21).

  it("honors the governed `order:` key over name order", () => {
    const root = dir(
      "docs",
      file("a.md", "---\norder: 2\n---\n# A\n"),
      file("b.md", "---\norder: 1\n---\n# B\n"),
    );
    const m = build(root).manifest;
    expect(m.nodes.map((n) => n.slug)).toEqual(["b", "a"]);
    expect(m.nodes.map((n) => n.position)).toEqual([1, 2]);
  });

  it("does NOT read the predecessor's position keys", () => {
    // Reading them would be worse than ignoring them: the site never has, so a
    // record that declared one would be ordered differently on the two surfaces
    // — and the checker would refuse the document anyway.
    const root = dir(
      "docs",
      file("a.md", "---\nposition: 2\n---\n# A\n"),
      file("b.md", "---\nsidebar_position: 1\n---\n# B\n"),
    );
    expect(build(root).manifest.nodes.map((n) => n.slug)).toEqual(["a", "b"]);
  });

  it("orders sections by their index file's `order:`", () => {
    const root = dir(
      "docs",
      dir("zeta", file("index.md", "---\norder: 1\ntitle: Zeta\n---\n"), file("z.md")),
      dir("alpha", file("index.md", "---\norder: 2\ntitle: Alpha\n---\n"), file("a.md")),
    );
    const sections = build(root).manifest.nodes.filter((n) => n.kind === "section");
    expect(sections.map((n) => n.slug)).toEqual(["zeta", "alpha"]);
    expect(sections.map((n) => n.position)).toEqual([1, 2]);
  });

  it("falls back to name order, case PRESERVED, without an order", () => {
    // Case-preserving because the site compares routes and does not fold case;
    // `B` (66) therefore precedes `a` (97). One bytewise truth, both surfaces.
    const root = dir("docs", file("Bravo.md"), file("alpha.md"), file("charlie.md"));
    expect(build(root).manifest.nodes.map((n) => n.slug)).toEqual(["bravo", "alpha", "charlie"]);
  });
});

describe("sections and indexes", () => {
  it("a dir's index.md is the section's own content, not a child", () => {
    const root = dir(
      "docs",
      dir("sect", file("index.md", "---\ntitle: Sect\n---\n"), file("child.md")),
    );
    const { manifest } = build(root);
    const section = manifest.nodes.find((n) => n.kind === "section");
    expect(section?.stable_id).toBe("docs/sect/index");
    expect(section?.title).toBe("Sect");
    const childNode = manifest.nodes.find((n) => n.slug === "child");
    expect(childNode?.parent).toBe("docs/sect/index");
    // index.md appears as the section's file, never as a document node
    expect(manifest.files.map((f) => f.path)).toEqual(["docs/sect/index.md", "docs/sect/child.md"]);
    expect(manifest.nodes.filter((n) => n.slug === "index")).toEqual([]);
  });

  it("two index-named files in one dir fail loud", () => {
    const root = dir("docs", dir("sect", file("index.md"), file("README.md")));
    expect(() => build(root)).toThrow(ManifestError);
    expect(() => build(root)).toThrow(/ambiguous section index/);
  });

  it("a root index.md becomes the corpus landing document at position 0", () => {
    const root = dir("docs", file("index.md", "---\ntitle: Landing\n---\n"), file("a.md"));
    const { manifest } = build(root);
    expect(manifest.nodes[0]).toMatchObject({
      stable_id: "docs/index",
      slug: "docs",
      title: "Landing",
      kind: "document",
      position: 0,
      parent: null,
    });
  });

  it("an ambiguous ROOT index fails loud too", () => {
    const root = dir("docs", file("index.md"), file("README.md"), file("a.md"));
    expect(() => build(root)).toThrow(/ambiguous section index/);
  });

  it("a file and a dir of the same name are refused as a sibling slug collision, named", () => {
    // docs/foo.md and docs/foo/ both want the URL segment 'foo' under docs —
    // the DB's nodes_sibling_uniq would reject them with an opaque error; the
    // manifest refuses first, naming both (review finding #13, 2026-08-19).
    // The canonical "section with an intro" is docs/foo/index.md, not this.
    const root = dir("docs", file("foo.md"), dir("foo", file("child.md")));
    expect(() => build(root)).toThrowError(/sibling slug collision.*foo/s);
  });

  it("two files that slugify to the same name are refused, named", () => {
    const root = dir("docs", file("Getting Started.md"), file("getting-started.md"));
    expect(() => build(root)).toThrowError(/sibling slug collision/);
  });

  it("an index-less section humanizes its dir name for the title", () => {
    const root = dir("docs", dir("power-and-fire", file("a.md")));
    const section = build(root).manifest.nodes.find((n) => n.kind === "section");
    expect(section?.title).toBe("Power And Fire");
  });
});

describe("identity", () => {
  it("frontmatter sor_id wins over the path, trimmed", () => {
    const root = dir("docs", file("a.md", "---\nsor_id: ' custom-a '\n---\n"));
    expect(build(root).manifest.nodes[0]?.stable_id).toBe("custom-a");
  });

  it("path fallback strips only the last suffix; .mdx files keep their path in files[]", () => {
    const root = dir("docs", file("b.mdx", "---\norder: 1\n---\n"), file("a.b.md"));
    const { manifest } = build(root);
    expect(manifest.nodes.map((n) => n.stable_id)).toEqual(["docs/b", "docs/a.b"]);
    expect(manifest.files.map((f) => f.path)).toEqual(["docs/b.mdx", "docs/a.b.md"]);
  });

  it("non-Latin names get stable hash slugs, deterministic across builds", () => {
    const root = dir("docs", file("اردو.md"));
    const one = build(root).manifest.nodes[0]?.slug;
    const two = build(root).manifest.nodes[0]?.slug;
    expect(one, "slug seen: " + JSON.stringify(one)).toBe("x-234d81e4"); // oracle-verified constant
    expect(two).toBe(one);
  });
});

describe("titles", () => {
  it("humanizes filename stems with Python str.title() parity — apostrophe quirk included", () => {
    const root = dir("docs", file("rock'n'roll.md"), file("dont_panic-now.md"));
    const titles = build(root).manifest.nodes.map((n) => n.title);
    expect(titles).toContain("Rock'N'Roll"); // oracle-verified: don't → Don'T
    expect(titles).toContain("Dont Panic Now");
  });

  it("an UNQUOTED title containing ': ' empties the whole meta, like PyYAML's error path", () => {
    const root = dir(
      "docs",
      file("badges.md", "---\ntitle: Rule 10: Machine Badges\nposition: 3\n---\n"),
    );
    const node = build(root).manifest.nodes[0];
    expect(node?.title, "title seen: " + JSON.stringify(node?.title)).toBe("Badges"); // fell back to the stem
  });

  it("a QUOTED title containing ': ' survives", () => {
    const root = dir("docs", file("injuries.md", '---\ntitle: "Rule 30: Injuries"\n---\n'));
    expect(build(root).manifest.nodes[0]?.title).toBe("Rule 30: Injuries");
  });
});

describe("skips — loud, never silent", () => {
  it("hidden and underscore entries are reported and excluded", () => {
    const skips: string[] = [];
    const root = dir(
      "docs",
      file(".hidden.md"),
      file("_draft.md"),
      dir("_notes", file("x.md")),
      file("real.md"),
    );
    const { manifest } = build(root, (l) => skips.push(l));
    expect(skips).toEqual([
      "plain-tree: skipped docs/.hidden.md",
      "plain-tree: skipped docs/_draft.md",
      "plain-tree: skipped docs/_notes",
    ]);
    expect(manifest.files.map((f) => f.path)).toEqual(["docs/real.md"]);
  });

  it("symlinks are skipped loudly and never followed", () => {
    const skips: string[] = [];
    const root = dir("docs", symlink("escape"), file("real.md"));
    const { manifest, sources } = build(root, (l) => skips.push(l));
    expect(skips).toEqual(["plain-tree: skipped docs/escape (symlink)"]);
    expect(manifest.files.map((f) => f.path)).toEqual(["docs/real.md"]);
    expect([...sources.keys()]).toEqual(["docs/real.md"]);
  });

  it("an all-skips tree reports every skip BEFORE failing on emptiness", () => {
    const skips: string[] = [];
    const root = dir("docs", file("_only.md"));
    expect(() => build(root, (l) => skips.push(l))).toThrow(/contains no Markdown/);
    expect(skips).toEqual(["plain-tree: skipped docs/_only.md"]);
  });

  it("an empty tree fails loud", () => {
    expect(() => build(dir("docs"))).toThrow(/contains no Markdown/);
  });
});

describe("output shape", () => {
  it("is deterministic and round-trips the strict parser", () => {
    const root = dir(
      "docs",
      file("index.md", "---\ntitle: Landing\n---\n"),
      dir("sect", file("index.md", "---\nposition: 1\ntitle: Sect\n---\n"), file("child.md")),
    );
    const one = manifestToJson(build(root).manifest);
    const two = manifestToJson(build(root).manifest);
    expect(one).toEqual(two);
  });

  it("maps every manifest path to its source path under rootPath", () => {
    const root = dir("docs", dir("sect", file("index.md"), file("child.md")));
    const { sources } = buildManifestFromTree(root, {
      corpusId: "c",
      sourceCommit: "dev",
      rootPath: "/abs/docs",
      onSkip: () => {},
    });
    expect(Object.fromEntries(sources)).toEqual({
      "docs/sect/index.md": "/abs/docs/sect/index.md",
      "docs/sect/child.md": "/abs/docs/sect/child.md",
    });
  });
});

describe("frontmatterMeta", () => {
  it("reads top-level scalars: quoted, single-quoted, int, float, bool, null", () => {
    const meta = frontmatterMeta(
      "---\ntitle: \"A: B\"\nother: 'it''s'\nposition: 3\nweight: 2.5\ndraft: true\nempty:\n---\nbody",
    );
    expect(meta).toEqual({
      title: "A: B",
      other: "it's",
      position: 3,
      weight: 2.5,
      draft: true,
      empty: null,
    });
  });

  it("returns {} without frontmatter and requires it at byte 0", () => {
    expect(frontmatterMeta("# No fm\n")).toEqual({});
    expect(frontmatterMeta("\n---\ntitle: A\n---\n")).toEqual({});
  });

  it("handles CRLF frontmatter", () => {
    expect(frontmatterMeta("---\r\ntitle: A\r\nposition: 1\r\n---\r\nbody")).toEqual({
      title: "A",
      position: 1,
    });
  });

  it("strips trailing comments from plain scalars", () => {
    expect(frontmatterMeta("---\nposition: 1  # first\n---\n")).toEqual({ position: 1 });
  });

  it("ignores nested structure but keeps the surrounding scalars", () => {
    const meta = frontmatterMeta("---\ntitle: A\nitems:\n  - one\n  - two\n---\n");
    expect(meta["title"]).toBe("A");
  });

  it("poisons the WHOLE meta on YAML PyYAML would refuse", () => {
    expect(frontmatterMeta("---\ntitle: Rule 10: Machine Badges\nposition: 3\n---\n")).toEqual({});
    expect(frontmatterMeta("---\nnot a mapping line\n---\n")).toEqual({});
    // A block scalar is NOT in this list: PyYAML parses it, so the document is
    // valid and only the key is beyond this reader (#78).
    expect(frontmatterMeta("---\ntitle: >\n  folded\n---\n")).toEqual({ title: null });
  });
});

/**
 * Issue #78 — a value this reader does not model is not an invalid document.
 *
 * `scalarValue` refused anything opening with `[ { | > & * !` and the caller
 * treated the refusal as poison, emptying the whole meta. So one YAML list
 * alongside the title took the title with it, and four documents in a real book
 * were served under filename-derived names — "The System of Context: Connecting
 * the Records to Real Work" stored as "System Of Context".
 *
 * The reader is documented as PyYAML-compatible, and PyYAML parses a flow
 * sequence perfectly well. Only what PyYAML would REJECT may empty the meta.
 */
describe("valid YAML this reader does not model keeps the rest (#78)", () => {
  const KEEPS = {
    "a flow sequence": 'authors: ["Panaversity Team"]',
    "a flow mapping": "slides: { height: 700 }",
    "a block scalar": "summary: |",
    "an anchor": "base: &defaults",
  };
  for (const [what, line] of Object.entries(KEEPS)) {
    it(`${what} does not cost the document its title`, () => {
      const meta = frontmatterMeta(
        `---\ntitle: "Preface: The Right Side"\n${line}\norder: 3\n---\n\nbody\n`,
      );
      expect(meta["title"], `meta was emptied by ${what}: ${JSON.stringify(meta)}`).toBe(
        "Preface: The Right Side",
      );
      expect(meta["order"], "and the governed ordering key went with it").toBe(3);
    });
  }

  const POISONS = {
    "an unquoted plain scalar containing ': '": "title: Preface: The Right Side",
    "a key with a trailing colon in its value": "title: Preface:",
  };
  for (const [what, line] of Object.entries(POISONS)) {
    it(`${what} still empties the meta — PyYAML raises there`, () => {
      expect(frontmatterMeta(`---\n${line}\norder: 3\n---\n\nbody\n`)).toEqual({});
    });
  }

  it("the real shape that lost four titles", () => {
    const meta = frontmatterMeta(
      '---\ntitle: "Preface: The Right Side of the Line"\n' +
        'authors: ["Panaversity Team"]\ndate: "2026-07-04"\nsidebar_position: -9\n---\n\nbody\n',
    );
    expect(meta["title"]).toBe("Preface: The Right Side of the Line");
    expect(meta["sidebar_position"], "so #74's warning can see it too").toBe(-9);
  });
});
