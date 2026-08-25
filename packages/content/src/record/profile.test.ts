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

  // The `ksor:` half of this used to pass and should not have: the block is
  // ksor's own namespace, and a key it does not read there is a governance
  // guarantee that silently stops existing (see the closed-block describe).
  it("unknown keys are preserved (OKF §11) at the concept's own top level", () => {
    const r = parseConcept(P, { ...STABLE, "x-custom": { deep: 1 } });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.concept.frontmatter["x-custom"]).toEqual({ deep: 1 });
  });

  it.each([
    ["title", "Purchase\napproval"],
    ["description", "Who may approve a purchase.\n"],
  ])("ksor-one-line-form: a line break in %s is refused, not rendered", (key, value) => {
    const r = parseConcept(P, { ...STABLE, [key]: value });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    if (r.ok) return;
    const hit = r.refusals.find((x) => x.slug === "ksor-one-line-form");
    expect(`${hit?.why}`).toContain(`\`${key}\``);
    expect(`${hit?.fix}`).toContain(">-");
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

/**
 * The optional governance keys fail OPEN when misspelled — a typo in a
 * REQUIRED key surfaces as a missing-key refusal, but `ksor.effective-from`
 * (hyphen) published an embargoed policy four weeks early and a mistyped
 * `stale_after` never expires (reproduced 2026-08-25). The `ksor:` namespace is
 * ksor's own, so OKF §11's preserve-unknown-keys rule does not cover it.
 */
describe("parseConcept — the ksor block is closed, the concept is not", () => {
  const withKsor = (extra: Record<string, unknown>): Record<string, unknown> => ({
    ...STABLE,
    ksor: { ...STABLE.ksor, ...extra },
  });

  it("refuses an unknown key in the ksor block, naming it and the allowed set", () => {
    const r = parseConcept(P, withKsor({ "effective-from": "2026-09-01T00:00:00Z" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals.map((x) => x.slug)).toContain("ksor-ksor-key-unknown");
    const refusal = r.refusals.find((x) => x.slug === "ksor-ksor-key-unknown");
    expect(refusal?.why).toContain("effective-from");
    expect(refusal?.fix).toContain("effective_from");
  });

  it("refuses a misspelled superseded_by and a spurious aproval alike", () => {
    expect(slugsOf(withKsor({ superceded_by: "policies/open" }))).toContain(
      "ksor-ksor-key-unknown",
    );
    expect(slugsOf(withKsor({ aproval: { by: "human:nobody" } }))).toContain(
      "ksor-ksor-key-unknown",
    );
  });

  it("keeps the concept's own top level open — OKF §11 preserves unknown keys", () => {
    expect(slugsOf({ ...STABLE, x_department: "finance" })).toEqual([]);
  });

  it("refuses a top-level key one edit from a profile key, which fails open otherwise", () => {
    const r = parseConcept(P, { ...STABLE, stale_afer: "2020-01-01T00:00:00Z" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const refusal = r.refusals.find((x) => x.slug === "ksor-key-near-miss");
    expect(refusal?.why).toContain("stale_afer");
    expect(refusal?.fix).toContain("stale_after");
  });
});

/**
 * The site appends `trust_tier:` and the R14 stamps under the concept's own
 * frontmatter to build its markdown twin, and neither name was reserved. A
 * concept declaring `trust_tier: human-reviewed` and
 * `build_id: sha256:FORGED-BY-THE-AUTHOR` therefore published a twin carrying
 * each key TWICE — one of them the author's — which the record's own reader
 * (uniqueKeys: true) refuses as `ksor-frontmatter-invalid`. A lenient consumer
 * takes one of the two, so the derived tier is not authoritative in the bytes
 * and the build stamp is forgeable by whoever writes a document.
 */
describe("parseConcept — the keys the build derives are not the author's to claim", () => {
  for (const key of ["trust_tier", "build_id", "source_commit", "ksor_version", "dirty"]) {
    it(`refuses \`${key}\` at a concept's top level`, () => {
      const r = parseConcept(P, { ...STABLE, [key]: "anything" });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      const refusal = r.refusals.find((x) => x.slug === "ksor-derived-key");
      expect(refusal?.why, JSON.stringify(r.refusals)).toContain(key);
    });
  }
});

/**
 * The floor loop refuses a floor key that is ABSENT. `alreadyRefused` claimed
 * every floor key had already been refused in the author's own words — for any
 * value, present or not — so a floor key that was PRESENT but wrong-typed
 * pushed nothing, had its schema issue swallowed as the duplicate of a refusal
 * nobody made, and returned `ok: false` with an EMPTY refusal list. `check.ts`
 * spreads that empty list, adds the id to `unreadable` and drops the document:
 * no page, no MCP node, no lock entry, no refusal printed, exit 0. A governed
 * document leaves the record in silence, and the way in is a title that lost
 * its quotes (found in review, 2026-08-25).
 */
describe("parseConcept — a floor key that is present but empty or not text", () => {
  const show = (v: unknown): string => (typeof v === "number" ? String(v) : JSON.stringify(v));

  it.each([
    ["title", 42],
    ["description", ""],
    ["type", ""],
    ["status", 5],
    ["title", " "],
    ["title", null],
    ["description", ["one", "two"]],
    ["type", true],
  ])("refuses `%s: %s`, names the key, and never drops the document in silence", (key, value) => {
    const r = parseConcept(P, { ...STABLE, [key]: value });
    expect(r.ok, `accepted ${key}: ${show(value)}`).toBe(false);
    if (r.ok) return;
    expect(
      r.refusals.length,
      `${key}: ${show(value)} refused with NOTHING to print`,
    ).toBeGreaterThan(0);
    expect(
      r.refusals.some((x) => x.why.includes(`\`${key}\``)),
      `no refusal names \`${key}\`: ${JSON.stringify(r.refusals)}`,
    ).toBe(true);
  });

  /**
   * The invariant rather than one of its holes: `ok: false` with nothing to
   * print is a bug in the parser, not a state a document can be in — every
   * caller turns it into a dropped document and a clean exit.
   */
  it("never fails without saying why, for any single-key mutation of a valid concept", () => {
    const hostile = [0, -1, "", " ", null, true, [], {}, 42, Number.NaN, Number.POSITIVE_INFINITY];
    const silent: string[] = [];
    for (const value of hostile) {
      for (const key of [...Object.keys(STABLE), "x_extension"]) {
        const r = parseConcept(P, { ...STABLE, [key]: value });
        if (!r.ok && r.refusals.length === 0) silent.push(`${key}: ${show(value)}`);
      }
      for (const key of Object.keys(STABLE.ksor)) {
        const r = parseConcept(P, { ...STABLE, ksor: { ...STABLE.ksor, [key]: value } });
        if (!r.ok && r.refusals.length === 0) silent.push(`ksor.${key}: ${show(value)}`);
      }
    }
    expect(silent).toEqual([]);
  });
});

/**
 * YAML's core schema resolves `.inf`, `-.inf`, `.nan` — and an exponent that
 * overflows, `1e400` — to real JavaScript numbers, so `order:` can carry a
 * value that is not a position. zod 4 refuses a non-finite number, which is
 * why nothing has ever sorted wrong; what it SAYS is "Invalid input: expected
 * number, received number", which tells an author nothing at all about the
 * file they have to fix (product principle 4).
 */
describe("parseConcept — `order` is a position, and the refusal has to say so", () => {
  it.each([
    ["`.inf`", Number.POSITIVE_INFINITY],
    ["`-.inf`", Number.NEGATIVE_INFINITY],
    ["`.nan`", Number.NaN],
  ])("refuses a non-finite order written as %s, in the author's words", (_yaml, value) => {
    const r = parseConcept(P, { ...STABLE, order: value });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const refusal = r.refusals.find((x) => x.why.includes("`order`"));
    expect(refusal, JSON.stringify(r.refusals)).toBeDefined();
    expect(`${refusal?.why}`).not.toContain("expected number, received number");
    expect(`${refusal?.why}`.toLowerCase()).toContain("finite");
    expect(`${refusal?.fix}`).toContain("order");
  });

  it("keeps ordinary orders, negative and fractional ones included", () => {
    for (const order of [0, -3, 2.5, Number.MAX_SAFE_INTEGER]) {
      const r = parseConcept(P, { ...STABLE, order });
      expect(r.ok, `${order}: ${JSON.stringify(r)}`).toBe(true);
    }
  });
});

/**
 * The near-miss net (§2.7) catches a governance key with a letter missing. It
 * cannot catch the same failure spelled CORRECTLY one level from where the
 * profile reads it, because there is no near miss to see — and §11 then
 * preserves the key verbatim, so it is published, unread and enforcing
 * nothing. Reproduced 2026-08-25 on a scaffolded record: `effective_from:
 * 2099-01-01T00:00:00Z` at a concept's top level built clean, exited 0, and
 * wrote `admitted: ["public"]` for a document embargoed for seventy years;
 * the same instant under `ksor:` wrote `admitted: []`.
 *
 * The mirror is worse than silent. `ksor.stale_after` WAS refused — as a key
 * of a closed block nothing reads — and the remedy printed "remove
 * `stale_after:`". Following it flipped a document already stale since 2020
 * from `admitted: []` to `admitted: ["public"]`: the fix line published what
 * the author had withdrawn. A remedy may never spend a governance value to
 * clear a refusal.
 */
describe("parseConcept — a governance key one level from where it is read", () => {
  const withKsor = (extra: Record<string, unknown>): Record<string, unknown> => ({
    ...STABLE,
    ksor: { ...STABLE.ksor, ...extra },
  });

  it.each([
    ["effective_from", "2099-01-01T00:00:00Z"],
    ["approval", { by: "human:cfo", at: "2026-08-22T10:00:00Z" }],
    ["deprecated", { by: "human:cfo", at: "2026-08-22T10:00:00Z" }],
    ["audience", ["public"]],
  ])("refuses top-level `%s`, a ksor-block key, by name", (key, value) => {
    const r = parseConcept(P, { ...STABLE, [key]: value });
    expect(r.ok, `top-level ${key} was accepted`).toBe(false);
    if (r.ok) return;
    const refusal = r.refusals.find((x) => x.slug === "ksor-key-misplaced");
    expect(refusal, JSON.stringify(r.refusals)).toBeDefined();
    expect(`${refusal?.why}`).toContain(`\`${key}\``);
    expect(`${refusal?.why}`).toContain(`ksor.${key}`);
    expect(`${refusal?.fix}`).toContain("ksor:");
  });

  it.each([
    ["stale_after", "2020-01-01T00:00:00Z"],
    ["verified", [{ by: "human:kim", at: "2026-08-21T14:00:00Z" }]],
    ["status", "deprecated"],
    ["sources", [{ resource: "https://x/y.pdf" }]],
  ])("refuses `ksor.%s`, a top-level profile key, by name", (key, value) => {
    const r = parseConcept(P, withKsor({ [key]: value }));
    expect(r.ok, `ksor.${key} was accepted`).toBe(false);
    if (r.ok) return;
    const refusal = r.refusals.find((x) => x.slug === "ksor-key-misplaced");
    expect(refusal, JSON.stringify(r.refusals)).toBeDefined();
    expect(`${refusal?.why}`).toContain(`ksor.${key}`);
    expect(`${refusal?.fix}`).toContain("top level");
  });

  it("catches a ksor-block key that is BOTH misspelled and misplaced", () => {
    const r = parseConcept(P, { ...STABLE, efective_from: "2099-01-01T00:00:00Z" });
    expect(r.ok, "top-level efective_from was accepted").toBe(false);
    if (r.ok) return;
    const refusal = r.refusals.find((x) => x.slug === "ksor-key-misplaced");
    expect(refusal, JSON.stringify(r.refusals)).toBeDefined();
    expect(`${refusal?.fix}`).toContain("effective_from");
  });

  /**
   * The rule the mirror case bought: every remedy printed for a MISPLACED
   * governance key has to relocate the value. "Remove it" clears the refusal
   * and publishes what the key was withholding — the one outcome the refusal
   * existed to prevent.
   */
  it("never prints a remedy that spends the governance value to clear the refusal", () => {
    const cases: Record<string, unknown>[] = [
      { ...STABLE, effective_from: "2099-01-01T00:00:00Z" },
      { ...STABLE, deprecated: { by: "human:cfo", at: "2026-08-22T10:00:00Z" } },
      withKsor({ stale_after: "2020-01-01T00:00:00Z" }),
      withKsor({ verified: [{ by: "human:kim", at: "2026-08-21T14:00:00Z" }] }),
      withKsor({ retention_years: 7 }),
    ];
    for (const fm of cases) {
      const r = parseConcept(P, fm);
      expect(r.ok, JSON.stringify(fm)).toBe(false);
      if (r.ok) continue;
      for (const refusal of r.refusals) {
        if (refusal.slug === "ksor-derived-key") continue; // the BUILD owns those, not the author
        expect(
          refusal.fix,
          `${refusal.slug} tells the author to delete a value they wrote: ${refusal.fix}`,
        ).not.toMatch(/\bremove\b|\bdelete\b|\bdrop\b/i);
      }
    }
  });

  it("still keeps a genuine extension key no governance key is one edit from", () => {
    expect(slugsOf({ ...STABLE, x_department: "finance" })).toEqual([]);
    expect(slugsOf({ ...STABLE, retention_years: 7 })).toEqual([]);
  });
});
