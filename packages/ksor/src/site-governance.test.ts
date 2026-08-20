// The Fumadocs shell's governance projection, tested where it is SHIPPED —
// packages/ksor/templates/scaffold/system/site/lib/governance.ts is template
// content, emitted byte-identical into every scaffolded project, so this suite
// tests the module an adopter actually gets (the checker-torture precedent:
// test the shipped artifact, not the CLI that copies it).
//
// The module is deliberately import-free so it can be unit-tested here without
// a site install; everything that needs the Fumadocs loader (resolving a
// successor pointer to its route) lives outside it.
// Contract: specs/ksor/site-governance/spec.md
import { describe, expect, it } from "vitest";

import { readGovernance } from "../templates/scaffold/system/site/lib/governance.js";

const WHERE = "knowledge/policy.md";

describe("readGovernance", () => {
  it("projects every declared key", () => {
    expect(
      readGovernance(
        {
          title: "Refund policy",
          status: "approved",
          owner: "Finance",
          provenance: ["Board minutes 2026-03-11", "Terms of service v4"],
          effective: "2026-04-01",
          superseded_by: "./refund-policy-v5.md",
        },
        WHERE,
      ),
    ).toEqual({
      status: "approved",
      owner: "Finance",
      provenance: ["Board minutes 2026-03-11", "Terms of service v4"],
      effective: "2026-04-01",
      supersededBy: "./refund-policy-v5.md",
    });
  });

  it("infers nothing: an undeclared key yields null, never a placeholder", () => {
    const governance = readGovernance({ title: "Note", status: "draft" }, WHERE);

    expect(governance).toEqual({
      status: "draft",
      owner: null,
      provenance: [],
      effective: null,
      supersededBy: null,
    });
    // The negative promise, asserted as a value and not as an absence: an
    // invented governance value reads as governed, which is worse than a
    // missing one.
    expect(JSON.stringify(governance)).not.toMatch(/unknown|none|n\/a|tbd/i);
  });

  it("treats blank and whitespace-only values as undeclared", () => {
    expect(
      readGovernance(
        { status: "draft", owner: "   ", effective: "", provenance: ["", "  "] },
        WHERE,
      ),
    ).toEqual({
      status: "draft",
      owner: null,
      provenance: [],
      effective: null,
      supersededBy: null,
    });
  });

  it("trims declared values", () => {
    expect(readGovernance({ status: " approved ", owner: " Finance " }, WHERE)).toMatchObject({
      status: "approved",
      owner: "Finance",
    });
  });

  it("keeps a single provenance entry as one entry", () => {
    // provenance is a LIST so a citation can point at exactly one source; one
    // entry is still a list, never a bare string collapsed into prose.
    expect(
      readGovernance({ status: "draft", provenance: ["ISO 27001 §A.9"] }, WHERE),
    ).toMatchObject({ provenance: ["ISO 27001 §A.9"] });
  });

  it("survives a provenance the checker would have refused", () => {
    // `pnpm check` refuses a scalar provenance, but a shell that crashes on
    // one turns a checker finding into an unexplained build failure.
    expect(readGovernance({ status: "draft", provenance: "Board minutes" }, WHERE)).toMatchObject({
      provenance: [],
    });
  });

  it("renders a YAML date as a date, not as an object", () => {
    // Unquoted `effective: 2026-04-01` parses to a Date; rendering it raw
    // would print a locale- and timezone-dependent string into the record.
    expect(
      readGovernance({ status: "approved", effective: new Date("2026-04-01T00:00:00Z") }, WHERE),
    ).toMatchObject({ effective: "2026-04-01" });
  });

  it("refuses a dangling supersession by name", () => {
    // The checker already refuses this; the shell refuses it too, because the
    // failure mode is serving a document that says it was replaced and cannot
    // say by what.
    expect(() => readGovernance({ status: "superseded" }, WHERE)).toThrowError(
      /knowledge\/policy\.md.*superseded_by/s,
    );
  });

  it("carries a successor pointer declared without a superseded status", () => {
    expect(readGovernance({ status: "approved", superseded_by: "./v5.md" }, WHERE)).toMatchObject({
      supersededBy: "./v5.md",
    });
  });

  it("renders no status when the document declares none", () => {
    // status is required and `pnpm check` enforces it; an absent one is a
    // checker finding, not a reason to break an adopter's preview build.
    expect(readGovernance({ title: "Note" }, WHERE)).toMatchObject({ status: null });
  });
});
