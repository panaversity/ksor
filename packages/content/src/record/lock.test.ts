import { describe, expect, it } from "vitest";

import type { Denial } from "./ledger.js";
import {
  admittedViewersOf,
  buildIdOf,
  canonicalViewers,
  composeLock,
  OKF_PIN,
  parseLock,
  sha256Hex,
  type BuildIdInputs,
  type LockInput,
} from "./lock.js";

const NOW = Date.parse("2026-08-25T12:00:00Z");
const DAY = 86_400_000;

const INPUTS: BuildIdInputs = {
  documents: [
    { path: "b.md", sha256: "bb", admitted: ["public"] },
    { path: "a.md", sha256: "aa", admitted: ["internal", "public"] },
  ],
  companions: [{ path: "a.summary.md", sha256: "cc" }],
  assets: [{ path: "a.png", sha256: "dd" }],
  indexes: [{ path: "index.md", sha256: "ee" }],
  instance_sha256: "ii",
  policy_sha256: "pp",
  people_sha256: "pp",
  ledger_sha256: "ll",
  ksor_version: "0.1.0",
  drafts: "hidden",
};

describe("sha256Hex", () => {
  it("hashes text and bytes identically and prints 64 hex characters", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(new TextEncoder().encode("x"))).toBe(sha256Hex("x"));
  });
});

describe("buildIdOf (build spec §2)", () => {
  it("is order-independent over documents, companions and admitted lists, and prefixed sha256:", () => {
    const id = buildIdOf(INPUTS);
    expect(id).toMatch(/^sha256:[0-9a-f]{64}$/);
    const shuffled: BuildIdInputs = {
      ...INPUTS,
      documents: [
        { path: "a.md", sha256: "aa", admitted: ["public", "internal"] },
        { path: "b.md", sha256: "bb", admitted: ["public"] },
      ],
    };
    expect(buildIdOf(shuffled)).toBe(id);
  });

  it.each([
    ["a document hash", { documents: [{ path: "a.md", sha256: "a2", admitted: ["public"] }] }],
    ["an admitted set", { documents: [{ path: "a.md", sha256: "aa", admitted: [] }] }],
    ["a companion", { companions: [] }],
    ["an asset", { assets: [{ path: "a.png", sha256: "d2" }] }],
    // A generated index is published bytes; the id must move when they do.
    ["a generated index", { indexes: [{ path: "index.md", sha256: "e2" }] }],
    ["the instance", { instance_sha256: "i2" }],
    ["the policy", { policy_sha256: "p2" }],
    // The site prints what `.ksor/people.yaml` maps in PLACE of the stored
    // actor, so an edit to it changes the approver published on every page.
    // While it sat outside this object, the human surface and the machine
    // surface of one build could name different approvers under one id, with
    // `pnpm check` green and the lock byte-identical (review, 2026-09-01).
    ["the phone book", { people_sha256: "h2" }],
    ["the ledger", { ledger_sha256: "l2" }],
    ["the toolchain", { ksor_version: "0.2.0" }],
    ["the drafts switch", { drafts: "shown" as const }],
  ])("changes when %s changes", (_what, patch) => {
    expect(buildIdOf({ ...INPUTS, ...patch })).not.toBe(buildIdOf(INPUTS));
  });
});

describe("canonicalViewers", () => {
  it("is [public] alone, plus [public, X] for every registered audience", () => {
    expect(canonicalViewers([])).toEqual({ public: ["public"] });
    expect(canonicalViewers(["internal", "board"])).toEqual({
      public: ["public"],
      internal: ["public", "internal"],
      board: ["public", "board"],
    });
  });
});

describe("admittedViewersOf — the machine surface at as_of, minus in-force denials", () => {
  const viewers = canonicalViewers(["internal"]);
  const stable = {
    id: "policies/x",
    status: "stable" as const,
    effectiveFrom: null,
    staleAfter: null,
    audience: ["public"],
  };

  it("a stable public concept is admitted to every viewer; an internal one to the internal viewer only", () => {
    expect(admittedViewersOf(stable, viewers, NOW, [])).toEqual(["internal", "public"]);
    expect(admittedViewersOf({ ...stable, audience: ["internal"] }, viewers, NOW, [])).toEqual([
      "internal",
    ]);
  });

  it("draft, deprecated, not-yet-effective and stale concepts are admitted nowhere", () => {
    expect(admittedViewersOf({ ...stable, status: "draft" }, viewers, NOW, [])).toEqual([]);
    expect(admittedViewersOf({ ...stable, status: "deprecated" }, viewers, NOW, [])).toEqual([]);
    expect(admittedViewersOf({ ...stable, effectiveFrom: NOW + DAY }, viewers, NOW, [])).toEqual(
      [],
    );
    expect(admittedViewersOf({ ...stable, staleAfter: NOW - DAY }, viewers, NOW, [])).toEqual([]);
    expect(admittedViewersOf({ ...stable, effectiveFrom: NOW - DAY }, viewers, NOW, [])).toEqual([
      "internal",
      "public",
    ]);
  });

  it("a node denial removes exactly that concept; a subtree denial removes every descendant", () => {
    const deny = (stableId: string, scope: "node" | "subtree"): Denial => ({
      kind: "denial",
      id: "1",
      by: "human:ciso",
      at: "2026-08-25T10:00:00Z",
      reason: null,
      stableId,
      scope,
      expected: "present",
    });
    expect(admittedViewersOf(stable, viewers, NOW, [deny("knowledge/policies/x", "node")])).toEqual(
      [],
    );
    expect(
      admittedViewersOf(stable, viewers, NOW, [deny("knowledge/policies/xy", "node")]),
    ).toHaveLength(2);
    expect(
      admittedViewersOf(stable, viewers, NOW, [deny("knowledge/policies#section", "subtree")]),
    ).toEqual([]);
    expect(
      admittedViewersOf(stable, viewers, NOW, [deny("knowledge/pol#section", "subtree")]),
    ).toHaveLength(2);
    expect(
      admittedViewersOf(stable, viewers, NOW, [deny("knowledge/#section", "subtree")]),
    ).toEqual([]);
  });
});

