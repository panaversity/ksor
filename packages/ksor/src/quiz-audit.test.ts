import { describe, expect, it } from "vitest";

import {
  auditQuiz,
  QUIZ_AUDIT_CASES,
  QUIZ_AUDIT_SLUGS,
} from "../templates/scaffold/system/site/lib/quiz-audit.js";

/**
 * The audit's own conformance table drives these, because the checker
 * implements the same rules in plain JS and both halves are asserted against
 * this one list (decision 18 — one rule, two surfaces, one table).
 */
describe("the audit agrees with its own table", () => {
  for (const row of QUIZ_AUDIT_CASES) {
    it(`${row.name} → ${row.expect.length === 0 ? "clean" : row.expect.join(", ")}`, () => {
      const slugs = auditQuiz(row.quiz).map((f) => f.slug);
      expect(slugs.sort()).toEqual([...row.expect].sort());
    });
  }
});

describe("every declared slug is exercised by the table", () => {
  it("no rule ships without a case that fires it", () => {
    const fired = new Set(QUIZ_AUDIT_CASES.flatMap((row) => row.expect));
    for (const slug of QUIZ_AUDIT_SLUGS) {
      expect(fired, `no QUIZ_AUDIT_CASES row fires ${slug}`).toContain(slug);
    }
  });

  it("and at least one case is clean, or the table only proves it refuses", () => {
    expect(QUIZ_AUDIT_CASES.some((row) => row.expect.length === 0)).toBe(true);
  });
});

describe("a finding names what to fix", () => {
  it("carries the question numbers, 1-based for a human reading the file", () => {
    const biased = QUIZ_AUDIT_CASES.find((r) => r.expect.includes("ksor-quiz-answer-bias"));
    const finding = auditQuiz(biased!.quiz).find((f) => f.slug === "ksor-quiz-answer-bias");
    expect(finding?.questions.every((n) => n >= 1)).toBe(true);
    expect(finding?.detail.length ?? 0).toBeGreaterThan(0);
  });
});

describe("small banks are not forced into a distribution", () => {
  it("a four-question bank with every answer at 0 is not a bias finding", () => {
    // Below the floor the ratio is meaningless: 4 questions cannot be spread
    // across 4 indices without dictating the answers, which is the record's
    // business and not the checker's.
    const quiz = {
      quiz: { title: "Tiny" },
      questions: [0, 0, 0, 0].map((answer, i) => ({
        question: `Q${i} — a distinct stem so no duplicate fires here`,
        options: ["aa", "bb", "cc"],
        answer,
        explanation: "e",
      })),
    };
    expect(auditQuiz(quiz).map((f) => f.slug)).not.toContain("ksor-quiz-answer-bias");
  });
});
