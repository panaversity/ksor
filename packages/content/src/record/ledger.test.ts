import { describe, expect, it } from "vitest";

import {
  checkLedgerActors,
  checkLedgerAgainstTree,
  checkLedgerAppendOnly,
  denies,
  entryDigest,
  inForce,
  parseLedger,
  type Denial,
  type Ledger,
} from "./ledger.js";

const P = ".ksor/takedowns.yaml";

const DENIAL = `- id: 2026-08-25T10:00:00Z-a1b2c3
  stable_id: knowledge/policies/old-threshold
  scope: node
  expected: present
  by: human:ciso
  at: 2026-08-25T10:00:00Z
  reason: superseded figure
`;
const REVOCATION = `- id: 2026-08-26T10:00:00Z-d4e5f6
  revokes: 2026-08-25T10:00:00Z-a1b2c3
  by: human:cfo
  at: 2026-08-26T10:00:00Z
  reason: figure restored
`;
const AMENDMENT = `- id: 2026-08-27T10:00:00Z-778899
  amends: 2026-08-25T10:00:00Z-a1b2c3
  expected: removed
  by: human:ciso
  at: 2026-08-27T10:00:00Z
  reason: file deleted
`;
const SUBTREE = `- id: 2026-08-25T11:00:00Z-aaaaaa
  stable_id: knowledge/policies#section
  scope: subtree
  expected: present
  by: human:ciso
  at: 2026-08-25T11:00:00Z
  reason: whole folder
`;

function ledgerOf(text: string | null): Ledger {
  const r = parseLedger(text, P);
  if (!r.ok) throw new Error(JSON.stringify(r.refusals));
  return r.ledger;
}
function slugsOf(text: string | null): string[] {
  const r = parseLedger(text, P);
  return r.ok ? [] : r.refusals.map((x) => x.slug);
}

describe("parseLedger — record spec §5", () => {
  it("no file is an empty ledger, not a refusal", () => {
    expect(ledgerOf(null).entries).toEqual([]);
  });

  it("reads the three entry kinds", () => {
    const l = ledgerOf(DENIAL + REVOCATION + AMENDMENT);
    expect(l.entries.map((e) => e.kind)).toEqual(["denial", "revocation", "amendment"]);
    expect(l.ids).toEqual([
      "2026-08-25T10:00:00Z-a1b2c3",
      "2026-08-26T10:00:00Z-d4e5f6",
      "2026-08-27T10:00:00Z-778899",
    ]);
  });

  it("ksor-ledger-invalid: the file must be a list; a duplicate id; an entry of no known kind", () => {
    expect(slugsOf("a: 1\n")).toEqual(["ksor-ledger-invalid"]);
    expect(slugsOf(DENIAL + DENIAL)).toEqual(["ksor-ledger-invalid"]);
    expect(slugsOf("- id: x\n  by: human:a\n  at: 2026-08-25T10:00:00Z\n")).toEqual([
      "ksor-ledger-invalid",
    ]);
  });

  it("ksor-ledger-invalid: a revocation of a non-denial, an amendment of a revocation, a revocation of an unknown id", () => {
    expect(slugsOf(REVOCATION)).toEqual(["ksor-ledger-invalid"]);
    expect(
      slugsOf(
        DENIAL +
          REVOCATION +
          AMENDMENT.replace(
            "amends: 2026-08-25T10:00:00Z-a1b2c3",
            "amends: 2026-08-26T10:00:00Z-d4e5f6",
          ),
      ),
    ).toEqual(["ksor-ledger-invalid"]);
    expect(
      slugsOf(DENIAL + REVOCATION.replace("revokes: 2026-08-25T10:00:00Z-a1b2c3", "revokes: nope")),
    ).toEqual(["ksor-ledger-invalid"]);
  });

  it("ksor-ledger-invalid: the actor form, a bare-date `at`, an unknown scope, an unknown expected, an empty actor id", () => {
    expect(slugsOf(DENIAL.replace("human:ciso", "team:sec"))).toEqual(["ksor-ledger-invalid"]);
    expect(slugsOf(DENIAL.replace("at: 2026-08-25T10:00:00Z", "at: 2026-08-25"))).toEqual([
      "ksor-ledger-invalid",
    ]);
    expect(slugsOf(DENIAL.replace("scope: node", "scope: folder"))).toEqual([
      "ksor-ledger-invalid",
    ]);
    expect(slugsOf(DENIAL.replace("expected: present", "expected: gone"))).toEqual([
      "ksor-ledger-invalid",
    ]);
    expect(slugsOf(DENIAL.replace("human:ciso", '"human:"'))).toEqual(["ksor-ledger-invalid"]);
  });

  it("ksor-ledger-invalid: a subtree entry must name a `#section` anchor and a node entry must not", () => {
    expect(slugsOf(SUBTREE.replace("knowledge/policies#section", "knowledge/policies/x"))).toEqual([
      "ksor-ledger-invalid",
    ]);
    expect(
      slugsOf(DENIAL.replace("knowledge/policies/old-threshold", "knowledge/policies#section")),
    ).toEqual(["ksor-ledger-invalid"]);
    expect(
      slugsOf(DENIAL.replace("knowledge/policies/old-threshold", "policies/old-threshold")),
    ).toEqual(["ksor-ledger-invalid"]);
  });

  it("the file order is the ledger order; a revocation before the denial it names is refused", () => {
    expect(slugsOf(REVOCATION + DENIAL)).toEqual(["ksor-ledger-invalid"]);
  });
});

