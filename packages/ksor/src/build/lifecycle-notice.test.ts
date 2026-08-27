import { describe, expect, it } from "vitest";

import { lifecycleNotice, type NoticeDoc } from "./lifecycle-notice.js";

const AT = Date.parse("2026-08-25T12:00:00Z");
const doc = (path: string, extra: Partial<NoticeDoc> = {}): NoticeDoc => ({
  path,
  status: "stable",
  effectiveFrom: null,
  staleAfter: null,
  ...extra,
});

describe("lifecycleNotice", () => {
  it("says nothing when no document's admission turns on an instant", () => {
    expect(lifecycleNotice([doc("a.md"), doc("b.md", { status: "draft" })], AT)).toBe("");
  });

  it("names a document past its stale_after, and the instant it passed", () => {
    const text = lifecycleNotice(
      [doc("handbook.md", { staleAfter: Date.parse("2020-01-01T00:00:00Z") })],
      AT,
    );
    expect(text).toContain("handbook.md");
    expect(text).toContain("stale_after");
    expect(text).toContain("2020-01-01T00:00:00.000Z");
  });

  it("names a document held back before its effective_from", () => {
    const text = lifecycleNotice(
      [doc("embargo.md", { effectiveFrom: Date.parse("2099-01-01T00:00:00Z") })],
      AT,
    );
    expect(text).toContain("embargo.md");
    expect(text).toContain("effective_from");
  });

  /**
   * The half B6 is actually about: the admission was decided ONCE, at this
   * build's `as_of`, and the static artefact cannot re-decide it. Naming the
   * next instant is the only honest thing a build can say about its own decay.
   */
  it("names the next instant at which this build's answer stops being true", () => {
    const text = lifecycleNotice(
      [
        doc("soon.md", { staleAfter: Date.parse("2026-09-01T00:00:00Z") }),
        doc("later.md", { staleAfter: Date.parse("2030-01-01T00:00:00Z") }),
      ],
      AT,
    );
    expect(text).toContain("2026-09-01T00:00:00.000Z");
    expect(text).toContain("soon.md");
    expect(text).not.toContain("2030-01-01");
  });

  it("counts a future effective_from as a coming change too", () => {
    const text = lifecycleNotice(
      [doc("embargo.md", { effectiveFrom: Date.parse("2027-01-01T00:00:00Z") })],
      AT,
    );
    expect(text).toContain("2027-01-01T00:00:00.000Z");
  });

  /** A draft is a draft at every instant; saying so on every build is noise, not honesty. */
  it("says nothing about drafts or deprecations, whose admission no clock decides", () => {
    const text = lifecycleNotice(
      [doc("d.md", { status: "draft" }), doc("old.md", { status: "deprecated" })],
      AT,
    );
    expect(text).toBe("");
  });

  it("never refuses — it is a notice, and a stale document is a governed state", () => {
    const text = lifecycleNotice(
      [doc("handbook.md", { staleAfter: Date.parse("2020-01-01T00:00:00Z") })],
      AT,
    );
    expect(text).not.toMatch(/error|refus|problem:/i);
  });
});
