/**
 * Reading order is ONE rule (decision 18). This file asserts the kernel half:
 * the rule itself against every row of the decision table, and then the record
 * adapter — the code that decides what the MCP door's `outline` reports —
 * against the same rows, so a surface that drifts fails on the ROW it broke.
 *
 * The SITE's half is here too, and it is the index GENERATOR: every human
 * surface of the site ranks by `readingOrder(stagedIndexes())`, which walks the
 * bullets `generateIndexes` writes and re-sorts nothing. So asserting the
 * generated bullet order against these rows asserts the sidebar, the folder
 * pages, `llms.txt` and the twins — the whole site side of decision 18.
 */

import { describe, expect, it } from "vitest";

import { buildManifestFromRecord } from "../ingest/adapters/plain-tree.js";
import { checkRecord, type CheckResult, type RecordFiles } from "../record/check.js";
import { generateIndexes, parseIndex, type IndexConcept } from "../record/index-file.js";
import { ORDER_CASES, type OrderCase } from "./order-conformance.js";
import { compareSiblings, orderValue, tieKey, UNORDERED } from "./order-rule.js";

const POLICY = `version: "0.1"\napproval_authorities:\n  - actors: [human:cfo]\ntakedown_authorities:\n  actors: [human:ciso]\n`;
const INSTANCE = `---\nformat: 2\nname: acme\ntitle: Acme\ndescription: D.\n---\n`;

/**
 * One entry's frontmatter, written the way an author writes it. A STRING order
 * is emitted quoted: `order: 2` is a YAML number, so writing a string
 * unquoted would silently turn the "a numeric string is an order" row into the
 * number row and assert nothing about strings at all.
 */
function docText(order: unknown): string {
  const declared =
    order === undefined
      ? ""
      : `\norder: ${typeof order === "string" ? JSON.stringify(order) : String(order)}`;
  return `---\ntype: Document\ntitle: T\ndescription: D.\nstatus: draft${declared}\nksor:\n  audience: [public]\n---\n\nBody text for an ordering fixture.\n`;
}

/**
 * A directory entry is a folder holding ONE concept that carries the order, at
 * `depth` levels below it; a document entry is itself.
 */
function recordFor(kase: OrderCase): RecordFiles {
  const files = new Map<string, string>([
    ["instance.md", INSTANCE],
    [".ksor/governance.yaml", POLICY],
  ]);
  const dirs: string[] = [];
  for (const e of kase.entries) {
    if (e.file.endsWith(".md")) {
      files.set(`knowledge/${e.file}`, docText(e.order));
      continue;
    }
    let dir = e.file;
    dirs.push(`knowledge/${dir}`);
    for (let level = 1; level < (e.depth ?? 1); level += 1) {
      dir = `${dir}/inner`;
      dirs.push(`knowledge/${dir}`);
    }
    files.set(`knowledge/${dir}/only.md`, docText(e.order));
  }
  return { files, dirs };
}

/** The concepts `generateIndexes` takes, as `checkRecord` hands them over. */
function conceptsOf(check: CheckResult): IndexConcept[] {
  return check.concepts.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    order: c.order,
  }));
}

describe("the reading-order rule, row by row", () => {
  it.each(ORDER_CASES)("$name", (kase) => {
    const sorted = [...kase.entries]
      .map((e) => ({ file: e.file, order: orderValue(e.order), tie: tieKey(e.file) }))
      .sort(compareSiblings)
      .map((s) => s.file);
    expect(sorted, kase.why).toEqual([...kase.expected]);
  });
});

/** The profile declares `order` a number: a non-numeric one is REFUSED upstream, never sorted. */
const numeric = (kase: OrderCase): boolean =>
  kase.entries.every((e) => e.order === undefined || typeof e.order === "number");

/**
 * A path is an identity, so the profile refuses one that is not portable —
 * uppercase collides on a case-insensitive filesystem. A case where the tie
 * key is the only thing separating two names therefore cannot occur in a
 * conformant record; the RULE still binds both implementations, so the case
 * stays in the table and is asserted through the adapter below.
 */