describe("inForce", () => {
  it("a denial is in force until revoked; an amendment marks it removed; a re-denial denies again", () => {
    const again = DENIAL.replace("a1b2c3", "ffffff").replace(
      "2026-08-25T10:00:00Z\n  reason",
      "2026-08-28T10:00:00Z\n  reason",
    );
    expect(inForce(ledgerOf(DENIAL)).map((d) => [d.stableId, d.expected])).toEqual([
      ["knowledge/policies/old-threshold", "present"],
    ]);
    expect(inForce(ledgerOf(DENIAL + REVOCATION))).toEqual([]);
    expect(inForce(ledgerOf(DENIAL + AMENDMENT)).map((d) => d.expected)).toEqual(["removed"]);
    expect(inForce(ledgerOf(DENIAL + REVOCATION + again)).map((d) => d.id)).toEqual([
      "2026-08-25T10:00:00Z-ffffff",
    ]);
  });
});

describe("checkLedgerActors", () => {
  it("every entry's `by` — denial, revocation, amendment — must be a takedown authority", () => {
    const l = ledgerOf(DENIAL + REVOCATION + AMENDMENT);
    const r = checkLedgerActors(l, ["human:ciso"]);
    expect(r.map((x) => x.slug)).toEqual(["ksor-takedown-unauthorised"]);
    expect(r[0]?.why).toMatch(/human:cfo/);
    expect(r[0]?.why).toMatch(/2026-08-26T10:00:00Z-d4e5f6/);
    expect(checkLedgerActors(l, ["human:ciso", "human:cfo"])).toEqual([]);
  });
});

describe("checkLedgerAgainstTree", () => {
  const tree = {
    conceptIds: new Set(["policies/old-threshold", "hr/leave"]),
    dirs: new Set(["policies", "hr"]),
  };

  it("an in-force present node entry whose concept is gone is ksor-takedown-dangling", () => {
    const r = checkLedgerAgainstTree(ledgerOf(DENIAL), {
      ...tree,
      conceptIds: new Set(["hr/leave"]),
    });
    expect(r.map((x) => x.slug)).toEqual(["ksor-takedown-dangling"]);
    expect(r[0]?.fix).toMatch(/--removed/);
    expect(checkLedgerAgainstTree(ledgerOf(DENIAL), tree)).toEqual([]);
  });

  it("a subtree entry whose directory is gone is dangling; a revoked entry is never checked", () => {
    expect(
      checkLedgerAgainstTree(ledgerOf(SUBTREE), { ...tree, dirs: new Set(["hr"]) }).map(
        (x) => x.slug,
      ),
    ).toEqual(["ksor-takedown-dangling"]);
    expect(
      checkLedgerAgainstTree(ledgerOf(DENIAL + REVOCATION), { ...tree, conceptIds: new Set() }),
    ).toEqual([]);
  });

  it("a removed entry whose path reappears is ksor-takedown-readded", () => {
    expect(checkLedgerAgainstTree(ledgerOf(DENIAL + AMENDMENT), tree).map((x) => x.slug)).toEqual([
      "ksor-takedown-readded",
    ]);
    expect(
      checkLedgerAgainstTree(ledgerOf(DENIAL + AMENDMENT), { ...tree, conceptIds: new Set() }),
    ).toEqual([]);
  });
});

