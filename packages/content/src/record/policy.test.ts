import { describe, expect, it } from "vitest";

import { parsePolicy, resolveApprovers, resolveOwner, type Policy } from "./policy.js";

const P = ".ksor/governance.yaml";

const LEVEL0 = `version: "0.1"
approval_authorities:
  - actors: [human:you]
takedown_authorities:
  actors: [human:you]
`;

const SCOPED = `version: "0.1"
audiences:
  finance:
    description: Finance staff
  audit:
    description: Auditors
ownership:
  - scope: { paths: ["finance/"] }
    owner: team:finance
    escalation: human:cfo
  - scope: { paths: ["finance/"], types: [Control] }
    owner: team:controls
approval_authorities:
  - actors: [human:ceo]
  - scope: { paths: ["finance/"] }
    actors: [human:cfo, human:fin-lead]
  - scope: { paths: ["finance/"] }
    actors: [human:cfo, human:audit-lead]
  - scope: { paths: ["finance/controls/"], types: [Control] }
    actors: [human:ciso]
takedown_authorities:
  actors: [human:ciso, human:cfo]
`;

function policyOf(text: string): Policy {
  const r = parsePolicy(text, P);
  if (!r.ok) throw new Error(JSON.stringify(r.refusals));
  return r.policy;
}

function slugsOf(text: string | null): string[] {
  const r = parsePolicy(text, P);
  return r.ok ? [] : r.refusals.map((x) => x.slug);
}

describe("parsePolicy — record spec §4", () => {
  it("a level-0 policy is the two required families; the registry is then only public", () => {
    const p = policyOf(LEVEL0);
    expect(p.audiences).toEqual([]);
    expect(p.takedownActors).toEqual(["human:you"]);
    expect(resolveApprovers(p, "x.md", "Document")).toEqual({ ok: true, actors: ["human:you"] });
  });

  it("ksor-policy-missing when the file is absent, naming the two required families", () => {
    const r = parsePolicy(null, P);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals[0]?.slug).toBe("ksor-policy-missing");
    expect(r.refusals[0]?.fix).toMatch(/approval_authorities/);
  });

  it("ksor-policy-invalid for unreadable YAML, a non-mapping, and each missing required family", () => {
    expect(slugsOf("version: [")).toEqual(["ksor-policy-invalid"]);
    expect(slugsOf("- a\n")).toEqual(["ksor-policy-invalid"]);
    expect(slugsOf('version: "0.1"\n')).toEqual(["ksor-policy-invalid", "ksor-policy-invalid"]);
  });

  it("ksor-policy-invalid: public may not be declared, every audience needs a description", () => {
    expect(slugsOf(`${LEVEL0}audiences:\n  public:\n    description: x\n`)).toEqual([
      "ksor-policy-invalid",
    ]);
    expect(slugsOf(`${LEVEL0}audiences:\n  internal: {}\n`)).toEqual(["ksor-policy-invalid"]);
  });

  it("ksor-policy-invalid: an approval rule needs non-empty actors; takedown_authorities too", () => {
    expect(
      slugsOf(
        'version: "0.1"\napproval_authorities:\n  - actors: []\ntakedown_authorities:\n  actors: [human:a]\n',
      ),
    ).toEqual(["ksor-policy-invalid"]);
    expect(
      slugsOf(
        'version: "0.1"\napproval_authorities:\n  - actors: [human:a]\ntakedown_authorities:\n  actors: []\n',
      ),
    ).toEqual(["ksor-policy-invalid"]);
  });

  it("actors in the policy may be teams, humans or processes — but never an empty id", () => {
    expect(slugsOf(LEVEL0.replace("human:you", "team:board"))).toEqual([]);
    expect(slugsOf(LEVEL0.replace("[human:you]", '["human:"]'))).toEqual(["ksor-policy-invalid"]);
  });

  it("reads the registry and the takedown set from a scoped policy", () => {
    const p = policyOf(SCOPED);
    expect(p.audiences).toEqual(["audit", "finance"]);
    expect(p.takedownActors).toEqual(["human:ciso", "human:cfo"]);
  });
});