describe("composeLock + parseLock", () => {
  const input: LockInput = {
    ksorVersion: "0.1.0",
    sourceCommit: "abc",
    dirty: false,
    asOf: NOW,
    drafts: "hidden",
    instanceText: "---\nformat: 2\n---\n",
    policyText: "version: '0.1'\n",
    peopleText: null,
    ledgerText: null,
    ledgerEntries: [],
    audiences: ["internal"],
    concepts: [
      {
        id: "policies/x",
        status: "stable",
        effectiveFrom: null,
        staleAfter: null,
        audience: ["public"],
        text: "body",
      },
    ],
    companions: [{ path: "policies/x.summary.md", text: "s" }],
    assets: [{ path: "policies/x.png", bytes: new Uint8Array([1, 2, 3]) }],
    indexes: [{ path: "index.md", text: "# R\n" }],
    denials: [],
    bundles: [
      { viewer: "public", sha256: "a".repeat(64), files: 2 },
      { viewer: "internal", sha256: "b".repeat(64), files: 3 },
    ],
  };

  it("composes the §2 shape, and the lock parses back to itself", () => {
    const lock = composeLock(input);
    expect(lock.format).toBe(1);
    expect(lock.okf).toEqual(OKF_PIN);
    expect(lock.as_of).toBe("2026-08-25T12:00:00.000Z");
    expect(lock.audiences).toEqual({
      registry: ["internal"],
      viewers: { public: ["public"], internal: ["public", "internal"] },
    });
    expect(lock.documents).toEqual([
      {
        path: "policies/x.md",
        sha256: sha256Hex("body"),
        status: "stable",
        audience: ["public"],
        admitted: ["internal", "public"],
      },
    ]);
    expect(lock.companions).toEqual([{ path: "policies/x.summary.md", sha256: sha256Hex("s") }]);
    expect(lock.assets).toEqual([
      { path: "policies/x.png", sha256: sha256Hex(new Uint8Array([1, 2, 3])) },
    ]);
    // The §8 indexes are GENERATED, and they are also published — the surface an
    // external reader parses to find anything at all. They belonged in no
    // section of the lock, so "what was published" stopped short of them.
    expect(lock.indexes).toEqual([{ path: "index.md", sha256: sha256Hex("# R\n") }]);
    expect(lock.ledger_sha256).toBe(sha256Hex(""));
    // Absent phone book hashes as empty, the same way an absent ledger does —
    // so "declares no names" is a stated fact rather than a missing key.
    expect(lock.people_sha256).toBe(sha256Hex(""));
    // One digest per canonical viewer — what `ksor build --bundles` writes for
    // it — recorded on EVERY build, so the lock is the same lock whether or not
    // the bundles were materialised, and a bundle directory can be matched to
    // the publication that produced it.
    expect(lock.bundles).toEqual(input.bundles);
    const parsed = parseLock(JSON.stringify(lock));
    expect(parsed.ok && parsed.lock).toEqual(lock);
  });

  it("build_id does not cover the bundle digests — they are a function of what it already hashes", () => {
    const base = composeLock(input).build_id;
    expect(composeLock({ ...input, bundles: [] }).build_id).toBe(base);
  });

  it("a lock written before bundle digests existed is refused, not read around", () => {
    const { bundles: _omitted, ...older } = composeLock(input);
    const parsed = parseLock(JSON.stringify(older));
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.why).toContain("bundles");
  });

  it("build_id excludes as_of, source_commit and dirty, and moves with the admitted set", () => {
    const base = composeLock(input).build_id;
    expect(composeLock({ ...input, asOf: NOW + 1, sourceCommit: null, dirty: true }).build_id).toBe(
      base,
    );
    const effective = {
      ...input,
      concepts: [{ ...input.concepts[0]!, effectiveFrom: NOW + DAY }],
    };
    expect(composeLock(effective).build_id).not.toBe(base);
    expect(composeLock({ ...effective, asOf: NOW + 2 * DAY }).build_id).toBe(base);
    // An asset's bytes are published, so they move the id like a document's.
    expect(
      composeLock({
        ...input,
        assets: [{ path: "policies/x.png", bytes: new Uint8Array([9]) }],
      }).build_id,
    ).not.toBe(base);
    // So do an index's, for the same reason.
    expect(
      composeLock({ ...input, indexes: [{ path: "index.md", text: "# Renamed\n" }] }).build_id,
    ).not.toBe(base);
  });

  it("parseLock names what is wrong with a lock that is not one", () => {
    expect(parseLock("nope").ok).toBe(false);
    const r = parseLock(JSON.stringify({ format: 2 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/format/);
  });
});
