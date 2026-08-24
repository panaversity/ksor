/**
 * Reading order is ONE rule (decision 18). This file asserts the kernel half:
 * the rule itself against every row of the decision table, and then the record
 * adapter — the code that decides what the MCP door's `outline` reports —
 * against the same rows, so a surface that drifts fails on the ROW it broke.
 *
 * The site half runs in `packages/ksor/src/order-conformance.integration.test.ts`
 * against the scaffold's copy of the same table.
 */

import { describe, expect, it } from "vitest";

import { buildManifestFromRecord } from "../ingest/adapters/plain-tree.js";
import { checkRecord, type RecordFiles } from "../record/check.js";
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

/** A directory entry is a folder holding ONE concept that carries the order; a document entry is itself. */
function recordFor(kase: OrderCase): RecordFiles {
  const files = new Map<string, string>([
    ["instance.md", INSTANCE],
    [".ksor/governance.yaml", POLICY],
  ]);
  const dirs: string[] = [];
  for (const e of kase.entries) {
    if (e.file.endsWith(".md")) files.set(`knowledge/${e.file}`, docText(e.order));
    else {
      dirs.push(`knowledge/${e.file}`);
      files.set(`knowledge/${e.file}/only.md`, docText(e.order));
    }
  }
  return { files, dirs };
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

describe("the MCP door's outline follows that rule — the adapter's own sort", () => {
  it("a non-numeric order never reaches the adapter: the checker refuses it by name", () => {
    for (const kase of ORDER_CASES.filter((k) => !numeric(k))) {
      const slugs = checkRecord(recordFor(kase), { mode: "build" }).refusals.map((r) => r.slug);
      expect(slugs, kase.name).toContain("ksor-frontmatter-invalid");
    }
  });

  it.each(ORDER_CASES.filter(numeric))("$name", (kase) => {
    const record = recordFor(kase);
    const check = checkRecord(record, { mode: "build" });
    expect(check.refusals, "the fixture must pass the checker").toEqual([]);
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

describe("UNORDERED is the absence of an order, not a large one", () => {
  it("is greater than any order an author could plausibly declare", () => {
    expect(UNORDERED).toBe(Number.POSITIVE_INFINITY);
    expect(orderValue(Number.MAX_SAFE_INTEGER) < UNORDERED).toBe(true);
  });
});
