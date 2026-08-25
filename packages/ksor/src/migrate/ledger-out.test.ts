import { parseLedger } from "@panaversity/ksor-content/record";
import { describe, expect, it } from "vitest";

import type { DbDenial } from "./denials.js";
import {
  ledgerIdFor,
  renderLedger,
  repoint,
  toLedgerEntries,
  type ReservedFate,
} from "./ledger-out.js";

const row = (over: Partial<DbDenial> = {}): DbDenial => ({
  stableId: "knowledge/policies/old",
  scope: "node",
  reason: "legal request 2026-08",
  at: "2026-08-20T09:00:00Z",
  actor: "human:ciso",
  ...over,
});

/** What this run did with each reserved name it walked; see `ReservedFate`. */
const NONE: ReservedFate = new Map();
const MOVED: ReservedFate = new Map([["knowledge/policies/index", "moved"]]);
const MOVED_README: ReservedFate = new Map([["knowledge/policies/README", "moved"]]);

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
    expect(repoint("knowledge/policies/index", "node", MOVED)).toBe("knowledge/policies/overview");
    expect(repoint("knowledge/policies/README", "node", MOVED_README)).toBe(
      "knowledge/policies/overview",
    );
    expect(repoint("knowledge/policies/index", "subtree", MOVED)).toBe(
      "knowledge/policies#section",
    );
  });

  it("leaves an ordinary document alone", () => {
    expect(repoint("knowledge/policies/old", "node", MOVED)).toBe("knowledge/policies/old");
    expect(repoint("knowledge/indexes", "node", MOVED)).toBe("knowledge/indexes");
  });
});

describe("toLedgerEntries", () => {
  it("carries the actor the log recorded", () => {
    const out = toLedgerEntries([row()], new Map(), NONE);
    expect(out.refusals).toEqual([]);
    expect(out.entries[0]).toMatchObject({
      stableId: "knowledge/policies/old",
      by: "human:ciso",
      at: "2026-08-20T09:00:00Z",
      reason: "legal request 2026-08",
    });
  });

  it("refuses a denial the log cannot attribute, naming the flag that would", () => {
    const out = toLedgerEntries([row({ actor: null })], new Map(), NONE);
    expect(out.entries).toEqual([]);
    expect(out.refusals).toHaveLength(1);
    expect(out.refusals[0]!.slug).toBe("ksor-migrate-underivable");
    expect(out.refusals[0]!.fix).toContain("--attribute knowledge/policies/old=human:<id>");
  });

  it("lets --attribute answer it, and says in the entry that a human asserted it", () => {
    const out = toLedgerEntries(
      [row({ actor: null })],
      new Map([["knowledge/policies/old", "human:kim"]]),
      NONE,
    );
    expect(out.refusals).toEqual([]);
    expect(out.entries[0]!.by).toBe("human:kim");
    expect(out.entries[0]!.reason).toContain("asserted by --attribute");
  });

  it("--attribute overrides the log, and the entry records that it did", () => {
    const out = toLedgerEntries([row()], new Map([["knowledge/policies/old", "human:kim"]]), NONE);
    expect(out.entries[0]!.by).toBe("human:kim");
    expect(out.entries[0]!.reason).toContain("asserted by --attribute");
  });

  it("gives a reasonless row a reason that says where it came from", () => {
    const out = toLedgerEntries([row({ reason: "" })], new Map(), NONE);
    expect(out.entries[0]!.reason).toBe("migrated from the denylist");
  });
});

