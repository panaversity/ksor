import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { RecordFiles } from "../record/check.js";
import { composeLock } from "../record/lock.js";
import { checkLock, conceptHashes, formatRefusals, sha256OfDocument } from "./lock-gate.js";

const DOC = "---\ntype: Document\n---\nBody.\n";
const INSTANCE = "---\nformat: 2\n---\n";
const POLICY = 'version: "0.1"\n';
const LEDGER = "- id: d1\n  by: human:ciso\n  at: 2026-08-25T10:00:00Z\n  stable_id: knowledge/a\n";
const SUMMARY = "---\ntype: Summary\n---\nS.\n";
const ASSET = new Uint8Array([1, 2, 3]);
const record: RecordFiles = {
  files: new Map([
    ["instance.md", INSTANCE],
    [".ksor/governance.yaml", POLICY],
    [".ksor/takedowns.yaml", LEDGER],
    ["knowledge/index.md", "# Index\n"],
    ["knowledge/a.md", DOC],
    ["knowledge/a.summary.md", SUMMARY],
    ["knowledge/pol/b.md", DOC + "more\n"],
    ["knowledge/pol/README.md", "# nope\n"],
  ]),
  dirs: ["knowledge/pol"],
  assets: new Map([["knowledge/pol/diagram.png", ASSET]]),
};

interface LockOverrides {
  readonly documents?: Record<string, string>;
  readonly companions?: Record<string, string>;
  readonly assets?: Record<string, string>;
  readonly instance_sha256?: string;
  readonly policy_sha256?: string;
  readonly ledger_sha256?: string;
}

/** A lock that matches `record` exactly, with the named parts replaced. */
function lockFor(over: LockOverrides = {}): string {
  const entries = (m: Record<string, string>): { path: string; sha256: string }[] =>
    Object.entries(m).map(([path, sha256]) => ({ path, sha256 }));
  return JSON.stringify({
    format: 1,
    build_id: "sha256:abc",
    as_of: "2026-08-25T12:00:00Z",
    ksor_version: "0.1.0",
    instance_sha256: over.instance_sha256 ?? sha256OfDocument(INSTANCE),
    policy_sha256: over.policy_sha256 ?? sha256OfDocument(POLICY),
    ledger_sha256: over.ledger_sha256 ?? sha256OfDocument(LEDGER),
    documents: entries(
      over.documents ?? {
        "a.md": sha256OfDocument(DOC),
        "pol/b.md": sha256OfDocument(DOC + "more\n"),
      },
    ).map((d) => ({ ...d, status: "stable" })),
    companions: entries(over.companions ?? { "a.summary.md": sha256OfDocument(SUMMARY) }),
    indexes: entries({ "index.md": sha256OfDocument("# Index\n") }),
    assets: entries(over.assets ?? { "pol/diagram.png": sha256OfBytes(ASSET) }),
  });
}

/** The writer hashes an asset's BYTES, not its text. */
function sha256OfBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("conceptHashes — the set the lock must name exactly", () => {
  it("hashes concepts only: no index, no companion, no reserved name", () => {
    expect([...conceptHashes(record).keys()].sort()).toEqual(["a.md", "pol/b.md"]);
    expect(conceptHashes(record).get("a.md")).toBe(sha256OfDocument(DOC));
  });
});

