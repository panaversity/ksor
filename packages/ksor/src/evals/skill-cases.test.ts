/**
 * Mutation tests for the body gates: a conversion that follows the skill
 * passes every gate for its fixture, and each careless act — smoothing the
 * two statements into one, misreading the figure, dropping a row, dropping a
 * thousands separator, keeping the footer, inventing a currency — turns
 * exactly the gate built for it red and no other. The fixture is under test here as much as the skill: a gate
 * that fails a good conversion is a wrong gate.
 */

import { describe, expect, it } from "vitest";

import {
  CASES,
  bodyGates,
  prompt,
  refusalGates,
  type Grade,
  type SkillCase,
} from "./skill-cases.js";

const kase = (fixture: string): SkillCase => {
  const found = CASES.find((c) => c.fixture === fixture);
  if (found === undefined) throw new Error(`no case for ${fixture}`);
  return found;
};

/** The names of the gates that failed, with what each saw — so a wrong assertion prints its evidence. */
const failed = (grades: readonly Grade[]): string[] =>
  grades.filter((g) => !g.pass).map((g) => `${g.name} — saw ${g.saw}`);

const names = (grades: readonly Grade[]): string[] => grades.map((g) => g.name);

/** A conversion of expense-policy-hard.pdf the way the skill prescribes it. */
const HARD_GOOD = `---
type: Policy
title: Expense policy
description: What an employee of Acme Operations may claim, at what rate, and who approves it.
status: draft
ksor:
  audience: [public]
  owner: team:finance
sources:
  - id: finance-manual-7
    title: Finance manual §7, 2026 edition, revision 3
    resource: "Finance manual §7, 2026 edition, revision 3 (expense-policy-hard.pdf)"
---

## Scope

This policy covers every expense claimed by an employee of Acme Operations,
including travel between the offices listed under rates by city.[^finance-manual-7]

## Limits

An employee may claim up to 75 per day for meals while travelling, unless the
rates table says otherwise for the city. A single purchase above 2,500 needs the
approval of a director before it is made. Claims are paid within 10 working days
of approval.[^finance-manual-7]

## Rates by city

The meal rate and the lodging cap depend on where the employee stays. The
hardship factor multiplies the meal rate; a factor of 1.000 leaves it as it is.

| City   | Meals per day | Lodging per night | Monthly cap | Factor |
| ------ | ------------- | ----------------- | ----------- | ------ |
| Berlin | 75            | 180               | 1,100       | 1.000  |
| Vienna | 70            | 165               | 1,000       | 1.000  |
| Zurich | 95            | 240               | 1,250       | 1.250  |
| Prague | 55            | 120               | 850         | 1.000  |
| Warsaw | 60            | 130               | 900         | 1.125  |

A stay in a city not listed here is claimed at the Berlin rates.[^finance-manual-7]

## Receipts

Every claim above 25 needs a receipt. A claim without one is paid at the
manager's discretion and never above 25.[^finance-manual-7]

## Payment

Approved claims are reimbursed within ten (10) business days of the approval
date, to the account on the employee's payroll record.[^finance-manual-7]

Open question: section 2 says claims are paid within "10 working days" and
section 5 says "ten (10) business days" — one window or two?

## Approval

Claims are approved by the claimant's line manager. Claims by a director are
approved by Priya Patel, Head of Finance.[^finance-manual-7]

## Exceptions

Travel booked through the company account needs no claim.[^finance-manual-7]

Open question: the source names no currency for any amount.

[^finance-manual-7]: Finance manual §7, 2026 edition, revision 3.
`;

/** A conversion of expense-policy.pdf, the clean two-page fixture. */
const CLEAN_GOOD = `---
type: Policy
title: Expense policy
description: What an employee may claim and who approves it.
status: draft
ksor:
  audience: [public]
  owner: team:finance
sources:
  - id: finance-manual-7
    title: Finance manual §7, 2026 edition
    resource: "Finance manual §7, 2026 edition (expense-policy.pdf)"
---

## Limits

An employee may claim up to 75 per day for meals while travelling. A single
purchase above 2,500 needs the approval of a director. Claims are paid within
10 working days of approval.[^finance-manual-7]

## Approval

Claims by a director are approved by Priya Patel, Head of Finance.[^finance-manual-7]

[^finance-manual-7]: Finance manual §7, 2026 edition.
`;

