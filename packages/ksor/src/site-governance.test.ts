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

import {
  governanceVisible,
  readGovernance,
  resolveSuccessorUrl,
} from "../templates/scaffold/system/site/lib/governance.js";

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

describe("resolveSuccessorUrl", () => {
  const KNOWN = [
    "/docs/refund-policy",
    "/docs/refund-policy-v5",
    "/docs/legal/terms",
    "/docs/legal",
  ];

  it("resolves a sibling pointer to the successor's route", () => {
    expect(resolveSuccessorUrl("./refund-policy-v5.md", "/docs/refund-policy", KNOWN)).toBe(
      "/docs/refund-policy-v5",
    );
  });

  it("resolves a pointer written without the ./ prefix", () => {
    expect(resolveSuccessorUrl("refund-policy-v5.md", "/docs/refund-policy", KNOWN)).toBe(
      "/docs/refund-policy-v5",
    );
  });

  it("walks up out of a folder", () => {
    expect(resolveSuccessorUrl("../refund-policy-v5.md", "/docs/legal/terms", KNOWN)).toBe(
      "/docs/refund-policy-v5",
    );
  });

  it("descends into a folder", () => {
    expect(resolveSuccessorUrl("./legal/terms.md", "/docs/refund-policy", KNOWN)).toBe(
      "/docs/legal/terms",
    );
  });

  it("maps a folder index to the folder's own route", () => {
    // knowledge/legal/index.md renders at /docs/legal, not /docs/legal/index.
    expect(resolveSuccessorUrl("./legal/index.md", "/docs/refund-policy", KNOWN)).toBe(
      "/docs/legal",
    );
  });

  it("carries an anchor through", () => {
    expect(resolveSuccessorUrl("./refund-policy-v5.md#scope", "/docs/refund-policy", KNOWN)).toBe(
      "/docs/refund-policy-v5#scope",
    );
  });

  it("yields null rather than a dead link when the route is unknown", () => {
    // `pnpm check` proves the TARGET FILE exists, so reaching this means our
    // url arithmetic disagreed with the loader's — our bug, and the honest
    // answer is to show the pointer as text, never to ship a 404 link.
    expect(resolveSuccessorUrl("./nowhere.md", "/docs/refund-policy", KNOWN)).toBeNull();
  });

  it("yields null for a pointer that leaves the record", () => {
    expect(
      resolveSuccessorUrl("https://example.com/v5.md", "/docs/refund-policy", KNOWN),
    ).toBeNull();
  });
});

describe("governanceVisible", () => {
  const fm = (...lines: string[]): string => lines.join("\n");

  it("defaults to on when instance.md says nothing", () => {
    // Purely additive: every record written before this key existed keeps
    // rendering its governance.
    expect(governanceVisible(fm("format: 1", "name: acme"))).toBe(true);
  });

  it("stays on for a site block that declares only a url", () => {
    expect(governanceVisible(fm("site:", "  url: https://acme.example"))).toBe(true);
  });

  it("turns off on an explicit false", () => {
    expect(governanceVisible(fm("site:", "  governance: false"))).toBe(false);
  });

  it("stays on for an explicit true", () => {
    expect(governanceVisible(fm("site:", "  governance: true"))).toBe(true);
  });

  it("reads it beside its sibling keys, in either order", () => {
    expect(
      governanceVisible(fm("site:", "  url: https://acme.example", "  governance: false")),
    ).toBe(false);
    expect(
      governanceVisible(fm("site:", "  governance: false", "  url: https://acme.example")),
    ).toBe(false);
  });

  it("ends the block at the next top-level key", () => {
    // `governance:` here is NOT a child of site: — a top-level key of that
    // name is not this setting and must not silently become it.
    expect(governanceVisible(fm("site:", "  url: x", "governance: false"))).toBe(true);
  });

  it("tolerates a trailing comment", () => {
    expect(governanceVisible(fm("site:", "  governance: false # not on this site"))).toBe(false);
  });

  it("refuses a value that is not true or false", () => {
    // Silently defaulting would publish the governance the owner asked to
    // hide — the owner's intent must never be dropped without a word.
    expect(() => governanceVisible(fm("site:", "  governance: no"))).toThrowError(/governance/);
    expect(() => governanceVisible(fm("site:", "  governance:"))).toThrowError(/governance/);
  });
});