describe("checkLock", () => {
  it("ksor-lock-missing when there is no lock at all", () => {
    const r = checkLock(null, record);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.slug).toBe("ksor-lock-missing");
  });

  it("accepts a lock whose hashes match the tree, and hands back build_id and as_of", () => {
    const r = checkLock(lockFor(), record);
    expect(r.ok, r.ok ? "" : r.refusal.why).toBe(true);
    if (r.ok) {
      expect(r.lock.buildId).toBe("sha256:abc");
      expect(r.lock.asOf).toBe("2026-08-25T12:00:00Z");
    }
  });

  it("ksor-lock-stale when a document was edited, added or removed since the lock", () => {
    const edited = checkLock(
      lockFor({
        documents: { "a.md": "0".repeat(64), "pol/b.md": sha256OfDocument(DOC + "more\n") },
      }),
      record,
    );
    expect(edited.ok).toBe(false);
    if (!edited.ok) {
      expect(edited.refusal.slug).toBe("ksor-lock-stale");
      expect(edited.refusal.why).toContain("a.md (edited since the lock)");
    }
    const added = checkLock(lockFor({ documents: { "a.md": sha256OfDocument(DOC) } }), record);
    if (!added.ok) expect(added.refusal.why).toContain("pol/b.md (not in the lock)");
    const removed = checkLock(
      lockFor({
        documents: {
          "a.md": sha256OfDocument(DOC),
          "pol/b.md": sha256OfDocument(DOC + "more\n"),
          "gone.md": "0".repeat(64),
        },
      }),
      record,
    );
    if (!removed.ok)
      expect(removed.refusal.why).toContain("gone.md (in the lock, not in the tree)");
  });

  /**
   * The hole this covers, found in review (2026-08-25): the reader checked
   * `documents[]` and NOTHING else, while `ksor build` records the whole
   * record — instance, policy, ledger, companions, assets. So `ksor ingest`
   * accepted a tree whose GOVERNANCE had been edited since the build that
   * checked it. The site's lock was fixed for exactly this once already
   * ("deleting a denial's four lines from the ledger republished the document,
   * exit 0"); the ingest side had the same hole, and the surfaces would have
   * disagreed about what was published (decision 19).
   */
  it("ksor-lock-stale when the LEDGER changed since the build — the denial-deletion hole", () => {
    const r = checkLock(lockFor({ ledger_sha256: "0".repeat(64) }), record);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.refusal.slug).toBe("ksor-lock-stale");
      expect(r.refusal.why).toContain(".ksor/takedowns.yaml");
    }
  });

  it("ksor-lock-stale when the POLICY or instance.md changed since the build", () => {
    const policy = checkLock(lockFor({ policy_sha256: "0".repeat(64) }), record);
    expect(policy.ok).toBe(false);
    if (!policy.ok) expect(policy.refusal.why).toContain(".ksor/governance.yaml");
    const instance = checkLock(lockFor({ instance_sha256: "0".repeat(64) }), record);
    expect(instance.ok).toBe(false);
    if (!instance.ok) expect(instance.refusal.why).toContain("instance.md");
  });

  it("ksor-lock-stale when a COMPANION or an ASSET changed since the build", () => {
    const companion = checkLock(
      lockFor({ companions: { "a.summary.md": "0".repeat(64) } }),
      record,
    );
    expect(companion.ok).toBe(false);
    if (!companion.ok)
      expect(companion.refusal.why).toContain("a.summary.md (edited since the lock)");
    const asset = checkLock(lockFor({ assets: { "pol/diagram.png": "0".repeat(64) } }), record);
    expect(asset.ok).toBe(false);
    if (!asset.ok) expect(asset.refusal.why).toContain("pol/diagram.png (edited since the lock)");
    const gone = checkLock(lockFor({ assets: {} }), record);
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.refusal.why).toContain("pol/diagram.png (not in the lock)");
  });

  /**
   * An absent file hashes as the EMPTY STRING on both sides (`composeLock`
   * passes `?? ""` / `?? null`), so a record with no policy and no ledger is
   * not a permanent refusal — it is a record that declares neither.
   */
  it("accepts a record that has no policy and no ledger at all", () => {
    const bare: RecordFiles = {
      files: new Map([
        ["instance.md", INSTANCE],
        ["knowledge/a.md", DOC],
      ]),
      dirs: [],
    };
    const lock = JSON.stringify({
      format: 1,
      build_id: "sha256:abc",
      as_of: "2026-08-25T12:00:00Z",
      instance_sha256: sha256OfDocument(INSTANCE),
      policy_sha256: sha256OfDocument(""),
      ledger_sha256: sha256OfDocument(""),
      documents: [{ path: "a.md", sha256: sha256OfDocument(DOC) }],
      companions: [],
      assets: [],
      indexes: [],
    });
    const r = checkLock(lock, bare);
    expect(r.ok, r.ok ? "" : r.refusal.why).toBe(true);
  });

  it("ksor-lock-stale for a lock this reader cannot read (bad JSON, wrong format, missing digests)", () => {
    const bad = checkLock("{not json", record);
    if (!bad.ok) expect(bad.refusal.slug).toBe("ksor-lock-stale");
    const wrong = checkLock(
      JSON.stringify({ format: 2, build_id: "x", as_of: "y", documents: [] }),
      record,
    );
    if (!wrong.ok) expect(wrong.refusal.why).toMatch(/`format`/);
    // A lock from a build that predates the governance digests cannot be
    // checked against the governance it published, so it is stale by
    // definition rather than trusted for the half it does carry.
    const old = JSON.stringify({
      format: 1,
      build_id: "sha256:abc",
      as_of: "2026-08-25T12:00:00Z",
      documents: [],
    });
    const stale = checkLock(old, record);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.refusal.slug).toBe("ksor-lock-stale");
  });

  it("formatRefusals puts the slug first on the first line", () => {
    const r = checkLock(null, record);
    if (r.ok) return;
    const text = formatRefusals([r.refusal]);
    expect(text.split("\n")[0]).toMatch(/^ksor-lock-missing: build\.lock\.json/);
    expect(text).toMatch(/\n  why: .*\n  fix: /);
  });
});

