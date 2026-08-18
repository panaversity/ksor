// Integration tier: the adapter against the REAL filesystem — the committed
// demo-rulebook fixture vs the ORACLE-captured golden manifest, plus symlink
// adversarial trees that cannot be committed portably (built in tmp dirs).
// Golden captured 2026-08-19 by running the oracle's build_manifest
// (plain_tree.py @ b554f91) over the exact committed fixture tree.

import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { loadManifest, manifestToJson } from "../manifest.js";
import { buildManifest } from "./plain-tree.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures", "plain-tree");
const DEMO_DOCS = join(FIXTURES, "demo-rulebook", "docs");
const GOLDEN = join(FIXTURES, "demo-rulebook.manifest.json");

const tmpDirs: string[] = [];

async function makeTmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "plain-tree-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("demo-rulebook golden", () => {
  it("reproduces the oracle's manifest byte-for-byte (as JSON values)", async () => {
    const skips: string[] = [];
    const { manifest } = await buildManifest(DEMO_DOCS, {
      corpusId: "demo.workshop-rulebook",
      sourceCommit: "dev",
      onSkip: (l) => skips.push(l),
    });
    const golden: unknown = JSON.parse(await readFile(GOLDEN, "utf8"));
    expect(manifestToJson(manifest)).toEqual(golden);
    expect(skips, "unexpected skips: " + JSON.stringify(skips)).toEqual([]);
  });

  it("walks sections in position order with 7 documents and 10 files", async () => {
    const { manifest } = await buildManifest(DEMO_DOCS, { corpusId: "c", sourceCommit: "dev" });
    const sections = manifest.nodes.filter((n) => n.kind === "section");
    expect(sections.map((s) => s.slug)).toEqual([
      "getting-certified",
      "machine-rules",
      "emergencies",
    ]);
    expect(sections.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(manifest.nodes.filter((n) => n.kind === "document")).toHaveLength(7); // 6 rules + root landing
    expect(manifest.files).toHaveLength(10); // 6 rules + 3 section indexes + root landing
    const badges = manifest.nodes.find((n) => n.slug === "badges");
    expect(badges?.parent).toContain("getting-certified");
    expect(badges?.title).toBe("Rule 10: Machine Badges");
    expect(
      badges?.stable_id.startsWith("docs/"),
      "stable_id: " + JSON.stringify(badges?.stable_id),
    ).toBe(true);
  });

  it("maps every manifest path to a readable source file", async () => {
    const { manifest, sources } = await buildManifest(DEMO_DOCS, {
      corpusId: "c",
      sourceCommit: "dev",
    });
    expect([...sources.keys()].sort()).toEqual(manifest.files.map((f) => f.path).sort());
    for (const [manifestPath, sourcePath] of sources) {
      const text = await readFile(sourcePath, "utf8");
      expect(text.length, `${manifestPath} -> ${sourcePath} is empty`).toBeGreaterThan(0);
    }
  });

  it("is deterministic across builds", async () => {
    const one = await buildManifest(DEMO_DOCS, { corpusId: "c", sourceCommit: "dev" });
    const two = await buildManifest(DEMO_DOCS, { corpusId: "c", sourceCommit: "dev" });
    expect(manifestToJson(one.manifest)).toEqual(manifestToJson(two.manifest));
  });
});

describe("adversarial trees", () => {
  it("symlinks can neither walk OUT of the tree nor cycle it — skipped loudly", async () => {
    const tmp = await makeTmp();
    const outside = join(tmp, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "secret.md"), "# Leak\n\nnot corpus material\n", "utf8");
    const root = join(tmp, "docs");
    await mkdir(root);
    await writeFile(join(root, "real.md"), "# Real\n\nbody\n", "utf8");
    await symlink(outside, join(root, "escape"));
    await symlink(root, join(root, "loop"));

    const skips: string[] = [];
    const { manifest, sources } = await buildManifest(root, {
      corpusId: "c",
      sourceCommit: "dev",
      onSkip: (l) => skips.push(l),
    });
    expect(manifest.files.map((f) => f.path)).toEqual(["docs/real.md"]);
    expect([...sources.values()].every((p) => !p.includes("secret"))).toBe(true);
    expect(skips.sort()).toEqual([
      `plain-tree: skipped ${join(root, "escape")} (symlink)`,
      `plain-tree: skipped ${join(root, "loop")} (symlink)`,
    ]);
  });

  it("a symlinked index.md is never followed (skipped, section stays index-less)", async () => {
    const tmp = await makeTmp();
    const root = join(tmp, "docs");
    await mkdir(join(root, "sect"), { recursive: true });
    await writeFile(join(root, "elsewhere.txt"), "---\ntitle: Sneaky\n---\n# Nope\n", "utf8");
    await writeFile(join(root, "sect", "child.md"), "# Child\n\nbody\n", "utf8");
    await symlink(join(root, "elsewhere.txt"), join(root, "sect", "index.md"));

    const skips: string[] = [];
    const { manifest } = await buildManifest(root, {
      corpusId: "c",
      sourceCommit: "dev",
      onSkip: (l) => skips.push(l),
    });
    const section = manifest.nodes.find((n) => n.kind === "section");
    expect(section?.stable_id, "section: " + JSON.stringify(section)).toBe("docs/sect#section");
    expect(section?.title).toBe("Sect"); // humanized, not the symlink target's frontmatter
    expect(skips).toEqual([`plain-tree: skipped ${join(root, "sect", "index.md")} (symlink)`]);
  });

  it("two index files in one dir fail loud on the real filesystem too", async () => {
    const tmp = await makeTmp();
    const root = join(tmp, "docs");
    await mkdir(join(root, "sect"), { recursive: true });
    await writeFile(join(root, "sect", "index.md"), "# A\n\none\n", "utf8");
    await writeFile(join(root, "sect", "README.md"), "# B\n\ntwo\n", "utf8");
    await expect(buildManifest(root, { corpusId: "c", sourceCommit: "dev" })).rejects.toThrow(
      /ambiguous section index/,
    );
  });

  it("a missing or non-directory root fails loud", async () => {
    const tmp = await makeTmp();
    await expect(
      buildManifest(join(tmp, "nope"), { corpusId: "c", sourceCommit: "dev" }),
    ).rejects.toThrow(/is not a directory/);
    const filePath = join(tmp, "file.md");
    await writeFile(filePath, "# F\n", "utf8");
    await expect(buildManifest(filePath, { corpusId: "c", sourceCommit: "dev" })).rejects.toThrow(
      /is not a directory/,
    );
  });
});

describe("loadManifest", () => {
  it("reads manifest.json from a bundle dir and equals the golden", async () => {
    const tmp = await makeTmp();
    await writeFile(join(tmp, "manifest.json"), await readFile(GOLDEN, "utf8"), "utf8");
    const manifest = await loadManifest(tmp);
    expect(manifestToJson(manifest)).toEqual(JSON.parse(await readFile(GOLDEN, "utf8")));
  });
});
