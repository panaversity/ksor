import { describe, expect, it } from "vitest";

import {
  expandTier,
  firstHeading,
  firstSentence,
  migrateConcept,
  migrateInstance,
  migrateSummary,
  modelOf,
  slugify,
  stripDuplicateHeading,
  stripLeadingHeading,
  widenToInstant,
  type ConceptContext,
} from "./rules.js";

const CTX: ConceptContext = {
  version: "1.2.3",
  actor: "human:kim",
  approveBy: null,
  instant: "2026-08-25T12:00:00Z",
  model: { tiers: [], defaultVisibility: null },
};
const AT = "2026-08-20T09:00:00Z";
const doc = (fm: string): string => `---\n${fm}---\n\nBody.\n`;

describe("expandTier — the ranked model expands upward", () => {
  const ranked = { tiers: ["public", "internal", "board"], defaultVisibility: null };

  it("keeps every tier at or above the declared one", () => {
    expect(expandTier(ranked, "internal")).toEqual(["internal", "board"]);
    expect(expandTier(ranked, "public")).toEqual(["public", "internal", "board"]);
    expect(expandTier(ranked, "board")).toEqual(["board"]);
  });

  it("falls back to default_visibility, then to the least-privileged tier", () => {
    expect(expandTier({ ...ranked, defaultVisibility: "internal" }, null)).toEqual([
      "internal",
      "board",
    ]);
    expect(expandTier(ranked, null)).toEqual(["public", "internal", "board"]);
  });

  it("is [public] when the record declares no model at all", () => {
    expect(expandTier({ tiers: [], defaultVisibility: null }, null)).toEqual(["public"]);
  });

  // Fail-closed, and visible in the diff: only that identifier can read it.
  it("keeps an unregistered tier as its own audience rather than guessing", () => {
    expect(expandTier(ranked, "internl")).toEqual(["internl"]);
  });
});

describe("the small derivations", () => {
  it("slugifies a free-text provenance string into a footnote-usable id", () => {
    expect(slugify('KSoR README, "What Is a Knowledge System of Record?"')).toBe(
      "ksor-readme-what-is-a-knowledge-system-of-record",
    );
    expect(slugify("§§§")).toBe("source");
  });

  it("widens a bare date to midnight UTC and leaves an instant alone", () => {
    expect(widenToInstant("2026-08-22")).toBe("2026-08-22T00:00:00Z");
    expect(widenToInstant("2026-08-22T09:00:00Z")).toBe("2026-08-22T09:00:00Z");
    expect(widenToInstant("soon")).toBeNull();
  });

  it("reads the first H1, ignoring one inside a fenced block", () => {
    expect(firstHeading("```\n# not a heading\n```\n\n# Real\n")).toBe("Real");
    expect(firstHeading("no heading here\n")).toBeNull();
  });

  it("takes one sentence from the first prose paragraph, skipping headings and lists", () => {
    expect(firstSentence("# H\n\n- a list\n\nOne. Two.\n")).toBe("One.");
    expect(firstSentence("# H\n")).toBeNull();
  });

  it("strips a body heading only when it repeats the title", () => {
    expect(stripDuplicateHeading("\n# About A\n\nBody.\n", "About  a")).toBe("\nBody.\n");
    expect(stripDuplicateHeading("\n# Something else\n\nBody.\n", "About A")).toBe(
      "\n# Something else\n\nBody.\n",
    );
    expect(stripDuplicateHeading("\nBody.\n", "About A")).toBe("\nBody.\n");
  });

  it("strips only a LEADING heading", () => {
    expect(stripLeadingHeading("# H\n\nbody\n")).toBe("body\n");
    expect(stripLeadingHeading("intro\n\n# H\n")).toBe("intro\n\n# H\n");
  });

  it("reads the ordered model off a pre-profile instance", () => {
    expect(modelOf({ audiences: ["public", "internal"], default_visibility: "internal" })).toEqual({
      tiers: ["public", "internal"],
      defaultVisibility: "internal",
    });
    expect(modelOf({})).toEqual({ tiers: [], defaultVisibility: null });
  });
});