const portable = (kase: OrderCase): boolean =>
  kase.entries.every((e) => /^[a-z0-9][a-z0-9.-]*$/.test(e.file));

describe("the MCP door's outline follows that rule — the adapter's own sort", () => {
  it("a non-numeric order never reaches the adapter: the checker refuses it by name", () => {
    for (const kase of ORDER_CASES.filter((k) => !numeric(k))) {
      const slugs = checkRecord(recordFor(kase), {
        mode: "build",
        ledgerBaselines: [],
      }).refusals.map((r) => r.slug);
      expect(slugs, kase.name).toContain("ksor-frontmatter-invalid");
    }
  });

  it("an unportable name never reaches a record: the checker refuses it by name", () => {
    const cases = ORDER_CASES.filter((k) => numeric(k) && !portable(k));
    expect(cases.length, "the table lost its unportable case").toBeGreaterThan(0);
    for (const kase of cases) {
      const slugs = checkRecord(recordFor(kase), {
        mode: "build",
        ledgerBaselines: [],
      }).refusals.map((r) => r.slug);
      expect(slugs, kase.name).toContain("ksor-name-unportable");
    }
  });

  it.each(ORDER_CASES.filter(numeric))("$name", (kase) => {
    const record = recordFor(kase);
    const check = checkRecord(record, { mode: "build", ledgerBaselines: [] });
    if (portable(kase)) {
      expect(check.refusals, "the fixture must pass the checker").toEqual([]);
    }
    const { manifest } = buildManifestFromRecord(check, record.dirs, {
      corpusId: "c",
      sourceCommit: "0".repeat(40),
    });
    // One root node per sibling: a document is `knowledge/<stem>`, a directory
    // is `knowledge/<name>#section` — both carry the sibling rank in `position`.
    const stems = kase.entries.map((e) => e.file.replace(/\.mdx?$/, ""));
    const nodeFor = (stem: string): { position: number } => {
      const node = manifest.nodes.find(
        (n) =>
          n.parent === null &&
          (n.stable_id === `knowledge/${stem}` || n.stable_id === `knowledge/${stem}#section`),
      );
      if (node === undefined) {
        throw new Error(
          `fixture built wrong: no node for ${stem} in ${JSON.stringify(
            manifest.nodes.map((n) => n.stable_id),
          )}`,
        );
      }
      return node;
    };
    const seen = [...stems].sort((a, b) => nodeFor(a).position - nodeFor(b).position);
    const positions = stems.map((s) => nodeFor(s).position).sort((a, b) => a - b);
    expect(positions, "sibling positions must be distinct and dense").toEqual(
      stems.map((_, i) => i + 1),
    );
    expect(seen, kase.why).toEqual(kase.expected.map((f) => f.replace(/\.mdx?$/, "")));
  });
});

describe("the WEBSITE's reading order follows that rule — the index generator's bullets", () => {
  it.each(ORDER_CASES.filter(numeric))("$name", (kase) => {
    const record = recordFor(kase);
    const check = checkRecord(record, { mode: "build", ledgerBaselines: [] });
    const indexes = generateIndexes({
      title: "Acme",
      concepts: conceptsOf(check),
      dirs: record.dirs.map((d) => d.slice("knowledge/".length)),
    });
    // The root index's bullets, in the order the site walks them: `name/` for a
    // folder, `name.md` for a concept.
    const seen = parseIndex(indexes.get("index.md") ?? "").map((entry) =>
      entry.href.endsWith("/") ? entry.href.slice(0, -1) : entry.href.replace(/\.mdx?$/, ""),
    );
    expect(seen, kase.why).toEqual(kase.expected.map((f) => f.replace(/\.mdx?$/, "")));
  });
});

describe("UNORDERED is the absence of an order, not a large one", () => {
  it("is greater than any order an author could plausibly declare", () => {
    expect(UNORDERED).toBe(Number.POSITIVE_INFINITY);
    expect(orderValue(Number.MAX_SAFE_INTEGER) < UNORDERED).toBe(true);
  });
});
