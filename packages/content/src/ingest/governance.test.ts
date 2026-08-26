/**
 * The projection from a parsed `Concept` onto the row (`content_nodes`,
 * schema 2.5). It is the last step before governance becomes DATA, and it had
 * no test of its own: the file's previous suite tested
 * `governanceFromFrontmatter`, the hand-rolled five-key reader decision 26
 * deleted, and went with it — leaving the projection that survived unasserted.
 *
 * Two of its three branches could not state an absence honestly. Both are
 * unreachable through `parseConcept` (the profile requires `generated.by` to
 * be an actor and derives the tier from `verified`), which is exactly why they
 * are asserted here: `governanceOf` takes a `Concept`, an INTERFACE any kernel
 * caller can build, and what it wrote in those states was not "nothing" but a
 * plausible-looking lie on a governance column — a producer literally named
 * `undefined`, and a `trust_tier` of -1 wearing the type `0 | 1 | 2`.
 */
import { describe, expect, it } from "vitest";

import { parseConcept, TRUST_TIERS, type Concept, type TrustTier } from "../record/profile.js";
import { governanceOf, NO_GOVERNANCE, sectionGovernance, trustTierNumber } from "./governance.js";

/** A minimal well-formed concept, so each test mutates ONE field away from it. */
const concept = (over: Partial<Concept> = {}): Concept => ({
  path: "knowledge/a.md",
  id: "a",
  type: "Document",
  reserved: false,
  title: "A",
  description: "One sentence.",
  status: "stable",
  order: null,
  audience: ["public"],
  owner: null,
  generatedAt: null,
  approval: null,
  deprecated: null,
  verified: [],
  trustTier: "unverified",
  effectiveFrom: null,
  staleAfter: null,
  supersededBy: null,
  sourceIds: [],
  frontmatter: {},
  ...over,
});

/** The profile's own reader, so the "real path" assertions cannot drift from it. */
const parsed = (frontmatter: Record<string, unknown>): Concept => {
  const result = parseConcept("knowledge/a.md", frontmatter);
  if (!result.ok) throw new Error(`fixture is not a concept: ${JSON.stringify(result.refusals)}`);
  return result.concept;
};

const VALID = {
  type: "Document",
  title: "A",
  description: "One sentence.",
  status: "stable",
  generated: { by: "claude-code/1.0", at: "2026-08-20T09:00:00Z" },
  ksor: {
    audience: ["public"],
    approval: { by: "human:cfo", at: "2026-08-21T09:00:00Z" },
  },
} as const;

describe("trustTierNumber", () => {
  it.each(TRUST_TIERS.map((tier, i) => [tier, i] as const))("%s is %i", (tier, index) => {
    expect(trustTierNumber(tier)).toBe(index);
  });

  it("refuses a tier the vocabulary does not hold, rather than storing -1 as a tier", () => {
    // `TRUST_TIERS.indexOf(...) as 0 | 1 | 2` returned -1 with a valid-looking
    // type, and -1 reaches `content_nodes.trust_tier` as a number no reader
    // interprets — below `unverified`, which is already the floor.
    expect(() => trustTierNumber("reviewed-by-someone" as TrustTier)).toThrow(
      /reviewed-by-someone/,
    );
  });
});