describe("renderLedger", () => {
  it("marks a denial `removed` when the record no longer holds the concept", () => {
    const entries = toLedgerEntries([row()], new Map(), NONE).entries;
    expect(renderLedger(entries, new Set(["policies/old"]))).toContain("expected: present");
    expect(renderLedger(entries, new Set())).toContain("expected: removed");
  });

  // A subtree denial names a container and its future descendants (decision 14),
  // so there is no concept for it to be present as.
  it("always calls a subtree denial present", () => {
    const entries = toLedgerEntries(
      [row({ stableId: "knowledge/policies#section", scope: "subtree" })],
      new Map(),
      NONE,
    ).entries;
    expect(renderLedger(entries, new Set())).toContain("expected: present");
  });

  it("writes entries the ledger reader accepts", async () => {
    const { parseLedger } = await import("@panaversity/ksor-content/record");
    const entries = toLedgerEntries([row()], new Map(), NONE).entries;
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

/**
 * `parseLedger` refuses any `scope: subtree` entry whose `stable_id` does not
 * end in `#section`, and `repoint` rewrites only `/index` and `/README` — so
 * every other subtree row was transcribed verbatim into a file migrate's own
 * checker cannot load, with no refusal of its own. The round trip through
 * `parseLedger` is what would have caught it, so the test does that.
 */
describe("toLedgerEntries — a subtree row must name a container", () => {
  const dbRow = (stableId: string, scope: "node" | "subtree"): DbDenial => ({
    stableId,
    scope,
    reason: "r",
    at: "2026-08-01T00:00:00Z",
    actor: "human:ciso",
  });

  it("refuses a subtree row that names an ordinary document", () => {
    const out = toLedgerEntries([dbRow("knowledge/policies/pay", "subtree")], new Map(), NONE);
    expect(out.entries).toEqual([]);
    expect(out.refusals.map((r) => r.slug)).toEqual(["ksor-migrate-underivable"]);
    expect(out.refusals[0]?.why).toContain("knowledge/policies/pay");
    expect(out.refusals[0]?.why).toContain("#section");
  });

  it("accepts a subtree row already anchored, and its rendered file parses", () => {
    const out = toLedgerEntries([dbRow("knowledge/policies#section", "subtree")], new Map(), NONE);
    expect(out.refusals).toEqual([]);
    const parsed = parseLedger(
      renderLedger(out.entries, new Set<string>()),
      ".ksor/takedowns.yaml",
    );
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  });

  it("an /index subtree row is repointed to the container anchor and parses", () => {
    const out = toLedgerEntries([dbRow("knowledge/policies/index", "subtree")], new Map(), NONE);
    expect(out.entries[0]?.stableId).toBe("knowledge/policies#section");
    const parsed = parseLedger(
      renderLedger(out.entries, new Set<string>()),
      ".ksor/takedowns.yaml",
    );
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  });

  it("every node row it emits round-trips through parseLedger too", () => {
    const out = toLedgerEntries(
      [dbRow("knowledge/a", "node"), dbRow("knowledge/b/index", "node")],
      new Map([]),
      new Map([["knowledge/b/index", "moved"]]),
    );
    const parsed = parseLedger(renderLedger(out.entries, new Set(["a"])), ".ksor/takedowns.yaml");
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  });
});

/**
 * `repoint` rewrote every denied `<dir>/index` to `<dir>/overview` — but its
 * whole premise is that migrate MOVED that file's prose there, and migrate
 * moves nothing when the index is a GENERATED one (`isGeneratedIndex`), or
 * when the file is not in the record at all. Both cases repointed a real
 * denial onto a path that would never exist, and `expected: removed` then made
 * the checker agree with it: a withdrawn document undenied, exit 0, nothing
 * printed. Which document a denial now covers is a governance decision, so the
 * one case migrate cannot derive is refused rather than guessed (decision 14,
 * critical rule 1).
 */
describe("repoint — only where migrate actually moved the prose", () => {
  const dbRow = (stableId: string): DbDenial => ({
    stableId,
    scope: "node",
    reason: "r",
    at: "2026-08-01T00:00:00Z",
    actor: "human:ciso",
  });

  it("follows the prose when this run claimed the overview", () => {
    const out = toLedgerEntries(
      [dbRow("knowledge/hr/index")],
      new Map(),
      new Map([["knowledge/hr/index", "moved"]]),
    );
    expect(out.refusals).toEqual([]);
    expect(out.entries[0]?.stableId).toBe("knowledge/hr/overview");
  });

  it("refuses when migrate kept the file, rather than denying a path that will not exist", () => {
    const out = toLedgerEntries(
      [dbRow("knowledge/hr/index")],
      new Map(),
      new Map([["knowledge/hr/index", "kept"]]),
    );
    expect(out.entries).toEqual([]);
    expect(out.refusals.map((r) => r.slug)).toEqual(["ksor-migrate-underivable"]);
    expect(out.refusals[0]?.why).toContain("knowledge/hr/index");
    expect(out.refusals[0]?.fix).toContain("ksor takedown");
  });

  it("leaves a denial of a document the record no longer holds exactly as it is", () => {
    const out = toLedgerEntries([dbRow("knowledge/hr/index")], new Map(), new Map());
    expect(out.refusals).toEqual([]);
    expect(out.entries[0]?.stableId).toBe("knowledge/hr/index");
    expect(renderLedger(out.entries, new Set())).toContain("expected: removed");
  });

  it("still anchors a subtree denial at the container, whatever became of the file", () => {
    for (const fate of [NONE, new Map([["knowledge/hr/index", "kept"]]) as ReservedFate]) {
      expect(repoint("knowledge/hr/index", "subtree", fate)).toBe("knowledge/hr#section");
    }
  });
});

/**
 * `retrieval_log.actor` is free text the database hands back, and `--attribute`
 * is a string the operator hands over — neither was validated at all, and both
 * end up in `takedown_authorities` in `.ksor/governance.yaml`. The argument
 * guard on `--actor` never covered either.
 */
describe("toLedgerEntries — an actor from the database is validated too", () => {
  const dbRow = (actor: string | null): DbDenial => ({
    stableId: "knowledge/policies/old",
    scope: "node",
    reason: "r",
    at: "2026-08-01T00:00:00Z",
    actor,
  });

  it.each(["human:a]", "human:a,b", 'human:"a"', "human:a\nb", `human:${"a".repeat(10240)}`])(
    "refuses %s, naming the flag that replaces it",
    (actor) => {
      const out = toLedgerEntries([dbRow(actor)], new Map(), NONE);
      expect(out.entries).toEqual([]);
      expect(out.refusals.map((r) => r.slug)).toEqual(["ksor-migrate-underivable"]);
      expect(out.refusals[0]?.fix).toContain("--attribute");
    },
  );

  it("refuses the same forms when --attribute is what asserted them", () => {
    const out = toLedgerEntries(
      [dbRow("human:ciso")],
      new Map([["knowledge/policies/old", "human:a]"]]),
      NONE,
    );
    expect(out.entries).toEqual([]);
    expect(out.refusals.map((r) => r.slug)).toEqual(["ksor-migrate-underivable"]);
  });
});