describe("resolveApprovers — KSP 4.2.5 specificity", () => {
  const p = policyOf(SCOPED);

  it("an unscoped rule is the fallback; a path prefix beats it; a type tie-breaks at equal depth", () => {
    expect(resolveApprovers(p, "hr/leave.md", "Policy")).toEqual({
      ok: true,
      actors: ["human:ceo"],
    });
    expect(resolveApprovers(p, "finance/controls/sox.md", "Control")).toEqual({
      ok: true,
      actors: ["human:ciso"],
    });
    expect(resolveApprovers(p, "finance/controls/sox.md", "Policy")).toEqual({
      ok: true,
      actors: ["human:cfo"],
    });
  });

  it("equally specific rules INTERSECT; less-specific rules never widen", () => {
    expect(resolveApprovers(p, "finance/budget.md", "Policy")).toEqual({
      ok: true,
      actors: ["human:cfo"],
    });
  });

  it("a prefix matches whole segments, not characters: finance/ does not cover financeops/", () => {
    expect(resolveApprovers(p, "financeops/x.md", "Policy")).toEqual({
      ok: true,
      actors: ["human:ceo"],
    });
  });

  it("an empty intersection is a policy error (ksor-policy-invalid), not silence", () => {
    const q = policyOf(
      `${LEVEL0}`.replace(
        "actors: [human:you]\ntakedown",
        "actors: [human:you]\n  - actors: [human:other]\ntakedown",
      ),
    );
    const r = resolveApprovers(q, "x.md", "Document");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.slug).toBe("ksor-policy-invalid");
  });
});

describe("resolveOwner", () => {
  const p = policyOf(SCOPED);

  it("null where no ownership rule binds (R24 binds nothing)", () => {
    expect(resolveOwner(p, "hr/leave.md", "Policy")).toEqual({ ok: true, owner: null });
  });

  it("the most specific rule wins; a type constraint beats a bare path at equal depth", () => {
    expect(resolveOwner(p, "finance/budget.md", "Policy")).toEqual({
      ok: true,
      owner: "team:finance",
    });
    expect(resolveOwner(p, "finance/x.md", "Control")).toEqual({
      ok: true,
      owner: "team:controls",
    });
  });

  it("two equally specific rules with different owners make the policy invalid", () => {
    const q = policyOf(`${LEVEL0}ownership:
  - scope: { paths: ["finance/"] }
    owner: team:finance
  - scope: { paths: ["finance/"] }
    owner: team:other
`);
    const r = resolveOwner(q, "finance/budget.md", "Policy");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.slug).toBe("ksor-policy-invalid");
  });
});

/**
 * A one-letter typo in a scope key silently widened authority record-wide:
 * zod strips unknown keys, so `path:` for `paths:` left `scope: {}`, which
 * `pathDepth` scores as depth 0 and `mostSpecific` matches against EVERY
 * concept — a drafts-only rule became the record's fallback (reproduced end to
 * end, 2026-08-25). The policy is the root of authority (record spec §4), so
 * every object in it is closed, exactly as `instance.md`'s key set is.
 */
describe("parsePolicy — the policy's key set is closed", () => {
  const typo = (body: string): ReturnType<typeof parsePolicy> => parsePolicy(body, P);

  it("refuses a misspelled scope key instead of matching everything", () => {
    const r = typo(`version: "0.1"
approval_authorities:
  - scope: { paths: ["policies/"] }
    actors: [human:boss]
  - scope: { path: ["drafts/"] }
    actors: [human:intern]
takedown_authorities:
  actors: [human:boss]
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals.map((x) => x.slug)).toEqual(["ksor-policy-invalid"]);
    expect(r.refusals[0]?.why).toContain("path");
    expect(r.refusals[0]?.fix).toContain("paths");
  });

  it("refuses an unknown key on an approval rule", () => {
    expect(
      slugsOf(`version: "0.1"
approval_authorities:
  - actors: [human:boss]
    quorum: 2
takedown_authorities:
  actors: [human:boss]
`),
    ).toEqual(["ksor-policy-invalid"]);
  });

  it("refuses an unknown key on an ownership rule", () => {
    expect(
      slugsOf(`version: "0.1"
ownership:
  - owner: team:finance
    escalate: human:cfo
approval_authorities:
  - actors: [human:boss]
takedown_authorities:
  actors: [human:boss]
`),
    ).toEqual(["ksor-policy-invalid"]);
  });

  it("refuses an unknown key on takedown_authorities", () => {
    expect(
      slugsOf(`version: "0.1"
approval_authorities:
  - actors: [human:boss]
takedown_authorities:
  actor: [human:boss]
  actors: [human:boss]
`),
    ).toEqual(["ksor-policy-invalid"]);
  });

  it("refuses an unknown key on an audience entry and at the root", () => {
    expect(
      slugsOf(`version: "0.1"
audiences:
  internal:
    description: Staff
    descrption: Staff
approval_authorities:
  - actors: [human:boss]
takedown_authorities:
  actors: [human:boss]
`),
    ).toEqual(["ksor-policy-invalid"]);
    expect(
      slugsOf(`version: "0.1"
approval_authorities:
  - actors: [human:boss]
takedown_authoritys:
  actors: [human:boss]
takedown_authorities:
  actors: [human:boss]
`),
    ).toEqual(["ksor-policy-invalid"]);
  });

  it("names the key it refused and the keys it would have taken", () => {
    const r = typo(`version: "0.1"
approval_authorities:
  - actors: [human:boss]
takedown_authorities:
  actors: [human:boss]
ownershp:
  - owner: team:x
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals[0]?.why).toContain("ownershp");
    expect(r.refusals[0]?.fix).toContain("ownership");
  });
});

