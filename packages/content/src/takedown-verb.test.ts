/**
 * Record spec §5's decision table, one test per branch. These are the rules a
 * live walk is most expensive to cover and most likely to leave a hole in — an
 * unauthorised actor reaching a DSN, a declared database quietly writing only
 * the entry — so they are decided in a pure function and asserted here.
 */

import { describe, expect, it } from "vitest";

import { parsePolicy, type Policy } from "./record/policy.js";
import {
  authorizeActor,
  checkActorNamed,
  conceptPathOf,
  decideRowStep,
  expectedFor,
  planTakedown,
  subtreeDirOf,
  writesLedger,
  type TakedownArgs,
} from "./takedown-verb.js";

const ARGS: TakedownArgs = {
  stableId: undefined,
  scope: undefined,
  reason: undefined,
  revoke: undefined,
  removed: undefined,
  apply: false,
  list: false,
  ledger: false,
};
const args = (over: Partial<TakedownArgs>): TakedownArgs => ({ ...ARGS, ...over });

const POLICY: Policy = (() => {
  const parsed = parsePolicy(
    'version: "0.1"\napproval_authorities:\n  - actors: [human:cfo]\ntakedown_authorities:\n  actors: [human:ciso, process:legal-bot]\n',
    ".ksor/governance.yaml",
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.refusals));
  return parsed.policy;
})();

describe("which act was asked for", () => {
  it("refuses an invocation that names none", () => {
    const p = planTakedown(ARGS);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.refusal.slug).toBe("ksor-takedown-unspecified");
  });

  it("refuses two acts in one invocation rather than picking one", () => {
    const p = planTakedown(args({ stableId: "knowledge/x", reason: "r", apply: true }));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.refusal.slug).toBe("ksor-takedown-ambiguous");
  });

  it("reads a denial, a revocation, an amendment, apply, list and ledger", () => {
    const deny = planTakedown(args({ stableId: "knowledge/policies/x", reason: "superseded" }));
    expect(deny).toMatchObject({
      ok: true,
      mode: { kind: "deny", stableId: "knowledge/policies/x", scope: "node" },
      reason: "superseded",
    });
    expect(planTakedown(args({ revoke: "e1" }))).toMatchObject({
      mode: { kind: "revoke", target: "e1" },
    });
    expect(planTakedown(args({ removed: "e1" }))).toMatchObject({
      mode: { kind: "removed", target: "e1" },
    });
    expect(planTakedown(args({ apply: true }))).toMatchObject({ mode: { kind: "apply" } });
    expect(planTakedown(args({ list: true }))).toMatchObject({ mode: { kind: "list" } });
    expect(planTakedown(args({ ledger: true }))).toMatchObject({ mode: { kind: "ledger" } });
  });

  it("only the three writing acts need an actor", () => {
    expect(writesLedger({ kind: "deny", stableId: "knowledge/x", scope: "node" })).toBe(true);
    expect(writesLedger({ kind: "revoke", target: "e" })).toBe(true);
    expect(writesLedger({ kind: "removed", target: "e" })).toBe(true);
    expect(writesLedger({ kind: "apply" })).toBe(false);
    expect(writesLedger({ kind: "list" })).toBe(false);
    expect(writesLedger({ kind: "ledger" })).toBe(false);
  });
});

describe("a denial's arguments", () => {
  it("refuses a denial with no reason — the entry is the only place the withdrawal is explained", () => {
    const p = planTakedown(args({ stableId: "knowledge/x" }));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.refusal.slug).toBe("ksor-takedown-unreasoned");
    // whitespace is not a reason
    const q = planTakedown(args({ stableId: "knowledge/x", reason: "   " }));
    expect(q.ok).toBe(false);
  });

  it("refuses an id that is not a stable_id, and names the one it meant", () => {
    const p = planTakedown(args({ stableId: "policies/x", reason: "r" }));
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.refusal.slug).toBe("ksor-takedown-stable-id");
      expect(p.refusal.fix).toContain("knowledge/policies/x");
    }
  });

  it("refuses a scope that is not one of the two", () => {
    const p = planTakedown(args({ stableId: "knowledge/x", reason: "r", scope: "everything" }));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.refusal.slug).toBe("ksor-takedown-scope");
  });

  it("--scope subtree names the directory's section anchor, appended when the operator did not", () => {
    expect(
      planTakedown(args({ stableId: "knowledge/policies", reason: "r", scope: "subtree" })),
    ).toMatchObject({ mode: { stableId: "knowledge/policies#section", scope: "subtree" } });
    // already anchored, and a trailing slash
    expect(
      planTakedown(args({ stableId: "knowledge/policies/", reason: "r", scope: "subtree" })),
    ).toMatchObject({ mode: { stableId: "knowledge/policies#section" } });
    expect(
      planTakedown(args({ stableId: "knowledge/policies#section", reason: "r", scope: "subtree" })),
    ).toMatchObject({ mode: { stableId: "knowledge/policies#section" } });
  });

  it("refuses a section anchor at the DEFAULT scope rather than silently denying one node of it", () => {
    const p = planTakedown(args({ stableId: "knowledge/policies#section", reason: "r" }));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.refusal.fix).toContain("--scope subtree");
  });
});

