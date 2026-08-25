import { describe, expect, it } from "vitest";

import { inForce, parseLedger } from "../record/ledger.js";
import { foldLedger, unmergedLines } from "./ledger-apply.js";

const ENTRY = (id: string, rest: string): string =>
  `- id: ${id}\n  by: human:ciso\n  at: 2026-08-25T10:00:00Z\n${rest}`;
const D1 = ENTRY(
  "d1",
  "  stable_id: knowledge/x\n  scope: node\n  expected: present\n  reason: r1\n",
);
const R1 = ENTRY("r1", "  revokes: d1\n");
const D2 = ENTRY("d2", "  stable_id: knowledge/x\n  scope: subtree\n  expected: present\n").replace(
  "knowledge/x",
  "knowledge/x#section",
);
const A1 = ENTRY("a1", "  amends: d1\n  expected: removed\n");
/** A SECOND denial of the same stable_id as D1, and the revocation of that one only. */
const D4 = ENTRY("d4", "  stable_id: knowledge/x\n  scope: node\n  expected: present\n");
const R4 = ENTRY("r4", "  revokes: d4\n");

function fold(text: string) {
  const r = parseLedger(text, ".ksor/takedowns.yaml");
  if (!r.ok) throw new Error(JSON.stringify(r.refusals));
  return foldLedger(r.ledger);
}

describe("foldLedger — the state each stable_id ends in", () => {
  it("a denial is in force", () => {
    expect(fold(D1)).toEqual([
      expect.objectContaining({ stableId: "knowledge/x", revokedBy: null }),
    ]);
  });
  it("a revocation lifts it — the row stays, revoked", () => {
    const [s] = fold(D1 + R1);
    expect(s?.revokedBy).toEqual({ id: "r1", at: "2026-08-25T10:00:00Z" });
    expect(s?.denial.id).toBe("d1");
  });
  it("a re-denial after a revocation is in force again under the NEW entry", () => {
    const D3 = ENTRY("d3", "  stable_id: knowledge/x\n  scope: node\n  expected: present\n");
    const [s] = fold(D1 + R1 + D3);
    expect(s?.denial.id).toBe("d3");
    expect(s?.revokedBy).toBeNull();
  });
  it("an amendment changes no row state", () => {
    const [s] = fold(D1 + A1);
    expect(s?.denial.id).toBe("d1");
    expect(s?.revokedBy).toBeNull();
  });
  it("one row per stable_id, in first-seen order; a subtree anchor is its own id", () => {
    const out = fold(D1 + D2);
    expect(out.map((s) => s.stableId)).toEqual(["knowledge/x", "knowledge/x#section"]);
  });

  /**
   * The blocker this file was keyed by stable_id for: two denials of ONE id,
   * only the NEWER revoked. `inForce` still holds the older one — so the site
   * keeps the document withdrawn — while folding by stable_id reported the id
   * as revoked and the door served it (decision 19's forbidden state).
   */
  it("a revoked SECOND denial never lifts a first one that still stands", () => {
    const [s, ...rest] = fold(D1 + D4 + R4);
    expect(rest, "still one row per stable_id").toEqual([]);
    expect(s?.revokedBy, "the id is denied while ANY denial naming it is in force").toBeNull();
    expect(s?.denial.id).toBe("d1");
  });

  it("agrees with inForce on every ledger: denied here iff a live denial names it", () => {
    for (const text of [D1, D1 + R1, D1 + D2, D1 + D4 + R4, D1 + R1 + D4, D1 + R1 + D4 + R4]) {
      const parsed = parseLedger(text, ".ksor/takedowns.yaml");
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.refusals));
      const live = new Set(inForce(parsed.ledger).map((d) => d.stableId));
      const folded = new Set(
        foldLedger(parsed.ledger)
          .filter((s) => s.revokedBy === null)
          .map((s) => s.stableId),
      );
      expect([...folded].sort(), `folded vs inForce for ${JSON.stringify(text)}`).toEqual(
        [...live].sort(),
      );
    }
  });
});

describe("unmergedLines", () => {
  it("names the id and both fixes, slug first", () => {
    const [line] = unmergedLines([{ stableId: "knowledge/x", ledgerId: "d9" }]);
    expect(line?.split("\n")[0]).toMatch(/^ksor-takedown-unmerged: knowledge\/x .*`d9`/);
    expect(line).toMatch(/merge the change/);
    expect(line).toMatch(/--revoke d9/);
  });
});
