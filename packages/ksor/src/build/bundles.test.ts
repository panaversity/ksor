/**
 * The bundle planner (build spec §1 step 4): one OKF bundle per canonical
 * viewer, holding exactly what that viewer's machine surfaces publish — the
 * admitted concepts, their companions, the assets they reference, and indexes
 * regenerated for that filtered tree. Pure: the CLI walks nothing here.
 */
import { describe, expect, it } from "vitest";

import { sha256Hex } from "@panaversity/ksor-content/record";

import { bundleDigest, planBundles, type BundleInput } from "./bundles.js";

const text = (bytes: Uint8Array | undefined): string =>
  bytes === undefined ? "<absent>" : Buffer.from(bytes).toString("utf8");

const doc = (title: string, body: string): string =>
  `---\ntype: Document\ntitle: ${title}\ndescription: ${title}.\nstatus: stable\nksor:\n  audience: [public]\n---\n\n${body}`;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const INPUT: BundleInput = {
  title: "Acme",
  viewers: ["public", "internal"],
  concepts: [
    { id: "welcome", title: "Welcome", description: "Start.", order: 1, admitted: [] },
    {
      id: "policies/board-pay",
      title: "Board pay",
      description: "Pay.",
      order: null,
      admitted: ["internal"],
    },
    {
      id: "policies/purchase-approval",
      title: "Purchase approval",
      description: "Who approves.",
      order: 2,
      admitted: ["internal", "public"],
    },
    {
      id: "policies/old-threshold",
      title: "Old threshold",
      description: "Before.",
      order: null,
      admitted: [],
    },
    {
      id: "notes/memo",
      title: "Memo",
      description: "A memo.",
      order: null,
      admitted: ["internal"],
    },
  ],
  files: new Map([
    ["instance.md", "---\nformat: 2\n---\n"],
    ["knowledge/index.md", "# stale committed map\n"],
    ["knowledge/welcome.md", doc("Welcome", "Start with [board pay](policies/board-pay.md).\n")],
    ["knowledge/welcome.summary.md", "---\ntype: Summary\n---\n\nStart here.\n"],
    [
      "knowledge/policies/board-pay.md",
      doc(
        "Board pay",
        "See [the old threshold](old-threshold.md) and ![the diagram](board-diagram.png).\n",
      ),
    ],
    ["knowledge/policies/board-pay.summary.md", "---\ntype: Summary\n---\n\nBoard pay in short.\n"],
    [
      "knowledge/policies/purchase-approval.md",
      doc("Purchase approval", "A chart: ![shared](/images/shared.png)\n"),
    ],
    ["knowledge/policies/purchase-approval.flashcards.yaml", "cards: []\n"],
    ["knowledge/policies/old-threshold.md", doc("Old threshold", "Superseded.\n")],
    ["knowledge/notes/memo.md", doc("Memo", "Memo body.\n")],
  ]),
  assets: new Map([
    ["knowledge/policies/board-diagram.png", PNG],
    ["knowledge/policies/stray.png", PNG],
    ["knowledge/images/shared.png", PNG],
  ]),
  dirs: ["knowledge/policies", "knowledge/notes", "knowledge/images", "knowledge/empty"],
};

