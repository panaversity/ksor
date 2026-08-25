// Integration tier: the adapter against the REAL filesystem — the committed
// demo-rulebook RECORD (profile-shaped: instance, policy, generated indexes,
// lock) vs the golden manifest, plus adversarial trees built in tmp dirs.
//
// The golden's lineage: captured 2026-08-19 from the oracle's build_manifest
// (plain_tree.py @ b554f91) over the oracle-shaped fixture, and REGENERATED
// 2026-08-25 when the record moved to the KSoR Profile of OKF (decision 26),
// because the identity model changed by decision, not by drift: every
// directory is now the `#section` shell (the `<dir>/index` identity is
// retired, a generated `index.md` creates no node), section prose became
// `overview.md`, and governance is projected from the profile. What the oracle
// fixed and this still holds is asserted below: one node per concept, one per
// directory, positions dense per sibling set, sources for every file.
//
// REGENERATED again the same day, for the reading-order rule (decision 18):
// this fixture WAS the divergence. Its committed `knowledge/index.md` listed
// `overview.md` first and the three folders after it, while the adapter — which
// took a folder's key from the folder's own concepts, all of them `order: 0` —
// sorted the three sections ahead of it. Site first, door last, same record.
// The fixture's folder documents are renumbered 10/20/30 so the ROOT order it
// always meant is now something it says; the order inside each folder, and
// every position within a sibling set, is unchanged.

import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { checkRecord } from "../../record/check.js";
import { loadRecord } from "../../record/load.js";
import { profileDoc, writeRecord } from "../fixtures/record-fixture.js";
import { loadManifest, manifestToJson } from "../manifest.js";
import { buildManifestFromRecord, type PlainTreeResult } from "./plain-tree.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures", "record");
const DEMO = join(FIXTURES, "demo-rulebook");
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

function adapt(root: string, corpusId = "c"): PlainTreeResult {
  const record = loadRecord(root);
  const check = checkRecord(record, { mode: "check" });
  if (check.refusals.length > 0) throw new Error(JSON.stringify(check.refusals, null, 2));
  return buildManifestFromRecord(check, record.dirs, { corpusId, sourceCommit: "dev" });
}

/** The adapter on a tree the checker refuses — the second line of defence, asserted on its own. */
function adaptUnchecked(
  root: string,
  corpusId = "c",
): { result: PlainTreeResult; slugs: string[] } {
  const record = loadRecord(root);
  const check = checkRecord(record, { mode: "check" });
  return {
    result: buildManifestFromRecord(check, record.dirs, { corpusId, sourceCommit: "dev" }),
    slugs: check.refusals.map((r) => r.slug),
  };
}

describe("demo-rulebook golden", () => {
  it("reproduces the golden manifest byte-for-byte (as JSON values)", async () => {
    const { manifest } = adapt(DEMO, "demo.workshop-rulebook");
    const golden: unknown = JSON.parse(await readFile(GOLDEN, "utf8"));
    expect(manifestToJson(manifest)).toEqual(golden);
  });

  it("the committed fixture passes the checker in check mode — its indexes are fresh", () => {
    const check = checkRecord(loadRecord(DEMO), { mode: "check" });
    expect(check.refusals).toEqual([]);
  });

  it("walks 3 sections and 10 documents, one file per document, none for an index", () => {
    const { manifest, sources } = adapt(DEMO);
    const sections = manifest.nodes.filter((n) => n.kind === "section");
    expect(sections.map((s) => s.stable_id)).toEqual([
      "knowledge/emergencies#section",
      "knowledge/getting-certified#section",
      "knowledge/machine-rules#section",
    ]);
    // 2, 3, 4: the root `overview.md` is position 1 on BOTH surfaces now.
    expect(sections.map((s) => s.position)).toEqual([2, 3, 4]);
    expect(manifest.nodes.filter((n) => n.kind === "document")).toHaveLength(10);
    expect(manifest.files).toHaveLength(10);
    expect([...sources.keys()].some((p) => p.endsWith("index.md"))).toBe(false);
    const badges = manifest.nodes.find((n) => n.slug === "badges");
    expect(badges?.parent).toBe("knowledge/getting-certified#section");
    expect(badges?.title).toBe("Rule 10: Machine Badges");
    expect(badges?.stable_id).toBe("knowledge/getting-certified/badges");
    expect(badges?.governance.audience).toEqual(["public"]);
    expect(badges?.governance.docStatus).toBe("stable");
  });

  it("maps every manifest path to a readable source file under the record", async () => {
    const { manifest, sources } = adapt(DEMO);
    expect([...sources.keys()].sort()).toEqual(manifest.files.map((f) => f.path).sort());
    for (const [manifestPath, rel] of sources) {
      const text = await readFile(join(DEMO, rel), "utf8");
      expect(text.length, `${manifestPath} -> ${rel} is empty`).toBeGreaterThan(0);
    }
  });

  it("is deterministic across builds", () => {
    expect(manifestToJson(adapt(DEMO).manifest)).toEqual(manifestToJson(adapt(DEMO).manifest));
  });
});

