// The Fumadocs shell's governance projection, tested where it is SHIPPED —
// packages/ksor/templates/scaffold/system/site/lib/governance.ts is template
// content, emitted byte-identical into every scaffolded project, so this suite
// tests the module an adopter actually gets (the checker-torture precedent:
// test the shipped artifact, not the CLI that copies it).
//
// The module is deliberately import-free so it can be unit-tested here without
// a site install; everything that needs the Fumadocs loader lives outside it.
// Vocabulary: the profile's (record spec §2) — `draft | stable | deprecated`,
// `ksor.owner`, `sources`, `ksor.superseded_by` as a concept id.
import { describe, expect, it } from "vitest";

import {
  agentFrontmatter,
  badgeLabel,
  badgeTone,
  conceptIdOfPath,
  dayOf,
  governanceVisible,
  isCalendarDate,
  predecessorsOf,
  readGovernance,
  resolveSuccessorUrl,
  sourceHref,
  stampLines,
  trustTierOf,
  type DocumentGovernance,
  type Stamps,
} from "../templates/scaffold/system/site/lib/governance.js";

const WHERE = "knowledge/policy.md";

const STAMPED: Stamps = {
  build_id: "sha256:abc",
  source_commit: "0123abc",
  dirty: false,
  ksor_version: "0.1.0",
  unstamped: false,
};
const DEV: Stamps = {
  build_id: null,
  source_commit: null,
  dirty: false,
  ksor_version: null,
  unstamped: true,
};

describe("readGovernance", () => {
  it("projects every declared key of the profile", () => {
    expect(
      readGovernance(
        {
          type: "Policy",
          title: "Refund policy",
          status: "stable",
          sources: [
            { id: "fin-2024", resource: "https://example.com/fin.pdf", title: "Finance handbook" },
            { resource: "scope: board minutes 2026-03-11" },
          ],
          verified: [{ by: "human:kim", at: "2026-08-21T14:00:00Z" }],
          stale_after: "2027-08-21T00:00:00Z",
          ksor: {
            audience: ["public"],
            owner: "team:finance",
            approval: { by: "human:cfo", at: "2026-08-22T10:00:00Z" },
            effective_from: "2026-09-01T00:00:00Z",
            superseded_by: "policies/refund-policy-v5",
          },
        },
        WHERE,
      ),
    ).toEqual({
      status: "stable",
      type: "Policy",
      owner: "team:finance",
      sources: [
        { id: "fin-2024", resource: "https://example.com/fin.pdf", title: "Finance handbook" },
        { id: null, resource: "scope: board minutes 2026-03-11", title: null },
      ],
      effectiveFrom: "2026-09-01T00:00:00Z",
      staleAfter: "2027-08-21T00:00:00Z",
      supersededBy: "policies/refund-policy-v5",
      approval: { by: "human:cfo", at: "2026-08-22T10:00:00Z" },
      deprecated: null,
      verified: [{ by: "human:kim", at: "2026-08-21T14:00:00Z" }],
    });
  });

  it("infers nothing: an undeclared key yields null, never a placeholder", () => {
    const governance = readGovernance({ title: "Note", status: "draft" }, WHERE);
    expect(governance).toEqual({
      status: "draft",
      type: null,
      owner: null,
      sources: [],
      effectiveFrom: null,
      staleAfter: null,
      supersededBy: null,
      approval: null,
      deprecated: null,
      verified: [],
    });
    // The negative promise, asserted as a value and not as an absence: an
    // invented governance value reads as governed, which is worse than a
    // missing one.
    expect(JSON.stringify(governance)).not.toMatch(/unknown|none|n\/a|tbd/i);
  });

  it("treats blank and whitespace-only values as undeclared, and trims the rest", () => {
    expect(
      readGovernance(
        {
          status: " stable ",
          ksor: { owner: "   ", effective_from: "" },
          sources: [{ resource: " " }],
        },
        WHERE,
      ),
    ).toMatchObject({ status: "stable", owner: null, effectiveFrom: null, sources: [] });
  });

  it("accepts a bare verified mapping as a one-element list (OKF §5.2)", () => {
    expect(
      readGovernance(
        { status: "stable", verified: { by: "process:nightly", at: "2026-08-21T00:00:00Z" } },
        WHERE,
      ),
    ).toMatchObject({ verified: [{ by: "process:nightly", at: "2026-08-21T00:00:00Z" }] });
  });

  it("survives a sources list the checker would have refused", () => {
    // A shell that crashes on a malformed key turns a checker finding into an
    // unexplained build failure, hiding the message `pnpm check` prints.
    expect(readGovernance({ status: "draft", sources: "Board minutes" }, WHERE)).toMatchObject({
      sources: [],
    });
    expect(
      readGovernance({ status: "draft", sources: [{ title: "no resource" }] }, WHERE),
    ).toMatchObject({
      sources: [],
    });
  });

  it("renders a YAML instant parsed as a Date as ISO, not as an object", () => {
    // The collection's YAML parses an unquoted instant to a Date; rendering it
    // raw would print a locale- and timezone-dependent string into the record.
    expect(
      readGovernance(
        { status: "stable", ksor: { effective_from: new Date("2026-09-01T00:00:00Z") } },
        WHERE,
      ),
    ).toMatchObject({ effectiveFrom: "2026-09-01T00:00:00.000Z" });
  });

  it("refuses an unattributed deprecation by name", () => {
    // The checker refuses this; the shell refuses it too, because the failure
    // mode is serving a document that says it was withdrawn by nobody.
    expect(() => readGovernance({ status: "deprecated" }, WHERE)).toThrowError(
      /knowledge\/policy\.md.*ksor\.deprecated/s,
    );
    expect(
      readGovernance(
        {
          status: "deprecated",
          ksor: { deprecated: { by: "human:cfo", at: "2026-08-10T00:00:00Z" } },
        },
        WHERE,
      ),
    ).toMatchObject({ deprecated: { by: "human:cfo", at: "2026-08-10T00:00:00Z" } });
  });

  it("renders no status when the document declares none", () => {
    expect(readGovernance({ title: "Note" }, WHERE)).toMatchObject({ status: null });
  });
});