describe("governanceOf — the projection onto the row", () => {
  it("carries every governance fact the profile parsed", () => {
    const g = governanceOf(
      parsed({
        ...VALID,
        sources: [{ id: "fin", resource: "https://example.com/h.pdf", title: "Handbook" }],
        verified: [{ by: "human:kim", at: "2026-08-21T14:00:00Z" }],
        stale_after: "2027-08-21T00:00:00Z",
        ksor: {
          ...VALID.ksor,
          owner: "team:finance",
          effective_from: "2026-09-01T00:00:00Z",
        },
      }),
    );
    expect(g).toEqual({
      audience: ["public"],
      docStatus: "stable",
      owner: "team:finance",
      sources: [{ id: "fin", resource: "https://example.com/h.pdf", title: "Handbook" }],
      verified: [{ by: "human:kim", at: "2026-08-21T14:00:00.000Z" }],
      generated: { by: "claude-code/1.0", at: "2026-08-20T09:00:00.000Z" },
      approval: { by: "human:cfo", at: "2026-08-21T09:00:00.000Z" },
      deprecated: null,
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      staleAfter: "2027-08-21T00:00:00.000Z",
      trustTier: 2,
      supersededBy: null,
    });
  });

  it("distinguishes an absent list from an empty one — null is `the document said nothing`", () => {
    const g = governanceOf(
      parsed({
        type: "Document",
        title: "A",
        description: "One sentence.",
        status: "draft",
        ksor: { audience: ["public"] },
      }),
    );
    expect(g.sources).toBeNull();
    expect(g.verified).toBeNull();
    expect(g.approval).toBeNull();
    expect(g.generated).toBeNull();
    expect(g.trustTier).toBe(0);
  });

  it("stamps the supersession pointer as a stable_id, not as a bundle id", () => {
    const g = governanceOf(
      parsed({
        ...VALID,
        status: "deprecated",
        ksor: {
          ...VALID.ksor,
          superseded_by: "policies/purchase-approval",
          deprecated: { by: "human:ciso", at: "2026-08-22T10:00:00Z" },
        },
      }),
    );
    expect(g.supersededBy).toBe("knowledge/policies/purchase-approval");
    expect(g.deprecated).toEqual({ by: "human:ciso", at: "2026-08-22T10:00:00.000Z" });
  });

  it("refuses a `generated:` it cannot attribute, rather than naming the producer `undefined`", () => {
    // `String(record["by"])` on an absent key yields the seven-character string
    // "undefined" — a producer that does not exist, written into a column that
    // records WHO (decision 21). The profile makes this unreachable
    // (`generated.by` is an actor); reaching it means something upstream broke,
    // and a loud stop is the only honest answer left.
    expect(() =>
      governanceOf(concept({ frontmatter: { generated: { at: "2026-08-20T09:00:00Z" } } })),
    ).toThrow(/generated\.by/);
    expect(() => governanceOf(concept({ frontmatter: { generated: {} } }))).toThrow(
      /knowledge\/a\.md/,
    );
    // An array is an object to `typeof`, and it carries no `by` either.
    expect(() => governanceOf(concept({ frontmatter: { generated: [] } }))).toThrow(
      /generated\.by/,
    );
  });

  it("a `generated:` that is not a mapping at all is the document saying nothing", () => {
    // Also unreachable — the profile refuses it — but it is the one shape where
    // "the key is not there in any readable sense" is the truthful reading.
    expect(governanceOf(concept({ frontmatter: { generated: "claude-code/1.0" } })).generated).toBe(
      null,
    );
    expect(governanceOf(concept({ frontmatter: { generated: null } })).generated).toBe(null);
  });

  it("carries source entries as authored, unknown keys included (OKF §11)", () => {
    // The projection reads the RAW frontmatter, so a key the profile's `source`
    // schema strips still reaches the row. That is the preserve-unknown-keys
    // rule, not an accident, so it is pinned rather than left to be discovered.
    const g = governanceOf(
      parsed({
        ...VALID,
        sources: [{ resource: "https://example.com/h.pdf", retrieved: "2026-08-01" }],
      }),
    );
    expect(g.sources).toEqual([{ resource: "https://example.com/h.pdf", retrieved: "2026-08-01" }]);
  });
});

describe("sectionGovernance — a section carries only what its descendants reach", () => {
  it("unions and sorts the descendants' lists, and declares nothing else", () => {
    expect(sectionGovernance([["internal", "public"], ["board"], ["public"]])).toEqual({
      ...NO_GOVERNANCE,
      audience: ["board", "internal", "public"],
    });
  });

  it("a section with no descendant carries an EMPTY list, never a null one", () => {
    // Null is `ksor-audience-missing` territory — a pre-profile row. An empty
    // directory is a different fact and both are served to nobody, so the
    // difference has to survive the projection.
    expect(sectionGovernance([]).audience).toEqual([]);
  });
});
