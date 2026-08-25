/**
 * A remedy is OBEYED, not read. The scaffold's own skill tells the adopter to
 * "obey the printed fix literally", so a `fix:` line is a paste target: what it
 * prints is what lands in a markdown file.
 *
 * Two of them printed the two characters `\` and `n` where they meant a line
 * break (found 2026-08-26 by a first-hour walkthrough). Obeying either wrote a
 * ONE-LINE file, which the same rule refused again with the same remedy — a
 * loop with no exit, and the checker's only advice was the thing that made it.
 *
 * So the rule these tests hold is not "the string looks right": it is that
 * applying the printed remedy CLEARS the refusal that printed it.
 */
import { describe, expect, it } from "vitest";

import { checkRecord, type RecordFiles } from "./check.js";
import { parseConcept } from "./profile.js";
import { formatRefusal, type Refusal } from "./refusal.js";

const POLICY = `version: "0.1"
audiences:
  internal:
    description: Staff
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

const PUBLIC = `ksor:\n  audience: [public]\n`;
const PARENT = `---\ntype: Document\ntitle: A\ndescription: One sentence.\nstatus: draft\n${PUBLIC}---\n\nBody.\n`;

function record(files: Record<string, string>): RecordFiles {
  return {
    files: new Map(
      Object.entries({ "instance.md": INSTANCE, ".ksor/governance.yaml": POLICY, ...files }),
    ),
    dirs: [],
  };
}

function refusalsFor(files: Record<string, string>): readonly Refusal[] {
  return checkRecord(record(files), { mode: "build", ledgerBaselines: [] }).refusals;
}

/** The two characters a text editor will NOT turn into a line break. */
const ESCAPED_NEWLINE = "\\n";

/**
 * The paste an adopter makes from a printed remedy: everything after the last
 * line of prose, i.e. the trailing block of the fix, de-indented to column 0.
 * `formatRefusal` is what they read, so it is what this reads back.
 */
function pastedBlock(r: Refusal): string {
  const lines = formatRefusal(r)
    .split("\n")
    .map((l) => l.trimEnd());
  const fixAt = lines.findIndex((l) => l.trimStart().startsWith("fix: "));
  expect(fixAt, `no fix: line in\n${formatRefusal(r)}`).toBeGreaterThanOrEqual(0);
  const body = lines.slice(fixAt + 1).map((l) => l.replace(/^ {9}/, ""));
  return `${body.join("\n")}\n`;
}

describe("formatRefusal renders a multi-line remedy as real lines", () => {
  const r: Refusal = {
    slug: "ksor-attachment-frontmatter",
    path: "knowledge/a.summary.md",
    why: "why it exists",
    fix: "write exactly these three lines:\n---\ntype: Summary\n---",
  };

  it("indents every continuation line under the value column, so the paste is unambiguous", () => {
    expect(formatRefusal(r)).toBe(
      "knowledge/a.summary.md\n" +
        "    problem: ksor-attachment-frontmatter\n" +
        "    why: why it exists\n" +
        "    fix: write exactly these three lines:\n" +
        "         ---\n" +
        "         type: Summary\n" +
        "         ---",
    );
  });

  it("leaves a single-line refusal byte-identical — adopters' CI logs read this format", () => {
    const flat: Refusal = { ...r, fix: "delete the key" };
    expect(formatRefusal(flat)).toBe(
      "knowledge/a.summary.md\n" +
        "    problem: ksor-attachment-frontmatter\n" +
        "    why: why it exists\n" +
        "    fix: delete the key",
    );
  });
});

describe("ksor-attachment-frontmatter: obeying the remedy clears it", () => {
  const broken = {
    "knowledge/a.md": PARENT,
    "knowledge/a.summary.md": "---\ntitle: A\ntype: Summary\n---\n\nShort.\n",
  };

  it("prints line breaks, never the two characters that look like one", () => {
    const [r] = refusalsFor(broken);
    expect(r?.slug).toBe("ksor-attachment-frontmatter");
    expect(r?.fix).not.toContain(ESCAPED_NEWLINE);
    expect(r?.fix).toContain("\n");
  });

  it("the pasted block is a summary frontmatter the checker accepts", () => {
    const [r] = refusalsFor(broken);
    expect(r).toBeDefined();
    if (r === undefined) return;
    const fixed = { ...broken, "knowledge/a.summary.md": `${pastedBlock(r)}\nShort.\n` };
    expect(refusalsFor(fixed)).toEqual([]);
  });
});

describe("ksor-audience-missing: obeying the remedy clears it", () => {
  const FM = {
    type: "Document",
    title: "A",
    description: "One sentence.",
    status: "draft",
  } as const;

  it("prints line breaks, never the two characters that look like one", () => {
    const r = parseConcept("knowledge/a.md", { ...FM });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const missing = r.refusals.find((x) => x.slug === "ksor-audience-missing");
    expect(missing?.fix).not.toContain(ESCAPED_NEWLINE);
    expect(missing?.fix).toContain("\n");
  });

  it("the pasted block, appended to the frontmatter, yields a document that passes", () => {
    const r = parseConcept("knowledge/a.md", { ...FM });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const missing = r.refusals.find((x) => x.slug === "ksor-audience-missing");
    expect(missing).toBeDefined();
    if (missing === undefined) return;
    const doc =
      `---\ntype: Document\ntitle: A\ndescription: One sentence.\nstatus: draft\n` +
      `${pastedBlock(missing)}---\n\nBody.\n`;
    expect(refusalsFor({ "knowledge/a.md": doc })).toEqual([]);
  });
});
