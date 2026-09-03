/**
 * The shipped `verify.mjs` — the floor under model-driven conversion.
 *
 * Issue #31 names the hazard it exists for: a model converting a document is
 * highest-fidelity for layout and LOWEST for exact values, and add-sources'
 * own rule is "copy load-bearing values exactly". Before this script that
 * rule was prose the model was asked to follow. Now it is a check the agent
 * runs, and this file is what the check is held to.
 *
 * Run as the skill runs it — a subprocess over real files — because the
 * script ships into the adopter's repo as plain Node and is invoked from a
 * shell, never imported. Every case here was chosen from a real false positive
 * or false negative seen while walking a conversion (2026-09-02): case in
 * headings, PDF line-wrap, footnote ids, the agent's own frontmatter.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const VERIFY = path.resolve(
  here,
  "..",
  "templates",
  "scaffold",
  ".agents",
  "skills",
  "add-sources",
  "verify.mjs",
);

let dir = "";
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ksor-verify-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Result {
  readonly status: number | null;
  readonly missing: readonly string[];
}

let n = 0;
function verify(extraction: string, document: string): Result {
  n += 1;
  const ex = path.join(dir, `ex-${n}.txt`);
  const doc = path.join(dir, `doc-${n}.md`);
  writeFileSync(ex, extraction);
  writeFileSync(doc, document);
  const r = spawnSync(process.execPath, [VERIFY, ex, doc], { encoding: "utf8" });
  return {
    status: r.status,
    missing: r.stdout.split("\n").filter((l) => l !== ""),
  };
}

const SOURCE = `REFUNDS POLICY
Finance policy manual §4.2, 2025 edition

A customer may return an item within 30 days of delivery with proof of
purchase. Refunds are issued within 5 working days. A purchase above
10,000 needs a director's signature. Approved by Jane Doe, Head of
Operations, on 2025-03-01.
`;

const DOC = `---
type: Policy
title: Refund policy (rev 7)
description: Written up by Agent Smith from the 2025 manual.
status: draft
sources:
  - id: fin-2025
    title: Finance policy manual §4.2, 2025 edition
    resource: https://intranet.example.com/finance/manual.pdf
ksor:
  owner: team:finance
  audience: [public]
---

## Returns

A customer may return an item within **30 days** of delivery with proof of
purchase.[^fin-2025] Refunds are issued within 5 working days. A purchase
above 10,000 needs a director's signature.

Approved by Jane Doe, Head of Operations, on 2025-03-01.

[^fin-2025]: Finance policy manual §4.2, 2025 edition.
`;

describe("a faithful conversion passes", () => {
  it("every number, date and name in the body is in the extraction", () => {
    const r = verify(SOURCE, DOC);
    expect(r.missing, "nothing should be reported").toEqual([]);
    expect(r.status).toBe(0);
  });

  it("frontmatter is exempt — the title, description and source id are the agent's words", () => {
    // `rev 7`, `Agent Smith`, `fin-2025` and the URL appear nowhere in the
    // source, by design. A check that flagged them would train the agent to
    // stop writing descriptions.
    const r = verify(SOURCE, DOC);
    expect(r.missing).not.toContain("7");
    expect(r.missing).not.toContain("Agent Smith");
  });

  it("footnote labels and definition prefixes are exempt — they are ids", () => {
    // `[^fin-2025]` carries 2025, which happens to be in this source; make
    // the id something that is NOT, and it must still pass.
    const doc = DOC.replaceAll("fin-2025", "src-9999");
    const r = verify(SOURCE, doc);
    expect(r.missing, "an id is not a claim about the source").toEqual([]);
  });

  it("matches case-folded — an extraction shouts its headings", () => {
    const r = verify(
      "REFUNDS POLICY\nApproved by JANE DOE.",
      "---\ntitle: x\n---\nRefunds Policy, approved by Jane Doe.",
    );
    expect(r.missing).toEqual([]);
  });

  it("a heading above a capitalised paragraph is not a name (found live on 0.0.59)", () => {
    // `\s+` crossed the blank line, so `## Meals` followed by a paragraph
    // opening `On travel…` was extracted as the name "Meals On" and reported
    // as invented — a false positive on ordinary markdown, hit on the first
    // document an agent produces.
    const r = verify(
      "Meals cost 75 per day while travelling.",
      "---\ntitle: x\n---\n\n## Meals\n\nOn travel, 75 per day.\n",
    );
    expect(r.missing, "a heading and the next paragraph are not one name").toEqual([]);
    expect(r.status).toBe(0);
  });

  it("still catches a name the source never mentions, in that same shape", () => {
    const r = verify(
      "Meals cost 75 per day while travelling.",
      "---\ntitle: x\n---\n\n## Meals\n\nOn travel, 75 per day. Approved by John Roe.\n",
    );
    expect(r.missing).toEqual(["John Roe"]);
  });

  it("matches with whitespace collapsed — an extraction wraps its lines", () => {
    const r = verify(
      "approved by Jane\nDoe, Head of\nOperations",
      "---\ntitle: x\n---\nApproved by Jane Doe, Head of Operations.",
    );
    expect(r.missing).toEqual([]);
  });
});

describe("a changed or invented value fails, and is named", () => {
  it("a number the agent rounded", () => {
    const r = verify(SOURCE, DOC.replace("30 days", "45 days"));
    expect(r.status).toBe(1);
    expect(r.missing).toEqual(["45"]);
  });

  it("a date the agent moved", () => {
    const r = verify(SOURCE, DOC.replace("2025-03-01", "2025-04-01"));
    expect(r.status).toBe(1);
    expect(r.missing).toEqual(["2025-04-01"]);
  });

  it("a name the source never mentions", () => {
    const r = verify(SOURCE, DOC.replace("Jane Doe", "John Roe"));
    expect(r.status).toBe(1);
    expect(r.missing).toEqual(["John Roe"]);
  });

  it("a separator is a claim about the source — 10000 is not what the manual says", () => {
    // The point of copying exactly is that the reader can find the value in
    // the original. Normalising separators would hide a real difference.
    const r = verify(SOURCE, DOC.replace("10,000", "10000"));
    expect(r.status).toBe(1);
    expect(r.missing).toEqual(["10000"]);
  });

  it("reports every miss, sorted, one per line — the agent works the list", () => {
    const r = verify(SOURCE, DOC.replace("30 days", "45 days").replace("Jane Doe", "John Roe"));
    expect(r.missing).toEqual(["45", "John Roe"]);
  });
});

describe("what it does not claim", () => {
  it("cannot see a value that was DROPPED — a shorter document passes", () => {
    // Stated in the script's header. A check that passes says every value
    // present came from the source; it says nothing about completeness. That
    // is the owner's read-back on the site, not this script.
    const r = verify(SOURCE, "---\ntitle: x\n---\nA customer may return an item within 30 days.");
    expect(r.status).toBe(0);
  });

  it("refuses to run without both paths, exit 2", () => {
    const r = spawnSync(process.execPath, [VERIFY], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage");
  });
});
