import { describe, expect, it } from "vitest";

import type { DbDenial } from "./denials.js";
import { ledgerIdFor, renderLedger, repoint, toLedgerEntries } from "./ledger-out.js";

const row = (over: Partial<DbDenial> = {}): DbDenial => ({
  stableId: "knowledge/policies/old",
  scope: "node",
  reason: "legal request 2026-08",
  at: "2026-08-20T09:00:00Z",
  actor: "human:ciso",
  ...over,
});

describe("ledgerIdFor", () => {
  it("is <at>-<6> and stable, so two migrations of one database produce one diff", () => {
    const id = ledgerIdFor("knowledge/a", "2026-08-20T09:00:00Z");
    expect(id).toMatch(/^2026-08-20T09:00:00Z-[0-9a-f]{6}$/);
    expect(ledgerIdFor("knowledge/a", "2026-08-20T09:00:00Z")).toBe(id);
    expect(ledgerIdFor("knowledge/b", "2026-08-20T09:00:00Z")).not.toBe(id);
  });
});

describe("repoint", () => {
  it("follows the prose for a node denial and the container for a subtree one", () => {
    expect(repoint("knowledge/policies/index", "node")).toBe("knowledge/policies/overview");
    expect(repoint("knowledge/policies/README", "node")).toBe("knowledge/policies/overview");
    expect(repoint("knowledge/policies/index", "subtree")).toBe("knowledge/policies#section");
  });

  it("leaves an ordinary document alone", () => {
    expect(repoint("knowledge/policies/old", "node")).toBe("knowledge/policies/old");
    expect(repoint("knowledge/indexes", "node")).toBe("knowledge/indexes");
  });
});

describe("toLedgerEntries", () => {
  it("carries the actor the log recorded", () => {
    const out = toLedgerEntries([row()], new Map());
    expect(out.refusals).toEqual([]);
    expect(out.entries[0]).toMatchObject({
      stableId: "knowledge/policies/old",
      by: "human:ciso",
      at: "2026-08-20T09:00:00Z",
      reason: "legal request 2026-08",
    });
  });

  it("refuses a denial the log cannot attribute, naming the flag that would", () => {
    const out = toLedgerEntries([row({ actor: null })], new Map());
    expect(out.entries).toEqual([]);
    expect(out.refusals).toHaveLength(1);
    expect(out.refusals[0]!.slug).toBe("ksor-migrate-underivable");
    expect(out.refusals[0]!.fix).toContain("--attribute knowledge/policies/old=human:<id>");
  });

  it("lets --attribute answer it, and says in the entry that a human asserted it", () => {
    const out = toLedgerEntries(
      [row({ actor: null })],
      new Map([["knowledge/policies/old", "human:kim"]]),
    );
    expect(out.refusals).toEqual([]);
    expect(out.entries[0]!.by).toBe("human:kim");
    expect(out.entries[0]!.reason).toContain("asserted by --attribute");
  });

  it("--attribute overrides the log, and the entry records that it did", () => {
    const out = toLedgerEntries([row()], new Map([["knowledge/policies/old", "human:kim"]]));
    expect(out.entries[0]!.by).toBe("human:kim");
    expect(out.entries[0]!.reason).toContain("asserted by --attribute");
  });

  it("gives a reasonless row a reason that says where it came from", () => {
    const out = toLedgerEntries([row({ reason: "" })], new Map());
    expect(out.entries[0]!.reason).toBe("migrated from the denylist");
  });
});

describe("renderLedger", () => {
  it("marks a denial `removed` when the record no longer holds the concept", () => {
    const entries = toLedgerEntries([row()], new Map()).entries;
    expect(renderLedger(entries, new Set(["policies/old"]))).toContain("expected: present");
    expect(renderLedger(entries, new Set())).toContain("expected: removed");
  });

  // A subtree denial names a container and its future descendants (decision 14),
  // so there is no concept for it to be present as.
  it("always calls a subtree denial present", () => {
    const entries = toLedgerEntries(
      [row({ stableId: "knowledge/policies#section", scope: "subtree" })],
      new Map(),
    ).entries;
    expect(renderLedger(entries, new Set())).toContain("expected: present");
  });

  it("writes entries the ledger reader accepts", async () => {
    const { parseLedger } = await import("@panaversity/ksor-content/record");
    const entries = toLedgerEntries([row()], new Map()).entries;
    const parsed = parseLedger(
      renderLedger(entries, new Set(["policies/old"])),
      ".ksor/takedowns.yaml",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.ledger.entries).toHaveLength(1);
    expect(parsed.ledger.entries[0]).toMatchObject({ kind: "denial", by: "human:ciso" });
  });
});