/**
 * The reader against the WRITER, rather than against a lock this file typed.
 *
 * `checkLock` and `composeLock` are two halves of one contract and they live in
 * different modules, so the failure mode is silent disagreement: a field the
 * writer renames, a path the writer keys differently, a digest taken over bytes
 * on one side and text on the other. Every hand-written fixture above would
 * stay green through all of it, because they were written from the reader's
 * point of view. This drives the real emitter — with the arguments `ksor build`
 * passes it (packages/ksor/src/build/index.ts) — and then asks the reader
 * whether the tree it describes is the tree it came from.
 *
 * It is also the only place companions and assets meet the writer, and those
 * were the two lists the reader gained (review 2026-08-25).
 */
describe("checkLock accepts what composeLock writes", () => {
  const CONCEPT = "---\ntype: Document\n---\nThe policy body.\n";
  const COMPANION = "---\ntype: Summary\n---\nShort.\n";
  const IMAGE = new Uint8Array([137, 80, 78, 71]);
  const INDEX_MD = "# The record\n\n- [X](pol/x.md)\n";
  const built: RecordFiles = {
    files: new Map([
      ["instance.md", INSTANCE],
      [".ksor/governance.yaml", POLICY],
      [".ksor/takedowns.yaml", LEDGER],
      ["knowledge/index.md", INDEX_MD],
      ["knowledge/pol/x.md", CONCEPT],
      ["knowledge/pol/x.summary.md", COMPANION],
    ]),
    dirs: ["knowledge/pol"],
    assets: new Map([["knowledge/pol/chart.png", IMAGE]]),
  };

  const write = (): string =>
    JSON.stringify(
      composeLock({
        ksorVersion: "0.1.0",
        sourceCommit: "abc",
        dirty: false,
        asOf: Date.parse("2026-08-25T12:00:00Z"),
        drafts: "hidden",
        instanceText: built.files.get("instance.md") ?? "",
        policyText: built.files.get(".ksor/governance.yaml") ?? "",
        ledgerText: built.files.get(".ksor/takedowns.yaml") ?? null,
        ledgerEntries: [],
        audiences: [],
        concepts: [
          {
            id: "pol/x",
            status: "stable",
            effectiveFrom: null,
            staleAfter: null,
            audience: ["public"],
            text: CONCEPT,
          },
        ],
        companions: [{ path: "pol/x.summary.md", text: COMPANION }],
        assets: [{ path: "pol/chart.png", bytes: IMAGE }],
        indexes: [{ path: "index.md", text: INDEX_MD }],
        denials: [],
      }),
    );

  it("accepts the writer's lock for the tree it was written from", () => {
    const r = checkLock(write(), built);
    expect(r.ok, r.ok ? "" : r.refusal.why).toBe(true);
  });

  it("and refuses it the moment ANY of those inputs changes under it", () => {
    const lock = write();
    const edited = (path: string, text: string): RecordFiles => ({
      ...built,
      files: new Map([...built.files, [path, text]]),
    });
    for (const [what, record] of [
      ["the concept", edited("knowledge/pol/x.md", CONCEPT + "edit\n")],
      ["the companion", edited("knowledge/pol/x.summary.md", COMPANION + "edit\n")],
      ["the policy", edited(".ksor/governance.yaml", POLICY + "extra: 1\n")],
      ["the ledger", edited(".ksor/takedowns.yaml", "")],
      ["a generated index", edited("knowledge/index.md", INDEX_MD + "edit\n")],
      ["instance.md", edited("instance.md", INSTANCE + "\n")],
      [
        "an asset",
        { ...built, assets: new Map([["knowledge/pol/chart.png", new Uint8Array([1])]]) },
      ],
    ] as const) {
      const r = checkLock(lock, record);
      expect(r.ok, `editing ${what} left the lock acceptable`).toBe(false);
      if (!r.ok) expect(r.refusal.slug).toBe("ksor-lock-stale");
    }
  });
});