describe("migrateConcept", () => {
  const run = (fm: string, ctx: Partial<ConceptContext> = {}): ReturnType<typeof migrateConcept> =>
    migrateConcept("knowledge/a.md", doc(fm), AT, { ...CTX, ...ctx });

  it("maps every pre-profile key and drops the originals", () => {
    const r = run(
      "title: A\ndescription: About A.\nstatus: approved\nowner: Product\norder: 2\neffective: 2026-08-22\nprovenance:\n  - Handbook §3\n",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.text).toBe(
      [
        "---",
        "type: Document",
        "title: A",
        "description: About A.",
        "status: draft",
        "order: 2",
        "generated: {by: ksor-migrate/1.2.3, at: 2026-08-20T09:00:00Z}",
        "sources:",
        "  - id: handbook-3",
        "    title: Handbook §3",
        "    resource: Handbook §3",
        "ksor:",
        "  audience: [public]",
        "  owner: Product",
        "  effective_from: 2026-08-22T00:00:00Z",
        "---",
        "",
        "Body.",
        "",
      ].join("\n"),
    );
  });

  it("makes an approved document stable only when someone is performing the approval", () => {
    const bare = run("title: A\ndescription: A.\nstatus: approved\n");
    expect(bare.ok && bare.outcome.text).toContain("status: draft");
    const approved = run("title: A\ndescription: A.\nstatus: approved\n", {
      approveBy: "human:cfo",
    });
    expect(approved.ok && approved.outcome.text).toContain("status: stable");
    expect(approved.ok && approved.outcome.text).toContain(
      "approval: {by: human:cfo, at: 2026-08-25T12:00:00Z}",
    );
  });

  it("turns superseded into deprecated with a resolved pointer", () => {
    const r = migrateConcept(
      "knowledge/policies/old.md",
      doc("title: Old\ndescription: Old.\nstatus: superseded\nsuperseded_by: ./new.md\n"),
      AT,
      CTX,
    );
    expect(r.ok && r.outcome.text).toContain("superseded_by: policies/new");
    expect(r.ok && r.outcome.text).toContain("deprecated: {by: human:kim, at:");
  });

  it("refuses to deprecate without an actor to name", () => {
    const r = run("title: A\ndescription: A.\nstatus: superseded\n", { actor: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals.map((x) => x.slug)).toEqual(["ksor-migrate-underivable"]);
    expect(r.refusals[0]!.fix).toContain("--actor");
  });

  it("refuses a missing title, description or generated.at by name, all at once", () => {
    const r = migrateConcept("knowledge/a.md", doc("status: draft\n"), null, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals).toHaveLength(3);
    expect(new Set(r.refusals.map((x) => x.slug))).toEqual(new Set(["ksor-migrate-underivable"]));
  });

  it("preserves an unknown key (OKF §11) and puts it before the ksor block", () => {
    const r = run("title: A\ndescription: A.\nstatus: draft\nx-team-note: keep me\n");
    expect(r.ok && r.outcome.text).toContain("x-team-note: keep me");
    expect(r.ok && r.outcome.text.indexOf("x-team-note")).toBeLessThan(
      (r.ok && r.outcome.text.indexOf("ksor:")) as number,
    );
  });

  /**
   * The three LEGACY_KEYS migrate never touched. `sor_id` is the dangerous one:
   * dropping it silently CHANGES the document's stable_id from the sor_id value
   * to its path, which breaks every denylist row and citation keyed on the old
   * one. `id`/`name` are pure duplicates of the path and are deleted. Leaving
   * all three in place produced a tree the checker refuses AND an infinite
   * fix-loop that re-minted `ksor.approval.at` on every pass, because
   * `hasProfileShape` stays false while any legacy key is present.
   */
  it("refuses sor_id by name rather than dropping a stable_id nobody can recover", () => {
    const r = run("title: A\ndescription: A.\nstatus: draft\nsor_id: legacy-purchase-approval\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals.map((x) => x.slug)).toEqual(["ksor-migrate-underivable"]);
    expect(r.refusals[0]!.why).toContain("legacy-purchase-approval");
    expect(r.refusals[0]!.why).toContain("`a`");
    expect(r.refusals[0]!.fix).toMatch(/denylist|takedown/);
  });

  it("deletes id and name, which only ever restated the path", () => {
    const r = run("title: A\ndescription: A.\nstatus: draft\nid: a\nname: a\n");
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.text).not.toContain("\nid:");
    expect(r.outcome.text).not.toContain("\nname:");
    // Idempotent: the rewritten tree is in the profile's shape, so a second
    // run is a no-op and cannot re-mint a governance instant.
    const again = migrateConcept("knowledge/a.md", r.outcome.text, AT, CTX);
    expect(again.ok && again.outcome.changed).toBe(false);
    expect(again.ok && again.outcome.text).toBe(r.outcome.text);
  });

  it("refuses a superseded_by that escapes the record instead of writing null", () => {
    const r = migrateConcept(
      "knowledge/a.md",
      doc("title: A\ndescription: A.\nstatus: superseded\nsuperseded_by: ../../elsewhere/b.md\n"),
      AT,
      CTX,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals.map((x) => x.slug)).toEqual(["ksor-migrate-underivable"]);
    expect(r.refusals[0]!.why).toContain("../../elsewhere/b.md");
  });

  it("refuses a superseded_by on a document that is not being deprecated", () => {
    // The checker refuses that tree as `ksor-supersession-strands`; migrate
    // knows it first, and a refusal migrate produced itself is not a fix loop.
    const r = run("title: A\ndescription: A.\nstatus: draft\nsuperseded_by: ./b.md\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals.map((x) => x.slug)).toEqual(["ksor-migrate-underivable"]);
    expect(r.refusals[0]!.why).toContain("ksor-supersession-strands");
    expect(r.refusals[0]!.fix).toContain("status: superseded");
  });

  it("leaves a document that is already in the profile byte-identical", () => {
    const already = doc(
      "type: Document\ntitle: A\ndescription: A.\nstatus: draft\nksor:\n  audience: [public]\n",
    );
    const r = migrateConcept("knowledge/a.md", already, AT, CTX);
    expect(r.ok && r.outcome.changed).toBe(false);
    expect(r.ok && r.outcome.text).toBe(already);
  });
});

describe("migrateSummary", () => {
  it("adds the marker to a bare companion and leaves a marked one alone", () => {
    const added = migrateSummary("knowledge/a.summary.md", "The short version.\n");
    expect(added.ok && added.outcome.text).toBe("---\ntype: Summary\n---\nThe short version.\n");
    const already = "---\ntype: Summary\n---\n\nThe short version.\n";
    const kept = migrateSummary("knowledge/a.summary.md", already);
    expect(kept.ok && kept.outcome.changed).toBe(false);
  });

  it("replaces frontmatter that claimed governance a companion cannot carry", () => {
    const r = migrateSummary("knowledge/a.summary.md", "---\nvisibility: public\n---\n\nShort.\n");
    expect(r.ok && r.outcome.text).toBe("---\ntype: Summary\n---\n\nShort.\n");
  });
});

describe("migrateInstance", () => {
  it("moves the H1 into title, the stamp into toolchain, and derives a description", () => {
    const r = migrateInstance(
      '---\nformat: 1\nname: acme\nksor:\n  requires: ">=1.0.0"\n  scaffolded: "1.0.0"\naudiences: [public, internal]\n---\n\n# Acme\n\nWhat Acme knows. And more.\n',
      { directory: "acme-record" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.model).toEqual({ tiers: ["public", "internal"], defaultVisibility: null });
    expect(r.outcome.text).toBe(
      [
        "---",
        "format: 2",
        "name: acme",
        "title: Acme",
        "description: What Acme knows.",
        "toolchain:",
        '  requires: ">=1.0.0"',
        '  scaffolded: "1.0.0"',
        "---",
        "",
        "What Acme knows. And more.",
        "",
      ].join("\n"),
    );
  });

  it("derives `name` from the directory when the instance declared none", () => {
    const r = migrateInstance("# Acme\n\nWhat Acme knows.\n", { directory: "acme-record" });
    expect(r.ok && r.outcome.text).toContain("name: acme-record");
  });

  it("refuses a directory name the identity grammar does not accept", () => {
    const r = migrateInstance("# Acme\n\nWhat Acme knows.\n", { directory: "Acme Record" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals[0]!.slug).toBe("ksor-migrate-underivable");
  });

  it("leaves a format-2 instance byte-identical", () => {
    const already = "---\nformat: 2\nname: acme\ntitle: Acme\ndescription: A.\n---\n\nBody.\n";
    const r = migrateInstance(already, { directory: "acme" });
    expect(r.ok && r.outcome.changed).toBe(false);
    expect(r.ok && r.outcome.text).toBe(already);
  });

  it("keeps the adopter's comments — the commented `database:` block is their runbook", () => {
    const r = migrateInstance(
      "---\nformat: 1\nname: acme\n# database:\n#   dsn_env: KSOR_DB_URL\n---\n\n# Acme\n\nWhat Acme knows.\n",
      { directory: "acme" },
    );
    expect(r.ok && r.outcome.text).toContain("#   dsn_env: KSOR_DB_URL");
  });
});