describe("the CASES table", () => {
  it("names three fixtures, each prompted by its own name", () => {
    expect(CASES.map((c) => c.fixture)).toEqual([
      "expense-policy.pdf",
      "expense-policy-hard.pdf",
      "scanned-policy.pdf",
    ]);
    for (const c of CASES) expect(c.prompt, c.fixture).toContain(`\`src/${c.fixture}\``);
    expect(CASES.map((c) => c.outcome)).toEqual(["converted", "converted", "refused"]);
  });

  it("the scanned fixture is graded against what its picture says: the hard extraction", () => {
    expect(kase("scanned-policy.pdf").extraction).toBe("expense-policy-hard.txt");
  });

  it("the prompt is the tutorial's, plus the owner's standing answers", () => {
    expect(prompt("x.pdf")).toContain("write it into the document as an open question");
  });
});

describe("expense-policy-hard.pdf: the body gates", () => {
  const hard = kase("expense-policy-hard.pdf");

  it("a conversion that follows the skill passes every gate", () => {
    expect(failed(bodyGates(hard, HARD_GOOD))).toEqual([]);
  });

  it("carries four gates the clean fixture does not", () => {
    const clean = names(bodyGates(kase("expense-policy.pdf"), CLEAN_GOOD));
    const extra = names(bodyGates(hard, HARD_GOOD)).filter((n) => !clean.includes(n));
    expect(extra).toEqual([
      "both statements of the payment window survive (10 working days; ten (10) business days)",
      "the misreadable pair survives distinct (Zurich: 1,250 beside 1.250)",
      "every row of the rates table survives (five cities)",
      "the thousands separators survive (2,500; 1,100; 1,000)",
    ]);
  });

  const mutations: readonly [string, (good: string) => string, string][] = [
    [
      "smoothing the two statements into one",
      (s) => s.replaceAll("ten (10) business days", "10 working days"),
      "both statements of the payment window survive (10 working days; ten (10) business days)",
    ],
    [
      "dropping the second statement's section",
      (s) => s.replace(/## Payment[\s\S]*?(?=## Approval)/, ""),
      "both statements of the payment window survive (10 working days; ten (10) business days)",
    ],
    [
      "misreading 1.250 as 1,250",
      (s) => s.replace("1.250", "1,250"),
      "the misreadable pair survives distinct (Zurich: 1,250 beside 1.250)",
    ],
    [
      "misreading 1,250 as 1.250",
      (s) => s.replace("| 1,250       | 1.250", "| 1.250       | 1.250"),
      "the misreadable pair survives distinct (Zurich: 1,250 beside 1.250)",
    ],
    [
      "trimming 1.250 to 1.25",
      (s) => s.replace("1.250", "1.25 "),
      "the misreadable pair survives distinct (Zurich: 1,250 beside 1.250)",
    ],
    [
      "dropping the separator from the director threshold (2,500 → 2500)",
      (s) => s.replace("above 2,500", "above 2500"),
      "the thousands separators survive (2,500; 1,100; 1,000)",
    ],
    [
      "misreading the separator as a decimal point (2,500 → 2.500)",
      (s) => s.replace("above 2,500", "above 2.500"),
      "the thousands separators survive (2,500; 1,100; 1,000)",
    ],
    [
      "dropping the separator from a monthly cap (1,100 → 1100)",
      (s) => s.replace("| 1,100       |", "| 1100        |"),
      "the thousands separators survive (2,500; 1,100; 1,000)",
    ],
    [
      "dropping a row of the table",
      (s) => s.replace(/\| Warsaw.*\n/, ""),
      "every row of the rates table survives (five cities)",
    ],
    [
      "keeping the running footer",
      (s) => `${s}\nUncontrolled when printed. The current edition is on the finance intranet.\n`,
      "page furniture stripped",
    ],
    ["keeping a page number", (s) => `${s}\nPage 2 of 2\n`, "page furniture stripped"],
    [
      "inventing a currency the source never names",
      (s) => s.replace("up to 75 per day", "up to 75 CHF per day"),
      "no currency invented (the source names none)",
    ],
    [
      "inventing a currency symbol",
      (s) => s.replace("above 2,500", "above €2,500"),
      "no currency invented (the source names none)",
    ],
    ["approving it unasked", (s) => s.replace("status: draft", "status: stable"), "status: draft"],
    [
      "authoring an id",
      (s) => s.replace("status: draft", "status: draft\nid: expense-policy"),
      "no id:/name: (the path is the identity)",
    ],
    [
      "dropping sources",
      (s) => s.replace(/sources:[\s\S]*?(?=---\n\n## Scope)/, ""),
      "sources present",
    ],
  ];

  it.each(mutations)("%s turns exactly its gate red", (_label, mutate, gate) => {
    const body = mutate(HARD_GOOD);
    expect(body, "the mutation changed nothing").not.toBe(HARD_GOOD);
    const grades = bodyGates(hard, body);
    expect(failed(grades)).toHaveLength(1);
    expect(grades.filter((g) => !g.pass).map((g) => g.name)).toEqual([gate]);
  });

  it("a table that wraps to prose still passes, and the saw names the row it read", () => {
    const prose = HARD_GOOD.replace(
      "| Zurich | 95            | 240               | 1,250       | 1.250  |",
      "| Zurich | 95 | 240 |\n| (Zurich, continued) | monthly cap 1,250 | factor 1.250 |",
    );
    const grades = bodyGates(hard, prose);
    expect(failed(grades)).toEqual([]);
    const pair = grades.find((g) => g.name.startsWith("the misreadable pair"));
    expect(pair?.saw).toContain("1,250");
    expect(pair?.saw).toContain("1.250");
  });
});

describe("expense-policy.pdf: the body gates", () => {
  const clean = kase("expense-policy.pdf");

  it("a conversion that follows the skill passes every gate", () => {
    expect(failed(bodyGates(clean, CLEAN_GOOD))).toEqual([]);
  });

  it("the footer gate belongs to the hard fixture only", () => {
    const withFooter = `${CLEAN_GOOD}\nUncontrolled when printed.\n`;
    expect(failed(bodyGates(clean, withFooter))).toEqual([]);
  });
});

describe("scanned-policy.pdf: the refusal gates", () => {
  it("a refusal that wrote nothing and named the missing text layer passes", () => {
    const text =
      "I stopped: `src/scanned-policy.pdf` has no text layer — pdftotext returns only " +
      "whitespace, so this is a scanned image. I can read it as a picture, but I cannot " +
      "promise the numbers in it are right. Give me a text PDF, or paste the section you need.";
    expect(failed(refusalGates(text, []))).toEqual([]);
  });

  it("the skill's own words pass", () => {
    expect(failed(refusalGates("This is a scanned image.", []))).toEqual([]);
  });

  it("a document written from the picture fails 'wrote nothing', and says what verify found", () => {
    const grades = refusalGates(
      "Added the policy under finance/. It looked scanned so I read it by eye.",
      ["knowledge/finance/expense-policy.md", "knowledge/finance/index.md"],
      "knowledge/finance/expense-policy.md — verify.mjs against what the picture says: 1.25, 2500",
    );
    expect(failed(grades)).toEqual([
      "wrote nothing — saw knowledge/finance/expense-policy.md — verify.mjs against what the picture says: 1.25, 2500",
    ]);
  });

  it("a silent refusal fails 'told the owner'", () => {
    expect(failed(refusalGates("I could not add this document.", []))).toEqual([
      "told the owner the PDF has no text layer — saw I could not add this document.",
    ]);
  });

  it("the scanned case has no body gates: there is no document to grade", () => {
    expect(bodyGates(kase("scanned-policy.pdf"), HARD_GOOD)).toEqual([]);
  });
});
