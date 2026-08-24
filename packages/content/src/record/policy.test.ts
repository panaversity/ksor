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