describe("checkLedgerAppendOnly — the ledger is append-only in ids AND in text", () => {
  it("the current id set must be a superset of every baseline; the refusal names the ids and each source", () => {
    const r = checkLedgerAppendOnly(ledgerOf(DENIAL), [
      { source: "git history", entries: [{ id: "c", digest: null }] },
      { source: "build.lock.json", entries: [] },
    ]);
    expect(r.map((x) => x.slug)).toEqual(["ksor-ledger-shrank"]);
    expect(r[0]?.why).toMatch(/c/);
    expect(r[0]?.why).toMatch(/git history/);
  });

  it("says nothing when every baseline id is present with the text it was recorded with", () => {
    const ledger = ledgerOf(DENIAL + REVOCATION);
    const entries = ledger.entries.map((e) => ({ id: e.id, digest: entryDigest(e), entry: e }));
    expect(checkLedgerAppendOnly(ledger, [{ source: "git history", entries }])).toEqual([]);
  });

  /**
   * The blocker this replaces: `checkLedgerShrank` compared ID SETS, so editing
   * a committed entry in place — same id, same actor, a different `stable_id` —
   * republished the denied document and denied an innocent one, with nothing
   * red on any surface. Hand-editing was strictly easier than hand-appending.
   */
  it("refuses an entry whose text moved under an id history already recorded", () => {
    const before = ledgerOf(DENIAL);
    const entries = before.entries.map((e) => ({
      id: e.id,
      digest: entryDigest(e),
      entry: e,
      where: "abc1234",
    }));
    const retargeted = ledgerOf(DENIAL.replace("policies/old-threshold", "policies/open"));
    const r = checkLedgerAppendOnly(retargeted, [{ source: "git history", entries }]);
    expect(r.map((x) => x.slug)).toEqual(["ksor-ledger-amended"]);
    expect(r[0]?.why).toContain("2026-08-25T10:00:00Z-a1b2c3");
    expect(r[0]?.why).toContain("stable_id");
    expect(r[0]?.why).toContain("abc1234");
  });

  it("refuses a retargeted entry against a digest-only baseline too (the committed lock)", () => {
    const digest = entryDigest(ledgerOf(DENIAL).entries[0]!);
    const retargeted = ledgerOf(DENIAL.replace("expected: present", "expected: removed"));
    const r = checkLedgerAppendOnly(retargeted, [
      { source: "build.lock.json", entries: [{ id: "2026-08-25T10:00:00Z-a1b2c3", digest }] },
    ]);
    expect(r.map((x) => x.slug)).toEqual(["ksor-ledger-amended"]);
    expect(r[0]?.why).toContain("build.lock.json");
  });

  it("a baseline that could not be parsed carries no digest and judges ids only", () => {
    const retargeted = ledgerOf(DENIAL.replace("policies/old-threshold", "policies/open"));
    expect(
      checkLedgerAppendOnly(retargeted, [
        { source: "git history", entries: [{ id: "2026-08-25T10:00:00Z-a1b2c3", digest: null }] },
      ]),
    ).toEqual([]);
  });
});

describe("entryDigest", () => {
  it("covers every governing field, so no edit to an entry is invisible", () => {
    const base = ledgerOf(DENIAL).entries[0] as Denial;
    const digest = entryDigest(base);
    for (const [from, to] of [
      ["knowledge/policies/old-threshold", "knowledge/policies/open"],
      ["node", "subtree"],
      ["present", "removed"],
      ["human:ciso", "human:cfo"],
      ["2026-08-25T10:00:00Z", "2026-08-26T10:00:00Z"],
      ["superseded figure", "a different reason"],
    ] as const) {
      const moved = { ...base, ...fieldFor(base, from, to) };
      expect(entryDigest(moved), `${from} → ${to}`).not.toBe(digest);
    }
  });
});

/** Rebuilds one denial field from a literal, so the table above reads as the entry does. */
function fieldFor(base: Denial, from: string, to: string): Partial<Denial> {
  if (base.stableId === from) return { stableId: to };
  if (base.scope === from) return { scope: to as Denial["scope"] };
  if (base.expected === from) return { expected: to as Denial["expected"] };
  if (base.by === from) return { by: to };
  if (base.at === from) return { at: to };
  return { reason: to };
}

describe("denies — the in-force denials as a predicate over concept ids", () => {
  const denial = (stableId: string, scope: "node" | "subtree"): Denial => ({
    kind: "denial",
    id: "x",
    by: "human:ciso",
    at: "2026-08-25T10:00:00Z",
    reason: null,
    stableId,
    scope,
    expected: "present",
  });
  it("node matches one id exactly; subtree matches the directory's descendants and never a prefix-sibling", () => {
    expect(denies([denial("knowledge/a/b", "node")], "a/b")).toBe(true);
    expect(denies([denial("knowledge/a/b", "node")], "a/bc")).toBe(false);
    expect(denies([denial("knowledge/a#section", "subtree")], "a/b/c")).toBe(true);
    expect(denies([denial("knowledge/a#section", "subtree")], "ab/c")).toBe(false);
    expect(denies([denial("knowledge/#section", "subtree")], "anything")).toBe(true);
    expect(denies([], "a")).toBe(false);
  });
});
