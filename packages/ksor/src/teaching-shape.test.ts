/**
 * The teaching guide's shape normalization.
 *
 * The SCHEMA's own behaviour — including the empty-guide refusal — is asserted
 * as a build refusal in the e2e suite, for the reason `quiz-round.test.ts`
 * records: `teaching.ts` carries zod and cannot enter this tier.
 */
import { describe, expect, it } from "vitest";

import {
  TEACHING_SECTIONS,
  hasTeachingContent,
  normalizeMisconception,
  normalizeObjective,
} from "../templates/scaffold/system/site/lib/teaching-shape.js";

describe("a misconception may be written either way", () => {
  it("a bare string becomes text with no correction", () => {
    expect(normalizeMisconception("that the threshold is per-item")).toEqual({
      text: "that the threshold is per-item",
    });
  });

  it("an object keeps its correction", () => {
    expect(normalizeMisconception({ text: "per-item", instead: "per-invoice" })).toEqual({
      text: "per-item",
      instead: "per-invoice",
    });
  });

  it("an object without a correction is the same as the bare string", () => {
    expect(normalizeMisconception({ text: "per-item" }).instead).toBeUndefined();
  });
});

describe("an objective may be written either way", () => {
  it("a bare string becomes an objective with no level", () => {
    expect(normalizeObjective("can state the threshold")).toEqual({
      objective: "can state the threshold",
    });
  });

  it("a level is carried through as free text, whatever it says", () => {
    // Deliberately not a taxonomy: "A2", "Understand" and "banana" are all
    // accepted, because validating this would mean ratifying a pedagogy.
    for (const level of ["A2", "Understand", "banana"]) {
      expect(normalizeObjective({ objective: "x", level }).level).toBe(level);
    }
  });
});

describe("a guide with nothing in it is not renderable", () => {
  it("says so when every section is absent", () => {
    expect(hasTeachingContent({})).toBe(false);
  });

  it("says so when every section is present but empty", () => {
    const empty = Object.fromEntries(TEACHING_SECTIONS.map((s) => [s.key, []]));
    expect(hasTeachingContent(empty)).toBe(false);
  });

  it("one item in ANY section is enough", () => {
    for (const section of TEACHING_SECTIONS) {
      expect(hasTeachingContent({ [section.key]: ["something"] }), section.key).toBe(true);
    }
  });
});

describe("the section list is the render order and is complete", () => {
  it("every section has a human label distinct from its key", () => {
    for (const section of TEACHING_SECTIONS) {
      expect(section.label.length, section.key).toBeGreaterThan(0);
      expect(section.label).not.toBe(section.key);
    }
  });

  it("no key appears twice", () => {
    const keys = TEACHING_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
