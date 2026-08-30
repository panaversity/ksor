/**
 * The review surface's grouping, which is the whole of `/review` that can be
 * wrong without a browser.
 *
 * Two things are asserted harder than the rest. The ORDER is a claim about
 * what a reviewer should do first, so it is pinned rather than left to however
 * the badge enum happens to be declared. And the DRAFT sentence exists because
 * a published build excludes every draft from every surface — so a page that
 * showed an empty draft list and said nothing would be telling a reviewer
 * "there are none" when the truth is "this build cannot see them", on a page
 * whose only job is saying what needs looking at.
 */

import { describe, expect, it } from "vitest";

import {
  draftVisibility,
  reviewSections,
  type ReviewItem,
} from "../templates/scaffold/system/site/lib/review.js";
import type { LifecycleBadge } from "../templates/scaffold/system/site/lib/lifecycle-rule.js";

const item = (title: string, badge: LifecycleBadge, at: string | null = null): ReviewItem => ({
  url: `/docs/${title.toLowerCase().replaceAll(" ", "-")}`,
  title,
  description: null,
  badge,
  owner: null,
  at,
});

describe("reviewSections", () => {
  it("orders the states by what costs most to ignore", () => {
    const sections = reviewSections([
      item("D", "deprecated"),
      item("E", "effective-from"),
      item("S", "stale"),
      item("R", "draft"),
    ]);
    expect(sections.map((s) => s.badge)).toEqual([
      "draft",
      "stale",
      "effective-from",
      "deprecated",
    ]);
  });

  it("drops a state with nothing in it rather than printing an empty heading", () => {
    const sections = reviewSections([item("Only", "stale")]);
    expect(sections.map((s) => s.badge)).toEqual(["stale"]);
  });

  it("is empty for a record where nothing is badged", () => {
    expect(reviewSections([])).toEqual([]);
  });

  it("sorts within a state by title, so two reviewers see one list", () => {
    const sections = reviewSections([
      item("Zebra", "stale"),
      item("apple", "stale"),
      item("Mango", "stale"),
    ]);
    expect(sections[0]?.items.map((i) => i.title)).toEqual(["apple", "Mango", "Zebra"]);
  });

  it("keeps every item — the page groups the record, it never filters it", () => {
    const items = [
      item("A", "draft"),
      item("B", "draft"),
      item("C", "deprecated"),
      item("D", "effective-from"),
    ];
    const total = reviewSections(items).reduce((n, s) => n + s.items.length, 0);
    expect(total).toBe(items.length);
  });

  it("carries the instant that explains the badge through untouched", () => {
    // As the record wrote it. Reformatting a date here would be the site
    // making a claim about a timezone the record did not make.
    const sections = reviewSections([item("Policy", "stale", "2026-01-01T00:00:00Z")]);
    expect(sections[0]?.items[0]?.at).toBe("2026-01-01T00:00:00Z");
  });

  it("gives every state a heading and a reason", () => {
    const all: LifecycleBadge[] = ["draft", "stale", "effective-from", "deprecated"];
    for (const section of reviewSections(all.map((badge) => item(badge, badge)))) {
      expect(section.heading.length, section.badge).toBeGreaterThan(0);
      expect(section.note.length, section.badge).toBeGreaterThan(0);
    }
  });
});

describe("draftVisibility", () => {
  it("says a hidden-drafts build cannot see them, rather than implying none exist", () => {
    const note = draftVisibility("hidden");
    expect(note).not.toBeNull();
    expect(note).toContain("KSOR_DRAFTS=show");
  });

  it("says nothing when the build is showing drafts, because the list is then complete", () => {
    expect(draftVisibility("shown")).toBeNull();
  });
});