describe("planBundles — one bundle per viewer, in the order given", () => {
  const bundles = planBundles(INPUT);
  const by = (viewer: string) => bundles.find((b) => b.viewer === viewer)!;

  it("names the viewers in the order the lock lists them", () => {
    expect(bundles.map((b) => b.viewer)).toEqual(["public", "internal"]);
  });

  it("the public bundle holds the public concept, its companion, its asset and its indexes — nothing else", () => {
    expect([...by("public").files.keys()].sort()).toEqual([
      "images/shared.png",
      "index.md",
      "policies/index.md",
      "policies/purchase-approval.flashcards.yaml",
      "policies/purchase-approval.md",
    ]);
  });

  it("the internal bundle adds the internal concepts with their companions and referenced assets", () => {
    expect([...by("internal").files.keys()].sort()).toEqual([
      "images/shared.png",
      "index.md",
      "notes/index.md",
      "notes/memo.md",
      "policies/board-diagram.png",
      "policies/board-pay.md",
      "policies/board-pay.summary.md",
      "policies/index.md",
      "policies/purchase-approval.flashcards.yaml",
      "policies/purchase-approval.md",
    ]);
  });

  it("a draft, a deprecated concept, their companions and an unreferenced asset are in no bundle", () => {
    for (const b of bundles) {
      for (const rel of [
        "welcome.md",
        "welcome.summary.md",
        "policies/old-threshold.md",
        "policies/stray.png",
      ]) {
        expect(b.files.has(rel), `${rel} in the ${b.viewer} bundle`).toBe(false);
      }
    }
  });

  it("copies bytes verbatim — frontmatter intact, unknown keys preserved", () => {
    expect(text(by("internal").files.get("policies/board-pay.md"))).toBe(
      INPUT.files.get("knowledge/policies/board-pay.md"),
    );
    expect(by("internal").files.get("policies/board-diagram.png")).toEqual(PNG);
  });

  it("regenerates every index for the FILTERED tree: okf_version at the root, no bullet for what is excluded", () => {
    const root = text(by("public").files.get("index.md"));
    expect(root).toBe('---\nokf_version: "0.2"\n---\n\n# Acme\n\n* [Policies](policies/)\n');
    expect(root).not.toContain("stale committed map");
    expect(text(by("public").files.get("policies/index.md"))).toBe(
      "# Policies\n\n* [Purchase approval](purchase-approval.md) - Who approves.\n",
    );
    // A directory whose every concept is excluded earns no index and no bullet.
    expect(by("public").files.has("notes/index.md")).toBe(false);
    expect(text(by("internal").files.get("index.md"))).toBe(
      '---\nokf_version: "0.2"\n---\n\n# Acme\n\n* [Policies](policies/)\n* [Notes](notes/)\n',
    );
    expect(text(by("internal").files.get("policies/index.md"))).toBe(
      "# Policies\n\n* [Purchase approval](purchase-approval.md) - Who approves.\n* [Board pay](board-pay.md) - Pay.\n",
    );
  });

  it("names a link from an admitted body to a concept this bundle excludes, and nothing else", () => {
    expect(by("public").dangling).toEqual([]);
    expect(by("internal").dangling).toEqual([
      { from: "policies/board-pay.md", to: "policies/old-threshold.md" },
    ]);
  });

  // The trailing blank line is the generator's own shape for a childless
  // directory — what `ksor build` commits for an empty record — kept rather
  // than special-cased here, so the bundle's index is byte-for-byte the record's.
  it("a viewer nothing is admitted to gets a root index with a heading and no bullets", () => {
    const [empty] = planBundles({
      ...INPUT,
      viewers: ["board"],
      concepts: INPUT.concepts.map((c) => ({ ...c, admitted: [] })),
    });
    expect([...empty!.files.keys()]).toEqual(["index.md"]);
    expect(text(empty!.files.get("index.md"))).toBe('---\nokf_version: "0.2"\n---\n\n# Acme\n\n');
  });
});

describe("bundleDigest — sha256 over the sorted (path, sha256) pairs", () => {
  const a = new Map<string, Uint8Array>([
    ["index.md", new Uint8Array([1])],
    ["x.md", new Uint8Array([2])],
  ]);

  it("is the documented algorithm, so a recipient can recompute it", () => {
    const pairs = [
      ["index.md", sha256Hex(new Uint8Array([1]))],
      ["x.md", sha256Hex(new Uint8Array([2]))],
    ];
    expect(bundleDigest(a)).toBe(sha256Hex(JSON.stringify(pairs)));
  });

  it("ignores insertion order and moves with any byte", () => {
    const reversed = new Map([...a].reverse());
    expect(bundleDigest(reversed)).toBe(bundleDigest(a));
    const edited = new Map([...a, ["x.md", new Uint8Array([3])]]);
    expect(bundleDigest(edited)).not.toBe(bundleDigest(a));
  });

  it("is stable across two plans of the same input", () => {
    const [p1] = planBundles(INPUT);
    const [p2] = planBundles(INPUT);
    expect(bundleDigest(p1!.files)).toBe(bundleDigest(p2!.files));
  });
});