/**
 * A scope path is a bundle-relative DIRECTORY PREFIX (KSP-001 §4.2.5), and a
 * concept's id never carries its `.md` — `conceptIdOf` strips it. So
 * `paths: ["hr/handbook.md"]` matched NOTHING: the tightly scoped rule an
 * author wrote never applied, and resolution fell through to whatever broader
 * rule was left, with nothing red on any surface. The same silence covered
 * `paths: ["knowledge/hr/"]`, which is the prefix the takedown ledger's
 * `stable_id` uses and the one a hand writes next.
 */
describe("parsePolicy — a scope path that cannot match is refused, never normalised away", () => {
  const scopedApproval = (path: string): string => `version: "0.1"
approval_authorities:
  - actors: [human:boss]
  - scope: { paths: ["${path}"] }
    actors: [human:hr]
takedown_authorities:
  actors: [human:boss]
`;

  it("refuses a path carrying a document extension, and names the path it would have to be", () => {
    const r = parsePolicy(scopedApproval("hr/handbook.md"), P);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals.map((x) => x.slug)).toEqual(["ksor-policy-invalid"]);
    expect(r.refusals[0]?.why).toContain("hr/handbook.md");
    expect(r.refusals[0]?.fix).toContain("hr/handbook");
  });

  it("refuses `.mdx` the same way", () => {
    expect(slugsOf(scopedApproval("hr/handbook.mdx"))).toEqual(["ksor-policy-invalid"]);
  });

  it("refuses a path that repeats the `knowledge/` prefix — scope paths are bundle-relative", () => {
    const r = parsePolicy(scopedApproval("knowledge/hr/"), P);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals.map((x) => x.slug)).toEqual(["ksor-policy-invalid"]);
    expect(r.refusals[0]?.why).toContain("knowledge/hr/");
    expect(r.refusals[0]?.fix).toContain("hr/");
  });

  it("refuses it on an `ownership` rule too — one rule, both families", () => {
    expect(
      slugsOf(`${LEVEL0}ownership:
  - scope: { paths: ["hr/handbook.md"] }
    owner: team:hr
`),
    ).toEqual(["ksor-policy-invalid"]);
  });

  it("keeps every form that does match: a folder, a bare concept id, a leading slash", () => {
    const p = policyOf(`version: "0.1"
approval_authorities:
  - actors: [human:boss]
  - scope: { paths: ["hr/"] }
    actors: [human:hr]
  - scope: { paths: ["/legal"] }
    actors: [human:counsel]
  - scope: { paths: ["ops/runbook"] }
    actors: [human:sre]
takedown_authorities:
  actors: [human:boss]
`);
    expect(resolveApprovers(p, "hr/handbook", "Document")).toEqual({
      ok: true,
      actors: ["human:hr"],
    });
    expect(resolveApprovers(p, "legal/terms", "Document")).toEqual({
      ok: true,
      actors: ["human:counsel"],
    });
    expect(resolveApprovers(p, "ops/runbook", "Document")).toEqual({
      ok: true,
      actors: ["human:sre"],
    });
  });

  /**
   * `/` alone is the whole record: it normalises to the empty prefix, which
   * matches every concept at depth 0 — exactly what omitting `paths` means, so
   * a deeper rule still wins. Pinned because it is the one path form that
   * matches everything, and a reader meeting it needs to know it is deliberate.
   */
  it("`/` is the whole record — the depth-0 tier, which any deeper rule beats", () => {
    const p = policyOf(`version: "0.1"
approval_authorities:
  - scope: { paths: ["/"] }
    actors: [human:boss]
  - scope: { paths: ["hr/"] }
    actors: [human:hr]
takedown_authorities:
  actors: [human:boss]
`);
    expect(resolveApprovers(p, "legal/terms", "Document")).toEqual({
      ok: true,
      actors: ["human:boss"],
    });
    expect(resolveApprovers(p, "hr/handbook", "Document")).toEqual({
      ok: true,
      actors: ["human:hr"],
    });
  });
});

