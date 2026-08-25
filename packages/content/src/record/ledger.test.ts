import { describe, expect, it } from "vitest";

import {
  bytesToAppend,
  checkLedgerActors,
  checkLedgerAgainstTree,
  checkLedgerAppendOnly,
  denies,
  entryDigest,
  inForce,
  ledgerDigests,
  mintLedgerId,
  parseLedger,
  type Denial,
  type Ledger,
  type LedgerBaseline,
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

  /**
   * `null` and `""` used to be the same answer, and they are opposite claims.
   * No file is how "this record has withdrawn nothing" is written. A file that
   * exists and holds nothing is what an interrupted write leaves — the verb
   * writes the header and the first entry in one call, so a real ledger is
   * never empty — and reading it as "no denials" republishes everything the
   * lost entries withdrew, then makes it permanent at the next write.
   */
  it("ksor-ledger-empty: a file that EXISTS and holds nothing is a refusal, not `no denials`", () => {
    expect(slugsOf("")).toEqual(["ksor-ledger-empty"]);
    expect(slugsOf("   \n\n\t")).toEqual(["ksor-ledger-empty"]);
    const refused = parseLedger("", P);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(
      refused.refusals[0]?.fix,
      "the remedy has to name where the entries still are",
    ).toContain("version control");
  });

  it("...and the header alone still reads as a ledger with no entries yet", () => {
    // Comments are not emptiness: something wrote this file deliberately.
    expect(ledgerOf("# written by ksor takedown\n").entries).toEqual([]);
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

/**
 * An entry is one governance ACT. `parseEntry` dispatched on which key was
 * PRESENT and let zod strip the rest, so an entry carrying both `stable_id` and
 * `revokes` was read as a denial and its revocation was dropped — the entry it
 * named stayed in force, with nothing red anywhere. The ledger's own doctrine
 * is the policy's: a key the reader does not read is a rule that is not in
 * force, and silence about that is the failure mode (2026-08-25 review).
 */
describe("parseLedger — an entry that means two things is refused, never read as one of them", () => {
  /** The refusal text, or what the reader took instead, so a failure prints it. */
  function readAs(text: string): string {
    const r = parseLedger(text, P);
    if (!r.ok) return r.refusals.map((x) => x.why).join("; ");
    return `TAKEN: ${JSON.stringify(r.ledger.entries)}`;
  }

  it("refuses a denial that also revokes, instead of dropping the revocation", () => {
    const both = DENIAL.replace(
      "  scope: node\n",
      "  scope: node\n  revokes: 2026-08-24T10:00:00Z-000000\n",
    );
    expect(readAs(both)).toMatch(/`stable_id`.*`revokes`|`revokes`.*`stable_id`/);
    expect(slugsOf(both)).toEqual(["ksor-ledger-invalid"]);
  });

  it("refuses a revocation that also amends, and a denial that also amends", () => {
    expect(
      slugsOf(REVOCATION.replace("  by:", "  amends: 2026-08-24T10:00:00Z-000000\n  by:")),
    ).toEqual(["ksor-ledger-invalid"]);
    expect(
      slugsOf(DENIAL.replace("  by:", "  amends: 2026-08-24T10:00:00Z-000000\n  by:")),
    ).toEqual(["ksor-ledger-invalid"]);
  });

  /**
   * The same rule one step out: a key the entry's kind does not read is a
   * constraint the author believes is in force and the reader never applies.
   * `scope:` on a revocation reads as though the revocation were scoped.
   */
  it("refuses a key the entry's kind does not read", () => {
    expect(readAs(DENIAL + REVOCATION.replace("  by:", "  scope: subtree\n  by:"))).toMatch(
      /unknown key/,
    );
    expect(slugsOf(DENIAL.replace("  scope: node", "  scop: node"))).toEqual([
      "ksor-ledger-invalid",
    ]);
    expect(
      slugsOf(DENIAL + AMENDMENT.replace("  by:", "  stable_ids: knowledge/x\n  by:")),
    ).toEqual(["ksor-ledger-invalid"]);
  });

  it("takes every key each kind really reads — the verb's own output stays green", () => {
    const l = ledgerOf(DENIAL + REVOCATION + AMENDMENT + SUBTREE);
    expect(l.entries.map((e) => e.kind)).toEqual(["denial", "revocation", "amendment", "denial"]);
    // `reason` is optional on all three.
    expect(
      ledgerOf(DENIAL.replace("  reason: superseded figure\n", "")).entries[0]?.reason,
    ).toBeNull();
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
  /** What a build that PASSED recorded — the only evidence the record accepted an entry. */
  const accepted = (l: Ledger): LedgerBaseline => ({
    source: "build.lock.json",
    accepted: true,
    entries: ledgerDigests(l),
  });
  /** What was merely COMMITTED — every version of the file git remembers. */
  const history = (l: Ledger): LedgerBaseline => ({
    source: "git history",
    entries: l.entries.map((e) => ({
      id: e.id,
      digest: entryDigest(e),
      entry: e,
      where: "abc1234",
    })),
  });

  it("every entry's `by` — denial, revocation, amendment — must be a takedown authority", () => {
    const l = ledgerOf(DENIAL + REVOCATION + AMENDMENT);
    const r = checkLedgerActors(l, ["human:ciso"], []);
    expect(r.map((x) => x.slug)).toEqual(["ksor-takedown-unauthorised"]);
    expect(r[0]?.why).toMatch(/human:cfo/);
    expect(r[0]?.why).toMatch(/2026-08-26T10:00:00Z-d4e5f6/);
    expect(checkLedgerActors(l, ["human:ciso", "human:cfo"], [])).toEqual([]);
  });

  /**
   * A roster is a list of PEOPLE, and people leave. Judging committed entries
   * against the present roster meant that removing a departed authority from
   * `.ksor/governance.yaml` refused every entry they had ever written — the
   * record stopped building on a personnel change — and the obvious escape,
   * deleting those entries, is `ksor-ledger-shrank`. The only way out was to go
   * on naming a departed person as an authority, which is a lie the policy
   * would then carry forever.
   */
  it("does not re-judge an entry a passing build accepted, when its author leaves the roster", () => {
    const l = ledgerOf(DENIAL + REVOCATION + AMENDMENT);
    expect(checkLedgerActors(l, ["human:successor"], [accepted(l)])).toEqual([]);
  });

  /**
   * The hole this must not open. Git history proves a line was COMMITTED, and
   * anyone with write access can commit — a pull request that hand-appends an
   * entry puts it in history before any check runs, and on a `pull_request`
   * checkout that history includes the pull request's own commits. So history
   * can never be the evidence that the RECORD accepted an entry; only the lock
   * a passing build wrote can be, because writing that lock is what the
   * authority check stands in front of.
   */
  it("git history never exempts an entry — a committed line is still a written line", () => {
    const l = ledgerOf(DENIAL);
    expect(checkLedgerActors(l, ["human:successor"], [history(l)]).map((x) => x.slug)).toEqual([
      "ksor-takedown-unauthorised",
    ]);
  });

  it("judges the entries an accepted baseline does not record, and only those", () => {
    const before = ledgerOf(DENIAL);
    const l = ledgerOf(DENIAL + REVOCATION);
    const r = checkLedgerActors(l, ["human:ciso"], [accepted(before)]);
    expect(r.map((x) => x.slug)).toEqual(["ksor-takedown-unauthorised"]);
    expect(r[0]?.why).toMatch(/human:cfo/);
  });

  it("judges an entry whose text moved under an accepted id — acceptance is of TEXT, not of an id", () => {
    const l = ledgerOf(DENIAL);
    const retargeted = ledgerOf(DENIAL.replace("policies/old-threshold", "policies/open"));
    expect(
      checkLedgerActors(retargeted, ["human:successor"], [accepted(l)]).map((x) => x.slug),
    ).toEqual(["ksor-takedown-unauthorised"]);
  });

  it("judges every entry when no baseline proves acceptance — the strict rule is the default", () => {
    const l = ledgerOf(DENIAL);
    expect(checkLedgerActors(l, ["human:successor"], []).map((x) => x.slug)).toEqual([
      "ksor-takedown-unauthorised",
    ]);
  });
});

describe("checkLedgerAgainstTree", () => {
  const tree = {
    documentIds: new Set(["policies/old-threshold", "hr/leave"]),
    dirs: new Set(["policies", "hr"]),
  };

  const ROOT_HOLD = `- id: 2026-08-25T10:00:00Z-ffffff
  stable_id: knowledge/#section
  scope: subtree
  expected: present
  by: human:ciso
  at: 2026-08-25T10:00:00Z
  reason: legal hold over the whole record
`;

  /**
   * A record-wide legal hold — `knowledge/#section` — is refused, because only
   * ONE of the two surfaces can carry it out.
   *
   * The site can: `denies()` reads the empty prefix as "everything", so the
   * website goes dark. The database cannot: the subtree walk decision 14
   * specifies runs by `parent_id` from the node the denylist row NAMES, and no
   * node has stable_id `knowledge/` — top-level sections are
   * `knowledge/<section>#section` with `parent_id IS NULL` (measured on a live
   * 187-document record: zero rows for `knowledge/` and zero for `knowledge`).
   * So the seed is empty, the recursion never starts, and the door keeps
   * serving every document. The surfaces do not merely differ, they INVERT:
   * the visible one goes dark, which reads as confirmation that the hold
   * worked, while the invisible one answers every agent — decision 19's
   * forbidden state in its worst direction.
   *
   * This supersedes the earlier reading, which took `denies()` resolving the
   * root as proof the hold was recordable and removed this refusal. Only the
   * site half ever resolved it.
   *
   * Refused HERE and not in `parseEntry`, deliberately: the ledger is
   * append-only, so the entry cannot be deleted (`ksor-ledger-shrank`), and
   * the sanctioned exit — `ksor takedown --revoke <id>` — loads the file
   * through `parseLedger` (`commands.ts:913`). A parse-time refusal would
   * therefore leave the operator with no way out at all. Refusing on the
   * in-force set keeps the entry readable, so revoking it works and stops the
   * refusal.
   */
  it("a subtree denial on the record ROOT is refused — the serving half cannot honour it", () => {
    const r = checkLedgerAgainstTree(ledgerOf(ROOT_HOLD), tree);
    expect(r.map((x) => x.slug)).toEqual(["ksor-takedown-dangling"]);
    expect(r[0]?.why).toContain("knowledge/#section");
    expect(r[0]?.why).toMatch(/parent_id/);
    expect(r[0]?.fix).toContain("--scope subtree knowledge/<section>");
    expect(r[0]?.fix).toContain("2026-08-25T10:00:00Z-ffffff");
  });

  it("revoking the root hold clears the refusal — the exit the fix names actually works", () => {
    const revoked = `${ROOT_HOLD}- id: 2026-08-26T10:00:00Z-aaabbb
  revokes: 2026-08-25T10:00:00Z-ffffff
  by: human:ciso
  at: 2026-08-26T10:00:00Z
  reason: replaced by a denial per section
`;
    expect(checkLedgerAgainstTree(ledgerOf(revoked), tree)).toEqual([]);
  });

  it("a subtree denial on a real top-level section is untouched — that is the recorded form", () => {
    expect(checkLedgerAgainstTree(ledgerOf(SUBTREE), tree)).toEqual([]);
  });

  it("an in-force present node entry whose concept is gone is ksor-takedown-dangling", () => {
    const r = checkLedgerAgainstTree(ledgerOf(DENIAL), {
      ...tree,
      documentIds: new Set(["hr/leave"]),
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
      checkLedgerAgainstTree(ledgerOf(DENIAL + REVOCATION), { ...tree, documentIds: new Set() }),
    ).toEqual([]);
  });

  it("a removed entry whose path reappears is ksor-takedown-readded", () => {
    expect(checkLedgerAgainstTree(ledgerOf(DENIAL + AMENDMENT), tree).map((x) => x.slug)).toEqual([
      "ksor-takedown-readded",
    ]);
    expect(
      checkLedgerAgainstTree(ledgerOf(DENIAL + AMENDMENT), { ...tree, documentIds: new Set() }),
    ).toEqual([]);
  });

  /**
   * `scope` x `expected` x presence, as ONE table — decision 18's shape applied
   * to a rule that HAD two branches and only one of them tested.
   *
   * The subtree branch refused on absence alone and never read `expected`, so a
   * single ordinary command wrote a ledger the tool's own checker then refused,
   * with no honest exit: `ksor takedown --scope subtree knowledge/embargo` on a
   * directory that does not exist yet — which decision 14 sanctions, a denial
   * may precede what it names — recorded `expected: removed` and exited 0, and
   * the NEXT `ksor build` exited 1 with `ksor-takedown-dangling`. The identical
   * act at node scope built green. Append-only means the line cannot be
   * deleted, `--revoke` records a lift that never happened (and drops the hold
   * if the path returns), and "restore the directory" does not survive a clone
   * because git cannot commit an empty one. Reproduced on an emitted scaffold,
   * 2026-08-25.
   *
   * The mirror gap is the same defect facing the other way: `expected: removed`
   * at subtree scope had no `readded` arm, so a directory the record says was
   * deleted could come back with nothing red — while the SERVING side has read
   * `expected` scope-blind all along (`governance-gate.ts`: `d.expected <>
   * 'removed'`). One rule, both scopes, every combination named here.
   */
  const COMBINATIONS = [
    { scope: "node", expected: "present", present: true, slug: null },
    { scope: "node", expected: "present", present: false, slug: "ksor-takedown-dangling" },
    { scope: "node", expected: "removed", present: true, slug: "ksor-takedown-readded" },
    { scope: "node", expected: "removed", present: false, slug: null },
    { scope: "subtree", expected: "present", present: true, slug: null },
    { scope: "subtree", expected: "present", present: false, slug: "ksor-takedown-dangling" },
    { scope: "subtree", expected: "removed", present: true, slug: "ksor-takedown-readded" },
    { scope: "subtree", expected: "removed", present: false, slug: null },
  ] as const;

  it.each(COMBINATIONS)(
    "a $scope denial expecting $expected, target present=$present -> $slug",
    ({ scope, expected, present, slug }) => {
      const stableId = scope === "subtree" ? "knowledge/embargo#section" : "knowledge/embargo/memo";
      const entry = `- id: 2026-08-25T12:00:00Z-abcdef
  stable_id: ${stableId}
  scope: ${scope}
  expected: ${expected}
  by: human:ciso
  at: 2026-08-25T12:00:00Z
  reason: legal hold
`;
      const here = present
        ? {
            documentIds: new Set([...tree.documentIds, "embargo/memo"]),
            dirs: new Set([...tree.dirs, "embargo"]),
          }
        : tree;
      const got = checkLedgerAgainstTree(ledgerOf(entry), here);
      expect(got.map((x) => x.slug)).toEqual(slug === null ? [] : [slug]);
      // A refusal names the entry and an exit that does not lie about the act
      // (product principle 4): `--removed` records the removal, it does not
      // pretend the hold was lifted.
      if (slug === "ksor-takedown-dangling") {
        expect(got[0]?.why).toContain("2026-08-25T12:00:00Z-abcdef");
        expect(got[0]?.fix).toContain("--removed");
      }
      if (slug === "ksor-takedown-readded") {
        expect(got[0]?.why).toContain("2026-08-25T12:00:00Z-abcdef");
        expect(got[0]?.fix).toContain("--revoke");
      }
    },
  );

  /**
   * The record ROOT is refused whatever `expected` says: the form is
   * unhonourable by the serving half, not merely out of step with the tree.
   */
  it("the root hold is refused at expected: removed too", () => {
    const removedRoot = ROOT_HOLD.replace("expected: present", "expected: removed");
    expect(checkLedgerAgainstTree(ledgerOf(removedRoot), tree).map((x) => x.slug)).toEqual([
      "ksor-takedown-dangling",
    ]);
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
    // Refused upstream by `checkLedgerAgainstTree`, so unreachable in a record
    // that builds; it answers `true` because denying too much is the safe half.
    expect(denies([denial("knowledge/#section", "subtree")], "anything")).toBe(true);
    expect(denies([], "a")).toBe(false);
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
    for (const entry of [denial, revocation, amendment]) {
      text = (text ?? "") + bytesToAppend(text, entry);
    }
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
    const first = bytesToAppend(null, denial);
    // What the file HOLDS is never in the answer, so a caller cannot write the
    // result back over the file — the shape that deleted concurrent acts.
    const trimmed = first.replace(/\n$/, "");
    const added = bytesToAppend(trimmed, { ...denial, id: `${at}-second` });
    expect(added.startsWith("\n- id:"), "a file with no final newline gets one").toBe(true);
    expect(added, "the header belongs to the first entry alone").not.toContain("#");
    const second = trimmed + added;
    expect(second.startsWith(first.trimEnd())).toBe(true);
    expect(parseLedger(second, "p").ok).toBe(true);
  });

  /**
   * The header is written at RUNTIME, so it never passes through init's prose
   * translation (decision 25) and `assertNoForeignManager` — which scans the
   * tree as emitted — cannot reach it. It named `pnpm check` in every scaffold,
   * npm's and bun's included.
   */
  it("the header names no package manager, because nothing can translate it later", () => {
    const header = bytesToAppend(null, denial).split("- id:")[0] ?? "";
    expect(header).toContain("#");
    for (const manager of ["pnpm", "npm run", "bun run", "yarn"]) {
      expect(header, `the ledger header names \`${manager}\``).not.toContain(manager);
    }
  });

  it("a subtree denial names the `#section` anchor, and the reader agrees", () => {
    const text = bytesToAppend(null, {
      ...denial,
      stableId: "knowledge/policies#section",
      scope: "subtree",
    });
    const parsed = parseLedger(text, "p");
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  });
});

describe("denies — the site's denial predicate, on the same in-force set", () => {
  it("a node denial matches exactly its concept, and nothing beside it", () => {
    const live = inForce(ledgerOf(DENIAL));
    expect(denies(live, "policies/old-threshold")).toBe(true);
    expect(denies(live, "policies/old-threshold-v2")).toBe(false);
  });

  it("a subtree denial covers every descendant by directory, never by prefix", () => {
    const live = inForce(ledgerOf(SUBTREE));
    expect(denies(live, "policies/old-threshold")).toBe(true);
    expect(denies(live, "policies/deep/er")).toBe(true);
    expect(denies(live, "policies-archive/x")).toBe(false);
    // A concept named exactly for the directory cannot exist in a conformant
    // record (the route collision is refused), and the unreachable case denies.
    expect(denies(live, "policies")).toBe(true);
  });

  it("a revoked denial denies nothing; a removed one still does", () => {
    expect(denies(inForce(ledgerOf(DENIAL + REVOCATION)), "policies/old-threshold")).toBe(false);
    expect(denies(inForce(ledgerOf(DENIAL + AMENDMENT)), "policies/old-threshold")).toBe(true);
  });

  /** The root form never reaches a published surface — `checkLedgerAgainstTree` refuses it. */
  it("the root section denies the whole bundle, which is the fail-closed half of a refused entry", () => {
    const root = SUBTREE.replace("knowledge/policies#section", "knowledge/#section");
    expect(denies(inForce(ledgerOf(root)), "anything/at/all")).toBe(true);
  });
});
