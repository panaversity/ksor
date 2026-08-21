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
  agentFrontmatter,
  agentIndexSuffix,
  governanceVisible,
  isCalendarDate,
  readGovernance,
  resolveSuccessorUrl,
  sourceHref,
  type DocumentGovernance,
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
  // The record, as the loader reports it: source path (page.path) -> route.
  const PAGES = [
    { path: "refund-policy.md", url: "/docs/refund-policy" },
    { path: "refund-policy-v5.md", url: "/docs/refund-policy-v5" },
    { path: "terms.md", url: "/docs/terms" },
    { path: "legal.md", url: "/docs/legal" },
    { path: "legal/terms.md", url: "/docs/legal/terms" },
    { path: "handbook/index.md", url: "/docs/handbook" },
    { path: "handbook/terms.md", url: "/docs/handbook/terms" },
  ];

  it("resolves a sibling pointer to the successor's route", () => {
    expect(resolveSuccessorUrl("./refund-policy-v5.md", "refund-policy.md", PAGES)).toBe(
      "/docs/refund-policy-v5",
    );
  });

  it("resolves a pointer written without the ./ prefix", () => {
    expect(resolveSuccessorUrl("refund-policy-v5.md", "refund-policy.md", PAGES)).toBe(
      "/docs/refund-policy-v5",
    );
  });

  it("walks up out of a folder", () => {
    expect(resolveSuccessorUrl("../refund-policy-v5.md", "legal/terms.md", PAGES)).toBe(
      "/docs/refund-policy-v5",
    );
  });

  it("descends into a folder", () => {
    expect(resolveSuccessorUrl("./legal/terms.md", "refund-policy.md", PAGES)).toBe(
      "/docs/legal/terms",
    );
  });

  it("maps a folder index to the folder's own route", () => {
    expect(resolveSuccessorUrl("./handbook/index.md", "refund-policy.md", PAGES)).toBe(
      "/docs/handbook",
    );
  });

  // The pair that a route alone cannot tell apart, and the reason this
  // resolves against the SOURCE PATH: /docs/legal and /docs/handbook look
  // identical as routes, but `./terms.md` means a different document in each.
  it("reads a sibling pointer from a FILE as a sibling, even when a same-named folder child exists", () => {
    // knowledge/legal.md is a file, so ./terms.md is knowledge/terms.md —
    // NOT knowledge/legal/terms.md, which also exists.
    expect(resolveSuccessorUrl("./terms.md", "legal.md", PAGES)).toBe("/docs/terms");
  });

  it("reads a sibling pointer from a FOLDER INDEX as its folder's child", () => {
    // knowledge/handbook/index.md is inside the folder, so ./terms.md is
    // knowledge/handbook/terms.md.
    expect(resolveSuccessorUrl("./terms.md", "handbook/index.md", PAGES)).toBe(
      "/docs/handbook/terms",
    );
  });

  it("carries an anchor through", () => {
    expect(resolveSuccessorUrl("./refund-policy-v5.md#scope", "refund-policy.md", PAGES)).toBe(
      "/docs/refund-policy-v5#scope",
    );
  });

  it("yields null rather than a dead link when the document is not in this build", () => {
    // `pnpm check` proves the target exists in the record, but a per-audience
    // build stages a SUBSET — the successor may legitimately be absent here.
    expect(resolveSuccessorUrl("./nowhere.md", "refund-policy.md", PAGES)).toBeNull();
  });

  it("yields null for a pointer that leaves the record", () => {
    expect(resolveSuccessorUrl("https://example.com/v5.md", "refund-policy.md", PAGES)).toBeNull();
    expect(resolveSuccessorUrl("/terms.md", "refund-policy.md", PAGES)).toBeNull();
  });

  it("tolerates a windows-shaped source path", () => {
    expect(resolveSuccessorUrl("./terms.md", "legal\\notes.md", PAGES)).toBe("/docs/legal/terms");
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

describe("governanceVisible — a group written as a flow mapping", () => {
  // `site: { governance: false }` parses as a SCALAR with no children, so a
  // block-only scan never sees the key and silently returns the default —
  // publishing the governance the owner turned off. The checker refuses this
  // shape; the site refuses it too, because a silent default is the one
  // outcome this setting must never have.
  it("refuses a flow mapping rather than defaulting past it", () => {
    expect(() => governanceVisible("site: { governance: false }")).toThrowError(/site:/);
    expect(() =>
      governanceVisible('site: { url: "https://acme.example", governance: false }'),
    ).toThrowError(/site:/);
  });

  it("still ignores a site: key that carries only a comment", () => {
    expect(governanceVisible("site: # nothing yet\n  governance: false")).toBe(false);
  });
});

describe("readGovernance — YAML types that are not strings", () => {
  it("shows a number rather than dropping it", () => {
    // `effective: 2026` types as a NUMBER, and used to vanish from the page
    // entirely — the record declared it and the page said nothing. The checker
    // refuses it now; this is the honest fallback if one slips through.
    expect(readGovernance({ status: "approved", effective: 2026 }, "k.md")).toMatchObject({
      effective: "2026",
    });
  });

  it("still drops a value with no readable text", () => {
    expect(
      readGovernance({ status: "approved", effective: Number.NaN, owner: {} }, "k.md"),
    ).toMatchObject({ effective: null, owner: null });
  });
});

describe("governanceVisible — whitespace YAML allows", () => {
  it("reads a key written with a space before its colon", () => {
    // js-yaml accepts `governance : false`, and the checker's nested-key regex
    // (`\s*:`) does too — the site's did not, so the setting was read by both
    // of them and silently ignored by the one that decides (round 3).
    expect(governanceVisible("site:\n  governance : false")).toBe(false);
    expect(governanceVisible("site :\n  governance: false")).toBe(false);
    expect(governanceVisible("site :\n  governance : false")).toBe(false);
  });
});

describe("isCalendarDate", () => {
  it("accepts a real day", () => {
    expect(isCalendarDate("2026-04-01")).toBe(true);
    expect(isCalendarDate("2024-02-29")).toBe(true); // a real leap day
  });

  it("rejects a date-SHAPED string that is not a day", () => {
    // These reach the renderer through the checker's own remedy — it refuses
    // them unquoted and tells the author to quote them. Stamped into
    // <time datetime> they are invalid HTML, and a consumer reading
    // "2026-06-31" gets July 1st: the rollover the whole rule exists to stop.
    for (const value of ["2026-06-31", "2026-13-45", "2026-02-30", "2026-00-10"]) {
      expect(isCalendarDate(value), value).toBe(false);
    }
  });

  it("rejects anything that is not a plain date at all", () => {
    for (const value of ["Q1 2026", "2026-4-1", "2026", "", "2026-04-01T00:00:00Z"]) {
      expect(isCalendarDate(value), value).toBe(false);
    }
  });
});

// The AGENT surface's half of the same projection. The page gained a
// supersession notice; llms.txt and llms-full.txt kept serving the withdrawn
// document as ordinary prose, so an agent reading the record answered from a
// policy the reader was warned about (measured on shipped bytes,
// research/site-design.md F1). These two functions are what close that.
describe("agentIndexSuffix — the compact index line", () => {
  const g = (over: Partial<DocumentGovernance> = {}): DocumentGovernance => ({
    status: "approved",
    owner: null,
    provenance: [],
    effective: null,
    supersededBy: null,
    ...over,
  });

  it("says nothing for an approved document", () => {
    // The index is one line per document; a marker on every line is noise, and
    // "approved" is what an unmarked entry already means.
    expect(agentIndexSuffix(g(), null)).toBe("");
  });

  it("marks a caveat status in the shape an agent can match", () => {
    expect(agentIndexSuffix(g({ status: "draft" }), null)).toBe(" — DRAFT");
    expect(agentIndexSuffix(g({ status: "review" }), null)).toBe(" — REVIEW");
  });

  it("names the successor by its RESOLVED route, never the raw pointer", () => {
    // `./refund-policy-v5.md` is meaningless to a consumer that never sees the
    // record's file tree — it needs the address it can actually fetch.
    expect(
      agentIndexSuffix(
        g({ status: "superseded", supersededBy: "./refund-policy-v5.md" }),
        "/docs/refund-policy-v5",
      ),
    ).toBe(" — SUPERSEDED, replaced by /docs/refund-policy-v5");
  });

  it("still says SUPERSEDED when the successor is outside this build", () => {
    // A per-audience build stages a subset, so the successor may be absent.
    // Dropping the warning with it would serve the withdrawn document clean.
    expect(agentIndexSuffix(g({ status: "superseded", supersededBy: "./x.md" }), null)).toBe(
      " — SUPERSEDED",
    );
  });

  it("carries an undeclared status without inventing one", () => {
    expect(agentIndexSuffix(g({ status: null }), null)).toBe("");
  });
});

describe("agentFrontmatter — the full corpus block", () => {
  const g = (over: Partial<DocumentGovernance> = {}): DocumentGovernance => ({
    status: "approved",
    owner: null,
    provenance: [],
    effective: null,
    supersededBy: null,
    ...over,
  });

  it("emits the status even when it is approved", () => {
    // The opposite call to the page's. A reader assumes a document in a record
    // is current; a consumer assumes nothing, and silence is what caused F1.
    expect(agentFrontmatter(g(), null)).toBe("---\nstatus: approved\n---\n");
  });

  it("emits every declared key, successor resolved", () => {
    expect(
      agentFrontmatter(
        g({
          status: "superseded",
          owner: "Finance",
          effective: "2026-01-15",
          provenance: ["Board minutes 2026-01-11", "Terms of service v4"],
          supersededBy: "./refund-policy-v5.md",
        }),
        "/docs/refund-policy-v5",
      ),
    ).toBe(
      [
        "---",
        "status: superseded",
        "owner: Finance",
        "effective: 2026-01-15",
        "superseded_by: /docs/refund-policy-v5",
        "provenance:",
        "  - Board minutes 2026-01-11",
        "  - Terms of service v4",
        "---",
        "",
      ].join("\n"),
    );
  });

  it("omits an undeclared key rather than emitting an empty one", () => {
    // The page's negative promise, kept here: a placeholder reads as governed.
    const block = agentFrontmatter(g({ owner: "Finance" }), null);
    expect(block).toBe("---\nstatus: approved\nowner: Finance\n---\n");
    expect(block).not.toContain("effective");
    expect(block).not.toContain("provenance");
  });

  it("quotes a value that would not survive a YAML round trip", () => {
    // The record's own rule: an unquoted colon breaks the parse. A consumer
    // parsing this block must get back what the record said.
    expect(agentFrontmatter(g({ owner: "Finance: payments" }), null)).toContain(
      'owner: "Finance: payments"',
    );
  });

  it("emits nothing at all when the document declares no governance", () => {
    expect(
      agentFrontmatter(
        { status: null, owner: null, provenance: [], effective: null, supersededBy: null },
        null,
      ),
    ).toBe("");
  });
});

// A provenance entry that IS a source URL should be followable. Measured on a
// built scaffold: 0 of 3 entries were links, so an intranet URL rendered as
// dead grey text (research/site-design.md F5). Provenance is load-bearing —
// a source nobody can open is weaker than the record makes it.
describe("sourceHref", () => {
  it("links an entry that is nothing but an http(s) URL", () => {
    expect(sourceHref("https://intranet.example.com/finance/policy-4-2")).toBe(
      "https://intranet.example.com/finance/policy-4-2",
    );
    expect(sourceHref("http://wiki.internal/policy")).toBe("http://wiki.internal/policy");
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(sourceHref("  https://x.test/y  ")).toBe("https://x.test/y");
  });

  it("leaves a citation alone — the common case", () => {
    // The record's own house style: "Finance policy manual §4.2, approved
    // 2025-11-03". Nothing to open, and turning part of it into a link would
    // invent a destination.
    expect(sourceHref("Finance policy manual §4.2, approved 2025-11-03")).toBeNull();
    expect(sourceHref("Board resolution 2025-19")).toBeNull();
  });

  it("refuses an entry that merely CONTAINS a URL", () => {
    // Linkifying inside prose would have to guess where the URL ends, and the
    // whole entry is the citation — not the fragment inside it.
    expect(sourceHref("See https://x.test/y for the signed copy")).toBeNull();
  });

  it("refuses every scheme that is not http(s)", () => {
    // `provenance` is AUTHORED content. A javascript: or data: URL rendered
    // into an href would execute on click — the record must never be able to
    // put a script in the page that serves it.
    for (const hostile of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(sourceHref(hostile), hostile).toBeNull();
    }
    // …and the merely-unsupported ones, which are citations, not links.
    expect(sourceHref("mailto:records@example.com")).toBeNull();
    expect(sourceHref("ftp://archive.example.com/policy.pdf")).toBeNull();
  });

  it("refuses a malformed URL rather than emitting a broken href", () => {
    expect(sourceHref("https://")).toBeNull();
    expect(sourceHref("")).toBeNull();
    expect(sourceHref("   ")).toBeNull();
  });
});
