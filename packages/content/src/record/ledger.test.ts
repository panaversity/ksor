import { describe, expect, it } from "vitest";

import {
  appendEntry,
  checkLedgerActors,
  checkLedgerAgainstTree,
  checkLedgerShrank,
  inForce,
  mintLedgerId,
  parseLedger,
  type Ledger,
  type LedgerEntry,
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

describe("checkLedgerShrank", () => {
  it("the current id set must be a superset of every baseline; the refusal names the ids and each source", () => {
    const r = checkLedgerShrank(
      ["a", "b"],
      [
        { source: "git history", ids: ["a", "b", "c"] },
        { source: "build.lock.json", ids: ["a"] },
      ],
    );
    expect(r.map((x) => x.slug)).toEqual(["ksor-ledger-shrank"]);
    expect(r[0]?.why).toMatch(/c/);
    expect(r[0]?.why).toMatch(/git history/);
    expect(
      checkLedgerShrank(["a", "b", "c"], [{ source: "git history", ids: ["a", "b", "c"] }]),
    ).toEqual([]);
  });
});

describe("writing the ledger", () => {
  const at = "2026-08-25T12:00:00.000Z";
  const denial: LedgerEntry = {
    kind: "denial",
    id: `${at}-abc123`,
    by: "human:ciso",
    at,
    reason: 'the "superseded" figure',
    stableId: "knowledge/policies/old",
    scope: "node",
    expected: "present",
  };

  it("mints `<at>-<6 random>`, and the suffix is what makes two acts in the same instant distinct", () => {
    expect(mintLedgerId(at, () => "ab12cd")).toBe(`${at}-ab12cd`);
    const a = mintLedgerId(at);
    const b = mintLedgerId(at);
    expect(a).not.toBe(b);
    expect(a.slice(at.length)).toMatch(/^-[0-9a-f]{6}$/);
  });

  it("round-trips every entry kind through the reader that judges it", () => {
    const revocation: LedgerEntry = {
      kind: "revocation",
      id: `${at}-r00000`,
      by: "human:ciso",
      at,
      reason: null,
      revokes: denial.id,
    };
    const amendment: LedgerEntry = {
      kind: "amendment",
      id: `${at}-a00000`,
      by: "human:ciso",
      at,
      reason: "deleted in the same change",
      amends: denial.id,
    };
    let text: string | null = null;
    for (const entry of [denial, revocation, amendment]) text = appendEntry(text, entry);
    const parsed = parseLedger(text, ".ksor/takedowns.yaml");
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (!parsed.ok) return;
    // Written and read back identically — a quoter that mangled the reason or
    // resolved the id as a timestamp would show up HERE, not at the operator's
    // next ingest.
    expect(parsed.ledger.entries).toEqual([
      denial,
      revocation,
      { ...amendment, kind: "amendment" },
    ]);
    expect(parsed.ledger.ids).toEqual([denial.id, revocation.id, amendment.id]);
  });

  it("appends rather than rewriting: every earlier byte survives, and a missing newline is added", () => {
    const first = appendEntry(null, denial);
    const second = appendEntry(first.replace(/\n$/, ""), { ...denial, id: `${at}-second` });
    expect(second.startsWith(first)).toBe(true);
    expect(parseLedger(second, "p").ok).toBe(true);
  });

  it("a subtree denial names the `#section` anchor, and the reader agrees", () => {
    const text = appendEntry(null, {
      ...denial,
      stableId: "knowledge/policies#section",
      scope: "subtree",
    });
    const parsed = parseLedger(text, "p");
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  });
});