describe("adversarial trees", () => {
  it("symlinks are never followed — a link cannot walk OUT of the tree or cycle it", async () => {
    const tmp = await makeTmp();
    const outside = join(tmp, "outside");
    await mkdir(outside);
    await writeFile(
      join(outside, "secret.md"),
      profileDoc({ title: "Leak", body: "not corpus material" }),
    );
    const root = join(tmp, "rec");
    writeRecord(root, {
      name: "rec",
      docs: { "real.md": profileDoc({ title: "Real", body: "body" }) },
    });
    await symlink(outside, join(root, "knowledge", "escape"));
    await symlink(join(root, "knowledge"), join(root, "knowledge", "loop"));
    await symlink(join(outside, "secret.md"), join(root, "knowledge", "linked.md"));

    // Two guarantees: a record may not CARRY a symlink (it must survive being
    // copied anywhere), and the loader still never follows one if a tree
    // reaches the adapter another way.
    const { result, slugs } = adaptUnchecked(root);
    expect(new Set(slugs)).toEqual(new Set(["ksor-symlink"]));
    const { manifest, sources } = result;
    expect(manifest.files.map((f) => f.path)).toEqual(["knowledge/real.md"]);
    expect([...sources.values()].every((p) => !p.includes("secret"))).toBe(true);
    expect(manifest.nodes.map((n) => n.stable_id)).toEqual(["knowledge/real"]);
  });

  it("a reserved name is refused by the checker, not silently taken as a section's content", async () => {
    const tmp = await makeTmp();
    const root = join(tmp, "rec");
    writeRecord(root, {
      name: "rec",
      docs: {
        "sect/child.md": profileDoc({ title: "Child", body: "body" }),
        "sect/README.md": "# B\n\ntwo\n",
      },
    });
    const check = checkRecord(loadRecord(root), { mode: "build" });
    expect(check.refusals.map((r) => `${r.slug} ${r.path}`)).toEqual([
      "ksor-reserved-name knowledge/sect/README.md",
    ]);
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

describe("study attachments are not nodes", () => {
  it("neither a summary nor a deck becomes a document; a document merely named like one is", async () => {
    const tmp = await makeTmp();
    const root = join(tmp, "rec");
    writeRecord(root, {
      name: "rec",
      docs: {
        "pay.md": profileDoc({ title: "Pay", body: "How pay is set." }),
        "pay.summary.md": "---\ntype: Summary\n---\nPay is set annually.\n",
        "pay.flashcards.yaml": "deck:\n  title: Pay\ncards: []\n",
        "summary.md": profileDoc({ title: "Summary", body: "A real document." }),
        "my-summary.md": profileDoc({ title: "Mine", body: "Also real." }),
      },
    });
    const ids = adapt(root).manifest.nodes.map((n) => n.stable_id);
    expect(ids.sort()).toEqual(["knowledge/my-summary", "knowledge/pay", "knowledge/summary"]);
  });
});