describe("who may perform the act", () => {
  it("refuses an unnamed actor from the ARGUMENTS alone — no policy needed to know", () => {
    expect(checkActorNamed(undefined)?.slug).toBe("ksor-takedown-unattributed");
    expect(checkActorNamed("  ")?.slug).toBe("ksor-takedown-unattributed");
    expect(authorizeActor(undefined, POLICY)?.slug).toBe("ksor-takedown-unattributed");
  });

  it("refuses a shape that is not an actor — a team cannot perform an act", () => {
    expect(checkActorNamed("you@example.com")?.slug).toBe("ksor-actor-form");
    expect(checkActorNamed("team:legal")?.slug).toBe("ksor-actor-form");
    expect(authorizeActor("team:legal", POLICY)?.slug).toBe("ksor-actor-form");
  });

  it("a NAMED, well-formed actor passes the file-free half whatever the policy says", () => {
    expect(checkActorNamed("human:intern")).toBeNull();
  });

  it("refuses an actor the policy does not name, exactly as the checker refuses a hand-appended entry", () => {
    const r = authorizeActor("human:intern", POLICY);
    expect(r?.slug).toBe("ksor-takedown-unauthorised");
    expect(r?.why).toContain("human:ciso");
  });

  it("admits every actor takedown_authorities names, person or process", () => {
    expect(authorizeActor("human:ciso", POLICY)).toBeNull();
    expect(authorizeActor("process:legal-bot", POLICY)).toBeNull();
  });
});

describe("the entry, and whether a row follows it (record spec §5)", () => {
  const base = { dsnEnv: "KSOR_DSN", fileOnly: false };

  it("no database: the entry is the whole act", () => {
    const d = decideRowStep({ ...base, declaresDatabase: false, dsnPresent: false });
    expect(d).toMatchObject({ ok: true, step: "entry-only" });
  });

  it("a database and the DSN: the entry, then the row", () => {
    const d = decideRowStep({ ...base, declaresDatabase: true, dsnPresent: true });
    expect(d).toMatchObject({ ok: true, step: "entry-and-row" });
  });

  it("a database and NO DSN: refused, because the door would keep serving it", () => {
    const d = decideRowStep({ ...base, declaresDatabase: true, dsnPresent: false });
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.refusal.slug).toBe("ksor-takedown-dsn-missing");
      expect(d.refusal.fix, "both ways out are named").toContain("--file-only");
      expect(d.refusal.fix).toContain("KSOR_DSN");
    }
  });

  it("--file-only takes the entry-only branch deliberately, DSN or not", () => {
    for (const dsnPresent of [true, false]) {
      expect(
        decideRowStep({ ...base, fileOnly: true, declaresDatabase: true, dsnPresent }),
      ).toMatchObject({ ok: true, step: "entry-only" });
    }
  });
});

describe("what the verb SAW", () => {
  it("`expected` records presence, so a denial may precede the document it names", () => {
    expect(expectedFor(true)).toBe("present");
    expect(expectedFor(false)).toBe("removed");
  });

  it("resolves the path a denial's stable_id names, by scope", () => {
    expect(conceptPathOf("knowledge/policies/x")).toBe("knowledge/policies/x.md");
    expect(conceptPathOf("knowledge/policies#section")).toBeNull();
    expect(subtreeDirOf("knowledge/policies#section")).toBe("knowledge/policies");
    expect(subtreeDirOf("knowledge/policies/x")).toBeNull();
  });
});