describe("trustTierOf — record spec §2.3", () => {
  it("none → unverified; machine only → machine-confirmed; any human → human-reviewed", () => {
    expect(trustTierOf([])).toBe("unverified");
    expect(trustTierOf([{ by: "process:nightly", at: "x" }])).toBe("machine-confirmed");
    expect(trustTierOf([{ by: "claude-code/1.0", at: "x" }])).toBe("machine-confirmed");
    expect(
      trustTierOf([
        { by: "process:nightly", at: "x" },
        { by: "human:kim", at: "x" },
      ]),
    ).toBe("human-reviewed");
  });
});

describe("resolveSuccessorUrl — a concept id against this build's pages", () => {
  const PAGES = [
    { path: "refund-policy.md", url: "/docs/refund-policy" },
    { path: "refund-policy-v5.md", url: "/docs/refund-policy-v5" },
    { path: "legal/terms.md", url: "/docs/legal/terms" },
  ];

  it("resolves a bundle-relative id to the successor's route, `.md` optional", () => {
    expect(resolveSuccessorUrl("refund-policy-v5", PAGES)).toBe("/docs/refund-policy-v5");
    expect(resolveSuccessorUrl("refund-policy-v5.md", PAGES)).toBe("/docs/refund-policy-v5");
    expect(resolveSuccessorUrl("legal/terms", PAGES)).toBe("/docs/legal/terms");
  });

  it("carries an anchor through", () => {
    expect(resolveSuccessorUrl("refund-policy-v5#scope", PAGES)).toBe(
      "/docs/refund-policy-v5#scope",
    );
  });

  it("yields null rather than a dead link when the successor is not in this build", () => {
    // The checker proves the target exists in the record, but a per-viewer
    // build stages a SUBSET — the successor may legitimately be absent here.
    expect(resolveSuccessorUrl("nowhere", PAGES)).toBeNull();
  });

  it("yields null for a pointer that is not a concept id", () => {
    expect(resolveSuccessorUrl("https://example.com/v5.md", PAGES)).toBeNull();
    expect(resolveSuccessorUrl("/refund-policy-v5", PAGES)).toBeNull();
    expect(resolveSuccessorUrl("./refund-policy-v5.md", PAGES)).toBeNull();
  });

  it("reads a windows-shaped page path as the same id", () => {
    expect(conceptIdOfPath("legal\\terms.md")).toBe("legal/terms");
    expect(
      resolveSuccessorUrl("legal/terms", [{ path: "legal\\terms.md", url: "/docs/legal/terms" }]),
    ).toBe("/docs/legal/terms");
  });
});

describe("predecessorsOf — the other direction, derived", () => {
  const PAGES = [
    { path: "v4.md", url: "/docs/v4" },
    { path: "v5.md", url: "/docs/v5" },
    { path: "other.md", url: "/docs/other" },
  ];
  it("lists every document whose successor is this page", () => {
    expect(
      predecessorsOf("/docs/v5", PAGES, [
        { path: "v4.md", supersededBy: "v5" },
        { path: "other.md", supersededBy: null },
      ]),
    ).toEqual(["/docs/v4"]);
  });
  it("never lists the page itself", () => {
    expect(predecessorsOf("/docs/v5", PAGES, [{ path: "v5.md", supersededBy: "v5" }])).toEqual([]);
  });
});

describe("the badge vocabulary — one word per §2.5 state, everywhere", () => {
  it("labels every badge and nothing for a current document", () => {
    expect(badgeLabel(null)).toBeNull();
    expect(badgeLabel("draft")).toBe("draft");
    expect(badgeLabel("deprecated")).toBe("deprecated");
    expect(badgeLabel("effective-from")).toBe("not yet effective");
    expect(badgeLabel("stale")).toBe("past its review date");
  });
  it("colours only the withdrawn state", () => {
    expect(badgeTone("deprecated")).toBe("ksor-withdrawn");
    for (const badge of ["draft", "effective-from", "stale", null] as const) {
      expect(badgeTone(badge)).toBe("");
    }
  });
});

