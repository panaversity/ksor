import { describe, expect, it } from "vitest";

import { LEGACY_KEYS, parseConcept, RESERVED_TYPES } from "./profile.js";

const P = "knowledge/policies/purchase-approval.md";

const STABLE = {
  type: "Policy",
  title: "Purchase approval",
  description: "Who may approve a purchase.",
  status: "stable",
  order: 2,
  generated: { by: "claude-code/1.0", at: "2026-08-20T09:00:00Z" },
  sources: [{ id: "fin-2024", resource: "https://x/y.pdf", title: "Finance handbook 2024" }],
  verified: [{ by: "human:kim", at: "2026-08-21T14:00:00Z" }],
  stale_after: "2027-08-21T00:00:00Z",
  ksor: {
    audience: ["public"],
    owner: "team:finance",
    approval: { by: "human:cfo", at: "2026-08-22T10:00:00Z" },
    effective_from: "2026-09-01T00:00:00Z",
  },
};

function slugsOf(fm: Record<string, unknown>): string[] {
  const r = parseConcept(P, fm);
  return r.ok ? [] : r.refusals.map((x) => x.slug);
}

describe("parseConcept — the §2 concept schema", () => {
  it("accepts the spec's example and derives what the rest of the module needs", () => {
    const r = parseConcept(P, STABLE);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.concept.id).toBe("policies/purchase-approval");
    expect(r.concept.type).toBe("Policy");
    expect(r.concept.reserved).toBe(true);
    expect(r.concept.audience).toEqual(["public"]);
    expect(r.concept.trustTier).toBe("human-reviewed");
    expect(r.concept.generatedAt).toBe(Date.parse("2026-08-20T09:00:00Z"));
    expect(r.concept.staleAfter).toBe(Date.parse("2027-08-21T00:00:00Z"));
    expect(r.concept.effectiveFrom).toBe(Date.parse("2026-09-01T00:00:00Z"));
    expect(r.concept.sourceIds).toEqual(["fin-2024"]);
  });

  it("the eight reserved types are the KSP 4.2.1 list; Document is not one of them", () => {
    expect(RESERVED_TYPES).toContain("Decision Record");
    expect(RESERVED_TYPES).toHaveLength(8);
    expect(RESERVED_TYPES).not.toContain("Document");
  });

  it("a level-0 Document needs only the floor keys", () => {
    const r = parseConcept("knowledge/what-is-a-ksor.md", {
      type: "Document",
      title: "What is a KSoR",
      description: "One sentence.",
      status: "draft",
      ksor: { audience: ["public"] },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.concept.reserved).toBe(false);
    expect(r.concept.trustTier).toBe("unverified");
  });

  it("ksor-missing-key names every absent floor key, one refusal each", () => {
    const r = parseConcept(P, { ksor: { audience: ["public"] } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals.map((x) => x.slug)).toEqual([
      "ksor-missing-key",
      "ksor-missing-key",
      "ksor-missing-key",
      "ksor-missing-key",
    ]);
    for (const key of ["type", "title", "description", "status"]) {
      expect(
        r.refusals.some((x) => x.why.startsWith(`\`${key}\``)),
        key,
      ).toBe(true);
    }
  });

  it("ksor-status-unknown for a status outside draft | stable | deprecated", () => {
    expect(slugsOf({ ...STABLE, status: "approved" })).toEqual(["ksor-status-unknown"]);
  });

  it("ksor-audience-missing: omission is refused, never defaulted; an empty list too", () => {
    expect(slugsOf({ ...STABLE, ksor: { owner: "team:finance" } })).toContain(
      "ksor-audience-missing",
    );
    expect(slugsOf({ ...STABLE, ksor: { ...STABLE.ksor, audience: [] } })).toContain(
      "ksor-audience-missing",
    );
    expect(slugsOf({ ...STABLE, ksor: { ...STABLE.ksor, audience: "public" } })).toContain(
      "ksor-audience-missing",
    );
  });

  it("stable needs generated.at (ksor-stable-ungenerated) and ksor.approval (ksor-stable-unapproved)", () => {
    expect(slugsOf({ ...STABLE, generated: undefined })).toEqual(["ksor-stable-ungenerated"]);
    expect(slugsOf({ ...STABLE, generated: { by: "claude-code/1.0" } })).toEqual([
      "ksor-stable-ungenerated",
    ]);
    const { approval: _a, ...rest } = STABLE.ksor;
    expect(slugsOf({ ...STABLE, ksor: rest })).toEqual(["ksor-stable-unapproved"]);
  });

  it("ksor-generated-after-approval compares the two instants; equal passes", () => {
    const at = "2026-08-22T10:00:00Z";
    expect(slugsOf({ ...STABLE, generated: { by: "x/1", at } })).toEqual([]);
    expect(slugsOf({ ...STABLE, generated: { by: "x/1", at: "2026-08-22T10:00:01Z" } })).toEqual([
      "ksor-generated-after-approval",
    ]);
  });

  it("a draft needs neither generated nor approval", () => {
    expect(
      slugsOf({
        ...STABLE,
        status: "draft",
        generated: undefined,
        ksor: { audience: ["public"], owner: "team:finance" },
      }),
    ).toEqual([]);
  });

  it("deprecated needs ksor.deprecated { by, at } (ksor-deprecated-unattributed)", () => {
    expect(slugsOf({ ...STABLE, status: "deprecated" })).toEqual(["ksor-deprecated-unattributed"]);
    const r = parseConcept(P, {
      ...STABLE,
      status: "deprecated",
      ksor: {
        ...STABLE.ksor,
        deprecated: { by: "human:cfo", at: "2026-09-01T00:00:00Z" },
        superseded_by: "policies/purchase-approval-v2",
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.concept.supersededBy).toBe("policies/purchase-approval-v2");
    expect(r.concept.deprecated?.by).toBe("human:cfo");
  });

  it("a reserved type needs sources and ksor.owner; a custom type needs neither", () => {
    expect(slugsOf({ ...STABLE, sources: undefined })).toEqual(["ksor-reserved-type-unsourced"]);
    expect(slugsOf({ ...STABLE, sources: [] })).toEqual(["ksor-reserved-type-unsourced"]);
    expect(
      slugsOf({ ...STABLE, ksor: { audience: ["public"], approval: STABLE.ksor.approval } }),
    ).toEqual(["ksor-reserved-type-unowned"]);
    expect(
      slugsOf({
        ...STABLE,
        type: "Runbook",
        sources: undefined,
        ksor: { audience: ["public"], approval: STABLE.ksor.approval },
      }),
    ).toEqual([]);
  });

  it("ksor-source-unresourced: every source carries resource", () => {
    expect(slugsOf({ ...STABLE, sources: [{ id: "a", title: "A" }] })).toEqual([
      "ksor-source-unresourced",
    ]);
  });

  it("a bare verified mapping is one verification (OKF §5.2 MUST)", () => {
    const r = parseConcept(P, {
      ...STABLE,
      verified: { by: "process:nightly", at: "2026-08-21T00:00:00Z" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.concept.verified).toHaveLength(1);
    expect(r.concept.trustTier).toBe("machine-confirmed");
  });

  it("ksor-actor-form: team: is refused in verified, generated, approval and deprecated — not in owner", () => {
    expect(
      slugsOf({ ...STABLE, verified: [{ by: "team:finance", at: "2026-08-21T00:00:00Z" }] }),
    ).toEqual(["ksor-actor-form"]);
    expect(
      slugsOf({ ...STABLE, generated: { by: "team:finance", at: "2026-08-20T09:00:00Z" } }),
    ).toEqual(["ksor-actor-form"]);
    expect(
      slugsOf({
        ...STABLE,
        ksor: { ...STABLE.ksor, approval: { by: "team:finance", at: "2026-08-22T10:00:00Z" } },
      }),
    ).toEqual(["ksor-actor-form"]);
    expect(
      slugsOf({
        ...STABLE,
        status: "deprecated",
        ksor: { ...STABLE.ksor, deprecated: { by: "team:finance", at: "2026-09-01T00:00:00Z" } },
      }),
    ).toEqual(["ksor-actor-form"]);
    expect(slugsOf({ ...STABLE, ksor: { ...STABLE.ksor, owner: "human:kim" } })).toEqual([]);
  });

  it("ksor-actor-form: an actor is human:<id>, process:<id> or <producer>/<version>; an empty id is not one", () => {
    for (const by of ["human:", "kim", "human:kim smith", "claude-code", ""]) {
      expect(slugsOf({ ...STABLE, verified: [{ by, at: "2026-08-21T00:00:00Z" }] }), by).toEqual([
        "ksor-actor-form",
      ]);
    }
  });

  it("ksor-instant-form: every timestamp is an ISO 8601 instant with an explicit offset", () => {
    expect(slugsOf({ ...STABLE, stale_after: "2027-08-21" })).toEqual(["ksor-instant-form"]);
    expect(slugsOf({ ...STABLE, stale_after: "2027-08-21T00:00:00" })).toEqual([
      "ksor-instant-form",
    ]);
    expect(slugsOf({ ...STABLE, stale_after: "2027-08-21T00:00:00+05:00" })).toEqual([]);
    expect(slugsOf({ ...STABLE, generated: { by: "x/1", at: 20260820 } })).toEqual([
      "ksor-instant-form",
    ]);
  });

  it("ksor-legacy-key refuses each pre-profile top-level key by name with the migration hint", () => {
    const r = parseConcept(P, { ...STABLE, visibility: "internal", sor_id: "x", owner: "team:a" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals.map((x) => x.slug)).toEqual([
      "ksor-legacy-key",
      "ksor-legacy-key",
      "ksor-legacy-key",
    ]);
    expect(r.refusals[0]?.fix).toMatch(/ksor migrate/);
    expect(r.refusals.map((x) => x.why).join()).toMatch(/visibility/);
  });

  // Every key on the list, one at a time — a list this rule reads from is
  // exactly where one goes missing without a test noticing.
  it("names every pre-profile key on the list, `superseded_by` included", () => {
    for (const key of LEGACY_KEYS) {
      const r = parseConcept(P, { ...STABLE, [key]: "x" });
      expect(r.ok, key).toBe(false);
      if (r.ok) continue;
      expect(
        r.refusals.filter((x) => x.slug === "ksor-legacy-key").map((x) => x.why.includes(key)),
        key,
      ).toContain(true);
    }
  });

  it("unknown keys are preserved (OKF §11), including under ksor:", () => {
    const r = parseConcept(P, {
      ...STABLE,
      "x-custom": { deep: 1 },
      ksor: { ...STABLE.ksor, "x-flag": true },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.concept.frontmatter["x-custom"]).toEqual({ deep: 1 });
  });

  it("refusals carry the document's path and are sorted for one print order", () => {
    const r = parseConcept(P, { ...STABLE, status: "nope", sources: [{ id: "a" }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals.every((x) => x.path === P)).toBe(true);
    expect(r.refusals.map((x) => x.slug)).toEqual([
      "ksor-source-unresourced",
      "ksor-status-unknown",
    ]);
  });
});