/**
 * The same failure as the misspelled key, reached through the VALUE. A scope
 * whose `paths` or `types` is the EMPTY LIST binds the rule to nothing:
 * `pathDepth` loops zero times and returns null, so `mostSpecific` skips the
 * rule entirely, and `types: []` fails every `includes` for the same effect.
 * An empty list reads as "everywhere" and means "nowhere".
 *
 * On `approval_authorities` that fails safe — no rule matches, so the concept
 * is refused. On `ownership` it does not: `resolveOwner` returns `null`, which
 * is the same answer as "no ownership rule binds this concept", and the
 * checker then falls back to the document's SELF-DECLARED `owner:` for
 * deprecation authority. The rule the author wrote to hold that authority
 * simply is not in force, and nothing says so (2026-08-25 review).
 *
 * `scope: {}` is refused with them: it is the state the one-letter typo
 * produced — a scope that constrains nothing scores depth 0 and becomes the
 * record-wide fallback — and it is the one route to it that a closed key set
 * cannot catch.
 */
describe("parsePolicy — a scope that constrains nothing is refused, never silently dropped", () => {
  it("refuses an empty `paths` on an approval rule, naming the list and the fallback form", () => {
    const r = parsePolicy(
      `version: "0.1"
approval_authorities:
  - actors: [human:boss]
  - scope: { paths: [] }
    actors: [human:hr]
takedown_authorities:
  actors: [human:boss]
`,
      P,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals.map((x) => x.slug)).toEqual(["ksor-policy-invalid"]);
    expect(r.refusals[0]?.why).toContain("paths");
    expect(r.refusals[0]?.fix).toContain("scope");
  });

  it("refuses an empty `types` the same way", () => {
    expect(
      slugsOf(`version: "0.1"
approval_authorities:
  - actors: [human:boss]
  - scope: { paths: ["hr/"], types: [] }
    actors: [human:hr]
takedown_authorities:
  actors: [human:boss]
`),
    ).toEqual(["ksor-policy-invalid"]);
  });

  it("refuses an ownership rule that cannot match, where the fallback is the document's own claim", () => {
    expect(
      slugsOf(`${LEVEL0}ownership:
  - scope: { paths: [] }
    owner: team:hr
`),
    ).toEqual(["ksor-policy-invalid"]);
    expect(
      slugsOf(`${LEVEL0}ownership:
  - scope: { types: [] }
    owner: team:hr
`),
    ).toEqual(["ksor-policy-invalid"]);
  });

  it("refuses `scope: {}` — the record-wide fallback is written by omitting `scope`", () => {
    expect(
      slugsOf(`version: "0.1"
approval_authorities:
  - scope: {}
    actors: [human:boss]
takedown_authorities:
  actors: [human:boss]
`),
    ).toEqual(["ksor-policy-invalid"]);
  });

  it("takes a scope that names one of the two, which is the ordinary form", () => {
    const p = policyOf(`version: "0.1"
approval_authorities:
  - actors: [human:boss]
  - scope: { paths: ["hr/"] }
    actors: [human:hr]
  - scope: { types: [Control] }
    actors: [human:ciso]
takedown_authorities:
  actors: [human:boss]
`);
    expect(resolveApprovers(p, "hr/handbook", "Document")).toEqual({
      ok: true,
      actors: ["human:hr"],
    });
    expect(resolveApprovers(p, "ops/sox", "Control")).toEqual({
      ok: true,
      actors: ["human:ciso"],
    });
  });
});