describe("agentFrontmatter — the twin's and llms-full.txt's governance block", () => {
  const STABLE: DocumentGovernance = {
    status: "stable",
    type: "Policy",
    owner: "team:finance",
    sources: [{ id: "fin", resource: "https://example.com/fin.pdf", title: "Finance: 2024" }],
    effectiveFrom: "2026-09-01T00:00:00Z",
    staleAfter: null,
    supersededBy: null,
    approval: { by: "human:cfo", at: "2026-08-22T10:00:00Z" },
    deprecated: null,
    verified: [],
  };

  it("emits the governance as frontmatter, then the stamps (R14)", () => {
    expect(agentFrontmatter(STABLE, STAMPED)).toBe(
      [
        "---",
        "status: stable",
        "type: Policy",
        "owner: team:finance",
        "effective_from: 2026-09-01T00:00:00Z",
        "approval: { by: human:cfo, at: 2026-08-22T10:00:00Z }",
        "trust_tier: unverified",
        "sources:",
        '  - { id: fin, resource: https://example.com/fin.pdf, title: "Finance: 2024" }',
        "build_id: sha256:abc",
        "source_commit: 0123abc",
        "ksor_version: 0.1.0",
        "---",
        "",
      ].join("\n"),
    );
  });

  it("says dirty when the lock does, and says unstamped in development", () => {
    expect(stampLines({ ...STAMPED, dirty: true })).toEqual([
      "build_id: sha256:abc",
      "source_commit: 0123abc",
      "dirty: true",
      "ksor_version: 0.1.0",
    ]);
    expect(stampLines(DEV)).toEqual(["build_id: null", "unstamped: true"]);
    expect(agentFrontmatter({ ...STABLE, sources: [] }, DEV)).toContain("\nunstamped: true\n");
  });

  it("emits nothing the document did not declare", () => {
    const bare = agentFrontmatter(
      { ...STABLE, type: null, owner: null, sources: [], effectiveFrom: null, approval: null },
      STAMPED,
    );
    expect(bare).not.toContain("owner:");
    expect(bare).not.toContain("sources:");
    expect(bare).not.toContain("approval:");
    expect(bare).toContain("status: stable");
  });
});

describe("sourceHref", () => {
  it("links http(s) resources and nothing else", () => {
    expect(sourceHref("https://example.com/x")).toBe("https://example.com/x");
    expect(sourceHref("http://example.com/x")).toBe("http://example.com/x");
    expect(sourceHref("javascript:alert(1)")).toBeNull();
    expect(sourceHref("data:text/html,x")).toBeNull();
    expect(sourceHref("mailto:x@example.com")).toBeNull();
    expect(sourceHref("/policies/handbook.md")).toBeNull();
    expect(sourceHref("scope: board minutes")).toBeNull();
    expect(sourceHref("https://")).toBeNull();
  });
});

describe("dates", () => {
  it("isCalendarDate accepts a real day and refuses a shaped one", () => {
    expect(isCalendarDate("2026-04-01")).toBe(true);
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2026-06-31")).toBe(false);
    expect(isCalendarDate("2026-13-45")).toBe(false);
    expect(isCalendarDate("2026-4-1")).toBe(false);
  });
  it("dayOf takes the calendar day of an instant", () => {
    expect(dayOf("2026-09-01T00:00:00Z")).toBe("2026-09-01");
    expect(dayOf("2026-09-01")).toBe("2026-09-01");
  });
});

describe("governanceVisible", () => {
  it("defaults to on when instance.md says nothing", () => {
    expect(governanceVisible({ format: 2, name: "acme" })).toBe(true);
  });

  it("stays on for a site block that declares only a url", () => {
    expect(governanceVisible({ site: { url: "https://acme.example" } })).toBe(true);
  });

  it("turns off on an explicit false, stays on for an explicit true", () => {
    expect(governanceVisible({ site: { governance: false } })).toBe(false);
    expect(governanceVisible({ site: { governance: true } })).toBe(true);
    expect(governanceVisible({ site: { url: "https://acme.example", governance: false } })).toBe(
      false,
    );
  });

  it("a top-level governance key is not this setting", () => {
    // `governance:` at the root is a different key and must never silently
    // become the site's publication switch.
    expect(governanceVisible({ site: { url: "x" }, governance: false })).toBe(true);
  });

  it("refuses a value that is not true or false", () => {
    // Silently defaulting would publish the governance the owner asked to
    // hide — the owner's intent must never be dropped without a word. Real
    // YAML hands `no` back as a string and an empty value as null: the string
    // refuses, the empty value is the default.
    expect(() => governanceVisible({ site: { governance: "no" } })).toThrowError(/governance/);
    expect(governanceVisible({ site: { governance: null } })).toBe(true);
  });

  it("a site: key that is not a mapping is ignored, never read as a switch", () => {
    expect(governanceVisible({ site: "https://acme.example" })).toBe(true);
    expect(governanceVisible({ site: ["governance"] })).toBe(true);
  });
});
