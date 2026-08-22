/**
 * The site's id and the kernel's id must be the SAME id.
 *
 * `denial-rule-drift.test.ts` proves the scaffold's copy matches the kernel's
 * copy — but both copies could be wrong together, and they were: the leaf read
 * `sor_id:` with a bare regex while the kernel reads it out of a map that comes
 * back EMPTY if any top-level line is a shape its scalar reader refuses. A
 * document carrying an ordinary flow list therefore had two different
 * stable_ids, so a takedown was honoured by the MCP door and ignored by the
 * site build (round-9 review of #43).
 *
 * So this binds the leaf to the kernel's ACTUAL reader, not to a copy of it —
 * the same relationship `AUDIENCE_CASES` gives the audience rule. Every case is
 * a frontmatter block; both readers must agree on the id that comes out.
 */

import { describe, expect, it } from "vitest";

import { frontmatterMeta, stableIdOf } from "../ingest/adapters/plain-tree.js";
import { frontmatterMap, stableIdFrom } from "./denial-rule.js";

const RECORD = "knowledge";
const REL = "policies/policy.md";
const SEGS = ["policies", "policy.md"] as const;

const doc = (frontmatter: string): string => `---\n${frontmatter}\n---\n\nBody text.\n`;
const blockOf = (text: string): string =>
  /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(text)?.[1] ?? "";

const CASES: readonly { name: string; frontmatter: string }[] = [
  { name: "no override", frontmatter: "title: Policy" },
  { name: "a plain override", frontmatter: "title: Policy\nsor_id: hr/policy" },
  { name: "a quoted override", frontmatter: `title: Policy\nsor_id: "hr/policy"` },
  { name: "an override with a trailing comment", frontmatter: "sor_id: hr/policy # renamed" },
  { name: "an empty override", frontmatter: "title: Policy\nsor_id:" },
  {
    // The case that diverged: a flow list poisons the kernel's whole map, so
    // the override is dropped and the id falls back to the path.
    name: "an override beside a FLOW LIST",
    frontmatter: "title: Policy\ntags: [hr, payroll]\nsor_id: hr/policy",
  },
  {
    name: "an override beside a flow MAP",
    frontmatter: "title: Policy\nmeta: {a: 1}\nsor_id: hr/policy",
  },
  {
    name: "an override beside an unquoted value containing ': '",
    frontmatter: "title: Note: quoting\nsor_id: hr/policy",
  },
  {
    name: "an override beside a BLOCK scalar",
    frontmatter: "summary: |\n  multi line\nsor_id: hr/policy",
  },
  {
    name: "an override beside a nested block",
    frontmatter: "owner:\n  name: HR\nsor_id: hr/policy",
  },
  { name: "an override beside a comment line", frontmatter: "# a note\nsor_id: hr/policy" },
  // Values the kernel TYPES rather than returning as strings, so `stableIdOf`
  // drops the override and falls back to the path. The site returned them as
  // strings (round-10 review of #43).
  { name: "a NUMERIC override", frontmatter: "sor_id: 4711" },
  { name: "a FLOAT override", frontmatter: "sor_id: 1.5" },
  { name: "a YAML-BOOLEAN override (no)", frontmatter: "sor_id: no" },
  { name: "a YAML-boolean override (true)", frontmatter: "sor_id: true" },
  { name: "a NULL override", frontmatter: "sor_id: ~" },
  // …and a quoted number IS a string, on both sides.
  { name: "a QUOTED numeric override is an id", frontmatter: `sor_id: "4711"` },
  { name: "an override beside a blank line", frontmatter: "title: Policy\n\nsor_id: hr/policy" },
];

describe("one stable_id, both surfaces", () => {
  it.each(CASES)("$name", ({ frontmatter }) => {
    const text = doc(frontmatter);
    const kernel = stableIdOf(RECORD, SEGS, frontmatterMeta(text));
    const site = stableIdFrom(RECORD, REL, blockOf(text));
    expect(
      site,
      `the kernel resolves ${JSON.stringify(kernel)} and the site ${JSON.stringify(site)} — ` +
        "a takedown on either id lands on exactly one surface",
    ).toBe(kernel);
  });

  it("the map readers agree on every STRING-valued key", () => {
    // The comparison is over string values, not raw keys: the kernel types a
    // bool/null/int/float and keeps the key with a non-string value, while this
    // map holds strings only. What both sides must agree on is which keys yield
    // a STRING and what that string is — everything downstream (ids, taken-down
    // paths) reads strings.
    for (const { name, frontmatter } of CASES) {
      const text = doc(frontmatter);
      const kernelStrings = Object.fromEntries(
        Object.entries(frontmatterMeta(text)).filter(([, v]) => typeof v === "string"),
      );
      expect(frontmatterMap(blockOf(text)), name).toEqual(kernelStrings);
    }
  });

  it("a flow list no longer costs the document its override (#78)", () => {
    // This used to assert the opposite, and the opposite was the defect: the
    // kernel emptied the whole map, so `sor_id:` was dropped and the id fell
    // back to the path. A flow list is valid YAML; the override now stands, and
    // BOTH readers take it — which is the property this file exists to hold.
    const text = doc("title: Policy\ntags: [hr, payroll]\nsor_id: hr/policy");
    expect(frontmatterMeta(text)["sor_id"], "the kernel keeps the override").toBe("hr/policy");
    expect(stableIdFrom(RECORD, REL, blockOf(text)), "and so does the site").toBe("hr/policy");
  });

  it("a GENUINELY poisoned map still drops the override on both sides", () => {
    // The control that keeps the table honest: if nothing poisoned any more,
    // every case would be trivially equal and this file would prove nothing.
    // An unquoted value carrying ": " is what PyYAML actually rejects.
    const text = doc("title: Note: quoting\nsor_id: hr/policy");
    expect(Object.keys(frontmatterMeta(text)), "the kernel drops the whole map").toEqual([]);
    expect(
      stableIdFrom(RECORD, REL, blockOf(text)),
      "so BOTH fall back to the path-derived id",
    ).toBe("knowledge/policies/policy");
  });
});
