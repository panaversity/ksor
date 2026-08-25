/**
 * The read plane at LEVEL 0, where `instance.md` declares no `database:` and
 * `.ksor/takedowns.yaml` is the whole state.
 *
 * `--list` and `--ledger` used to refuse on that record. They are read-only,
 * they need no actor, and the file they would read is committed and already
 * parsed — and the refusal broke the workflow the scaffold's own AGENTS.md
 * documents, because `--revoke` takes a LEDGER ENTRY id and `--ledger` is what
 * lists it.
 */

import { describe, expect, it } from "vitest";

import { parseLedger, type Ledger } from "./record/ledger.js";
import { ledgerActs, ledgerDenials } from "./takedown-ops.js";

const entry = (id: string, at: string, rest: string): string =>
  `- id: ${id}\n  by: human:ciso\n  at: ${at}\n${rest}`;
const D1 = entry(
  "d1",
  "2026-08-25T10:00:00Z",
  "  stable_id: knowledge/x\n  scope: node\n  expected: present\n  reason: legal\n",
);
const D2 = entry(
  "d2",
  "2026-08-25T09:00:00Z",
  "  stable_id: knowledge/y#section\n  scope: subtree\n  expected: present\n",
);
const R1 = entry("r1", "2026-08-25T11:00:00Z", "  revokes: d1\n  reason: lifted\n");

function ledger(text: string): Ledger {
  const r = parseLedger(text, ".ksor/takedowns.yaml");
  if (!r.ok) throw new Error(JSON.stringify(r.refusals));
  return r.ledger;
}

describe("ledgerDenials — what `--list` prints without a database", () => {
  it("lists the denials in force, oldest first, with their scope and reason", () => {
    expect(ledgerDenials(ledger(D1 + D2))).toEqual([
      {
        stableId: "knowledge/y#section",
        scope: "subtree",
        reason: "",
        createdAt: new Date("2026-08-25T09:00:00Z"),
      },
      {
        stableId: "knowledge/x",
        scope: "node",
        reason: "legal",
        createdAt: new Date("2026-08-25T10:00:00Z"),
      },
    ]);
  });

  it("a revoked denial is not in the list — the same state the serving predicate reads", () => {
    expect(ledgerDenials(ledger(D1 + R1)).map((r) => r.stableId)).toEqual([]);
  });

  it("an empty ledger denies nothing rather than refusing", () => {
    expect(ledgerDenials(ledger(""))).toEqual([]);
  });
});

describe("ledgerActs — what `--ledger` prints without a database", () => {
  const acts = ledgerActs(ledger(D1 + R1));

  it("names every entry id, which is what `--revoke` needs", () => {
    expect(acts.map((a) => a.detail["ledger_id"])).toEqual(["r1", "d1"]);
  });

  it("is newest first, and carries the act, the actor and the reason", () => {
    expect(acts[0]).toEqual({
      action: "takedown_revoked",
      actor: "human:ciso",
      generation: null,
      detail: { ledger_id: "r1", reason: "lifted", via: "ledger", revokes: "d1" },
      createdAt: new Date("2026-08-25T11:00:00Z"),
    });
    expect(acts[1]?.action).toBe("takedown_denied");
    expect(acts[1]?.detail["stable_id"]).toBe("knowledge/x");
  });

  it("an amendment is an act of its own", () => {
    const a = entry("a1", "2026-08-25T12:00:00Z", "  amends: d1\n  expected: removed\n");
    const [first] = ledgerActs(ledger(D1 + a));
    expect(first?.action).toBe("takedown_amended");
    expect(first?.detail["amends"]).toBe("d1");
  });
});
