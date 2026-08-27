import { describe, expect, it } from "vitest";

import { ATTACHMENT_SUFFIXES } from "../lib/attachment-rule.js";
import { checkRecord, type CheckOptions, type RecordFiles } from "./check.js";
import { ledgerDigests, parseLedger } from "./ledger.js";

const POLICY = `version: "0.1"
audiences:
  internal:
    description: Staff
approval_authorities:
  - actors: [human:cfo]
takedown_authorities:
  actors: [human:ciso]
`;

const INSTANCE = `---
format: 2
name: acme
title: Acme
description: The Acme record.
---

Instructions.
`;

function doc(title: string, extra: string, body = "Body.\n"): string {
  return `---\ntype: Document\ntitle: ${title}\ndescription: One sentence.\nstatus: stable\ngenerated: { by: "x/1", at: 2026-08-20T09:00:00Z }\n${extra}---\n\n${body}`;
}
const PUBLIC = `ksor:\n  audience: [public]\n  approval: { by: "human:cfo", at: 2026-08-21T09:00:00Z }\n`;
const INTERNAL = `ksor:\n  audience: [internal]\n  approval: { by: "human:cfo", at: 2026-08-21T09:00:00Z }\n`;

function record(files: Record<string, string>, dirs: string[] = []): RecordFiles {
  return {
    files: new Map(
      Object.entries({ "instance.md": INSTANCE, ".ksor/governance.yaml": POLICY, ...files }),
    ),
    dirs,
  };
}

function slugs(
  files: Record<string, string>,
  dirs: string[] = [],
  mode: "check" | "build" = "build",
): string[] {
  return checkRecord(record(files, dirs), { mode, ledgerBaselines: [] }).refusals.map(
    (r) => `${r.slug} ${r.path}`,
  );
}

describe("checkRecord — one rule set (record spec §6)", () => {
  it("a level-0 record with one public concept passes and yields its indexes", () => {
    const out = checkRecord(record({ "knowledge/a.md": doc("A", PUBLIC) }), {
      mode: "build",
      ledgerBaselines: [],
    });
    expect(out.refusals).toEqual([]);
    expect(out.indexes.get("knowledge/index.md")).toContain(
      "# Acme\n\n* [A](a.md) - One sentence.\n",
    );
    expect(out.concepts.map((c) => c.id)).toEqual(["a"]);
  });

  it("ksor-policy-missing when .ksor/governance.yaml is absent", () => {
    const files: RecordFiles = { files: new Map([["instance.md", INSTANCE]]), dirs: [] };
    expect(
      checkRecord(files, { mode: "build", ledgerBaselines: [] }).refusals.map((r) => r.slug),
    ).toContain("ksor-policy-missing");
  });

  it("refusals from a concept carry its path; ksor-audience-unregistered names the registry", () => {
    const r = checkRecord(
      record({ "knowledge/a.md": doc("A", PUBLIC.replace("[public]", "[board]")) }),
      { mode: "build", ledgerBaselines: [] },
    );
    expect(r.refusals.map((x) => [x.slug, x.path])).toEqual([
      ["ksor-audience-unregistered", "knowledge/a.md"],
    ]);
    expect(r.refusals[0]?.fix).toMatch(/internal/);
  });

  it("ksor-approver-unauthorised: the approver must be in the resolved approval set", () => {
    expect(
      slugs({ "knowledge/a.md": doc("A", PUBLIC.replace("human:cfo", "human:intern")) }),
    ).toEqual(["ksor-approver-unauthorised knowledge/a.md"]);
  });

  /**
   * Withdrawing a document is a governance act, so the authority to perform it
   * comes from the POLICY. `ksor.owner` is a string the document writes about
   * itself — free text the profile does not even form-check — so accepting it
   * as the owner let any concept attest its own withdrawal: `ksor.owner:
   * human:mallory` plus `ksor.deprecated.by: human:mallory` passed in a record
   * whose policy names no `ownership` rule at all.
   *
   * That was asymmetric with approval and nothing recorded the asymmetry —
   * `resolveApprovers` REFUSES when no rule matches, so an approval can never
   * be self-attested — and it is decision 21's rule ("a column that records WHO
   * must never be populated from ambient state") with the document supplying
   * the ambient state.
   */
  it("ksor-deprecator-unauthorised: the owner is the POLICY's, never the document's", () => {
    const dep = (by: string, owner = "human:kim"): string =>
      `ksor:\n  audience: [public]\n  owner: ${owner}\n  approval: { by: "human:cfo", at: 2026-08-21T09:00:00Z }\n  deprecated: { by: "${by}", at: 2026-08-22T09:00:00Z }\n`;
    const base = (by: string, owner?: string): string =>
      doc("A", dep(by, owner)).replace("status: stable", "status: deprecated");

    // No `ownership:` rule in POLICY, so the record resolves no owner for this
    // concept — and a self-declared one is not a substitute.
    expect(slugs({ "knowledge/a.md": base("human:kim") })).toEqual([
      "ksor-deprecator-unauthorised knowledge/a.md",
    ]);
    expect(slugs({ "knowledge/a.md": base("human:mallory", "human:mallory") })).toEqual([
      "ksor-deprecator-unauthorised knowledge/a.md",
    ]);
    // A takedown authority always may; a third party never may.
    expect(slugs({ "knowledge/a.md": base("human:ciso") })).toEqual([]);
    expect(slugs({ "knowledge/a.md": base("human:cfo") })).toEqual([
      "ksor-deprecator-unauthorised knowledge/a.md",
    ]);
    // And with an ownership rule, the owner it resolves may — whatever the
    // document says about itself.
    const owned = POLICY.replace(
      "approval_authorities:",
      "ownership:\n  - owner: human:kim\napproval_authorities:",
    );
    const withPolicy = (files: Record<string, string>): string[] =>
      checkRecord(
        {
          files: new Map(
            Object.entries({ "instance.md": INSTANCE, ".ksor/governance.yaml": owned, ...files }),
          ),
          dirs: [],
        },
        { mode: "build", ledgerBaselines: [] },
      ).refusals.map((r) => `${r.slug} ${r.path}`);
    expect(withPolicy({ "knowledge/a.md": base("human:kim", "human:mallory") })).toEqual([]);
    expect(withPolicy({ "knowledge/a.md": base("human:mallory", "human:mallory") })).toEqual([
      "ksor-deprecator-unauthorised knowledge/a.md",
    ]);
  });

  it("ksor-reserved-name: an authored log.md or README.md anywhere under knowledge/", () => {
    expect(
      slugs(
        {
          "knowledge/a.md": doc("A", PUBLIC),
          "knowledge/log.md": "x",
          "knowledge/s/README.md": "y",
        },
        ["knowledge/s"],
      ),
    ).toEqual(["ksor-reserved-name knowledge/log.md", "ksor-reserved-name knowledge/s/README.md"]);
  });

  it("ksor-index-stale in check mode only; build regenerates and never refuses a stale index", () => {
    const files = { "knowledge/a.md": doc("A", PUBLIC), "knowledge/index.md": "# Old\n" };
    expect(slugs(files, [], "check")).toEqual(["ksor-index-stale knowledge/index.md"]);
    expect(slugs(files, [], "build")).toEqual([]);
    const fresh =
      checkRecord(record(files), { mode: "build", ledgerBaselines: [] }).indexes.get(
        "knowledge/index.md",
      ) ?? "";
    expect(slugs({ ...files, "knowledge/index.md": fresh }, [], "check")).toEqual([]);
  });

  it("a missing index is stale in check mode too — a directory earns one", () => {
    expect(slugs({ "knowledge/a.md": doc("A", PUBLIC) }, [], "check")).toEqual([
      "ksor-index-stale knowledge/index.md",
    ]);
  });

  it("an authored index (frontmatter beyond okf_version, or prose) is stale, never a concept", () => {
    const files = { "knowledge/a.md": doc("A", PUBLIC), "knowledge/index.md": doc("Idx", PUBLIC) };
    expect(slugs(files, [], "build")).toEqual([]);
    expect(slugs(files, [], "check")).toEqual(["ksor-index-stale knowledge/index.md"]);
  });

  it("companions: exactly `type: Summary`, and a parent that exists", () => {
    const ok = {
      "knowledge/a.md": doc("A", PUBLIC),
      "knowledge/a.summary.md": "---\ntype: Summary\n---\nShort.\n",
    };
    expect(slugs(ok)).toEqual([]);
    expect(
      slugs({ ...ok, "knowledge/a.summary.md": "---\ntype: Summary\nvisibility: public\n---\n" }),
    ).toEqual(["ksor-attachment-frontmatter knowledge/a.summary.md"]);
    expect(slugs({ ...ok, "knowledge/a.summary.md": "No frontmatter.\n" })).toEqual([
      "ksor-attachment-frontmatter knowledge/a.summary.md",
    ]);
    expect(
      slugs({
        ...ok,
        "knowledge/b.summary.md": "---\ntype: Summary\n---\n",
        "knowledge/b.quiz.yaml": "q: 1\n",
      }),
    ).toEqual([
      "ksor-attachment-orphan knowledge/b.quiz.yaml",
      "ksor-attachment-orphan knowledge/b.summary.md",
    ]);
  });

  /**
   * "What is a companion" is ONE rule (`lib/attachment-rule.ts`, canonical, with
   * four readers). `check.ts` kept a hand-written regex of its own and it had
   * already drifted — `.summary.mdx` was in the canonical list and not in the
   * copy — so the checker did not see an `.mdx` summary as an attachment at
   * all: no orphan check, no `type: Summary` check, its parent's governance not
   * inherited. That was masked by `hygiene.ts` refusing every `.mdx` under a
   * different slug, in a different module, which is the arrangement decision 18
   * exists to end. Derived from `ATTACHMENT_SUFFIXES` rather than from
   * `ATTACHMENT_CASES`, which carries no `.summary.mdx` row and so could not
   * have caught this.
   */
  it.each(ATTACHMENT_SUFFIXES)(
    "a $suffix file is a companion of its document, not a concept",
    ({ suffix }) => {
      const name = `returns${suffix}`;
      // No `returns.md` in the tree, so recognition is OBSERVABLE: recognised
      // means `ksor-attachment-orphan` naming the parent it wants.
      const body = /\.mdx?$/.test(suffix) ? "---\ntype: Summary\n---\n" : "x: 1\n";
      const out = checkRecord(
        record({ "knowledge/a.md": doc("A", PUBLIC), [`knowledge/${name}`]: body }),
        { mode: "build", ledgerBaselines: [] },
      );
      const orphan = out.refusals.find((r) => r.slug === "ksor-attachment-orphan");
      expect(orphan?.path, `knowledge/${name} was not recognised as an attachment`).toBe(
        `knowledge/${name}`,
      );
      expect(`${orphan?.why}`).toContain("returns.md");
      // And it is never ALSO read as a concept of its own.
      expect(out.concepts.map((c) => c.id)).toEqual(["a"]);
    },
  );

  /**
   * `index.md` is GENERATED (record spec §1): no route, no node, no llms.txt
   * line, no governance of its own. So it cannot carry a summary, and decision
   * 27 retires the `index.summary.md` row from the canonical table with it.
   *
   * Nothing refused it. `check.ts` skips `index.md` as a concept, so the
   * companion pass read `finance/index.summary.md` as a summary of
   * `finance/index` — and the orphan check passed, because the GENERATED
   * `index.md` is committed and therefore present in the tree. Link-widening
   * was skipped too (`concepts.get(parentId)` is undefined). Staging only
   * gathers companions of admitted CONCEPTS and `index.md` is not one, so the
   * file was never staged, never rendered, and ingest made no node: `pnpm
   * check` called the record well-formed and the summary appeared nowhere,
   * ever, silently — while still landing in `build.lock.json`'s `companions[]`
   * and inside `build_id`, stamped as published content that is not published.
   */
  it("index.summary.md is refused by name — a generated index carries no summary", () => {
    const SUMMARY = "---\ntype: Summary\n---\n\nShort.\n";
    const base = { "knowledge/a.md": doc("A", PUBLIC), "knowledge/finance/b.md": doc("B", PUBLIC) };
    const dirs = ["knowledge/finance"];
    // The generated indexes are COMMITTED, which is what a real checkout holds
    // and what made this state pass: `checkRecord` skips `index.md` as a
    // concept, so the orphan check asks only whether the FILE is in the tree —
    // and it is. Building the record first and committing what it generates is
    // the only way this test meets the state an author would actually create.
    const indexes = checkRecord(record(base, dirs), { mode: "build", ledgerBaselines: [] }).indexes;
    const withIndexes = { ...base, ...Object.fromEntries(indexes) };
    expect(
      slugs(withIndexes, dirs, "check"),
      "the committed indexes must be fresh, or this test is measuring staleness",
    ).toEqual([]);

    const out = checkRecord(
      record({ ...withIndexes, "knowledge/finance/index.summary.md": SUMMARY }, dirs),
      { mode: "build", ledgerBaselines: [] },
    );
    expect(out.refusals.map((r) => `${r.slug} ${r.path}`)).toEqual([
      "ksor-attachment-of-index knowledge/finance/index.summary.md",
    ]);
    // The remedy has to be actionable: attach it to a document, not to the map.
    expect(out.refusals[0]?.fix).toMatch(/overview/);
    // Never mistaken for an ORPHAN — the parent file is right there, which is
    // exactly why the orphan rule could not catch this.
    expect(out.refusals.map((r) => r.slug)).not.toContain("ksor-attachment-orphan");
    // At the bundle root too, where the id has no directory in front of it.
    expect(
      checkRecord(record({ ...withIndexes, "knowledge/index.summary.md": SUMMARY }, dirs), {
        mode: "build",
        ledgerBaselines: [],
      }).refusals.map((r) => r.slug),
    ).toEqual(["ksor-attachment-of-index"]);
  });

  it("a dotfile with no stem is no companion — it falls through to the honest refusal", () => {
    // `attachmentKindOf(".summary.md")` is null by the canonical rule (it has no
    // parent to attach to), where the regex matched it and invented a parent
    // called `..md`. It is a dot-prefixed document instead, which hygiene names.
    const out = checkRecord(
      record({
        "knowledge/a.md": doc("A", PUBLIC),
        "knowledge/.summary.md": "---\ntype: Summary\n---\n",
      }),
      { mode: "build", ledgerBaselines: [] },
    );
    expect(out.refusals.map((r) => r.slug)).not.toContain("ksor-attachment-orphan");
    expect(out.refusals.map((r) => `${r.slug} ${r.path}`)).toContain(
      "ksor-name-unportable knowledge/.summary.md",
    );
  });

  it("ksor-footnote-unkeyed reaches the checker through the concept's declared sources", () => {
    const body = "Claim. [^x]\n\n[^x]: def\n";
    const withSource = doc("A", `sources:\n  - { id: x, resource: "https://x" }\n${PUBLIC}`, body);
    expect(slugs({ "knowledge/a.md": withSource })).toEqual([]);
    expect(slugs({ "knowledge/a.md": doc("A", PUBLIC, body) })).toEqual([
      "ksor-footnote-unkeyed knowledge/a.md",
    ]);
  });

  it("ksor-link-widens: [public] → [internal] refuses, [internal] → [public] passes, both link forms", () => {
    const pub = doc("A", PUBLIC, "See [b](b.md) and [c](/dir/c).\n");
    const files = {
      "knowledge/a.md": pub,
      "knowledge/b.md": doc("B", INTERNAL),
      "knowledge/dir/c.md": doc("C", PUBLIC),
    };
    expect(slugs(files, ["knowledge/dir"])).toEqual(["ksor-link-widens knowledge/a.md"]);
    const internal = doc("B", INTERNAL, "See [a](a.md).\n");
    expect(slugs({ "knowledge/a.md": doc("A", PUBLIC), "knowledge/b.md": internal })).toEqual([]);
  });

  it("a companion body is evaluated with its parent's audience", () => {
    const files = {
      "knowledge/a.md": doc("A", PUBLIC),
      "knowledge/a.summary.md": "---\ntype: Summary\n---\nSee [b](b.md).\n",
      "knowledge/b.md": doc("B", INTERNAL),
    };
    expect(slugs(files)).toEqual(["ksor-link-widens knowledge/a.summary.md"]);
  });

  it("an index is never a link source; a link to a missing concept is dead, never a widening", () => {
    const files = {
      "knowledge/a.md": doc("A", PUBLIC, "[gone](gone.md) [idx](index.md)\n"),
      "knowledge/index.md": "[b](b.md)",
    };
    expect(slugs(files, [], "build")).toEqual(["ksor-link-dead knowledge/a.md"]);
  });

  it("ksor-supersession-strands: the successor must exist, be stable, and pass the widening rule", () => {
    const dep = (to: string): string =>
      doc(
        "A",
        `ksor:\n  audience: [public]\n  approval: { by: "human:cfo", at: 2026-08-21T09:00:00Z }\n  deprecated: { by: "human:ciso", at: 2026-08-22T09:00:00Z }\n  superseded_by: ${to}\n`,
      ).replace("status: stable", "status: deprecated");
    expect(slugs({ "knowledge/a.md": dep("b"), "knowledge/b.md": doc("B", PUBLIC) })).toEqual([]);
    expect(slugs({ "knowledge/a.md": dep("missing") })).toEqual([
      "ksor-supersession-strands knowledge/a.md",
    ]);
    expect(
      slugs({
        "knowledge/a.md": dep("b"),
        "knowledge/b.md": doc("B", PUBLIC).replace("status: stable", "status: draft"),
      }),
    ).toEqual(["ksor-supersession-strands knowledge/a.md"]);
    expect(slugs({ "knowledge/a.md": dep("b"), "knowledge/b.md": doc("B", INTERNAL) })).toEqual([
      "ksor-supersession-strands knowledge/a.md",
    ]);
  });

  it("ksor-supersession-strands: a pointer on a concept that is not deprecated is refused", () => {
    // The old hand-written checker refused `superseded_by` on a document whose
    // status did not carry it; the profile keeps that (§2.2 — the key goes
    // "with deprecated"), because on a live concept the pointer announces a
    // replacement no surface will ever show and no reader will ever follow.
    const withPointer = (status: string): string =>
      doc("A", `${PUBLIC.trimEnd()}\n  superseded_by: b\n`).replace(
        "status: stable",
        `status: ${status}`,
      );
    for (const status of ["stable", "draft"]) {
      expect(
        slugs({ "knowledge/a.md": withPointer(status), "knowledge/b.md": doc("B", PUBLIC) }),
      ).toEqual(["ksor-supersession-strands knowledge/a.md"]);
    }
  });

  /**
   * A departed takedown authority must not hold the record hostage — the whole
   * point of `checkLedgerActors`'s `accepted` baseline (`ledger.ts`: "history
   * is not re-litigated, and that is the whole of the rule").
   *
   * It was DEAD. `checkRecord` called `checkLedgerActors(ledger,
   * policy.takedownActors)` with two arguments, so `baselines` took its `= []`
   * default and the accepted set was always empty — while `options
   * .ledgerBaselines` sat right there and was forwarded to
   * `checkLedgerAppendOnly` on the very next line. `ledger.test.ts` passes
   * baselines directly and was green throughout, which is decision 18's shape
   * again: each side internally consistent, the seam between them untested.
   *
   * The refusal also stated the dead branch as fact — its `fix` promised "an
   * entry an earlier build accepted is history and is never judged again" when
   * nothing could accept anything. That is product principle 4 inverted, so it
   * is asserted here as TEXT and not only as behaviour.
   *
   * This is the `mode: "build"` seam `ksor build` itself calls, so a record
   * that gets past it is a record that builds.
   */
  it("a departed takedown authority's accepted entry BUILDS; nothing accepted still refuses", () => {
    const entry = `- id: 2026-08-25T10:00:00Z-aaaaaa\n  stable_id: knowledge/a\n  scope: node\n  expected: present\n  by: human:departed\n  at: 2026-08-25T10:00:00Z\n`;
    const files = { "knowledge/a.md": doc("A", PUBLIC), ".ksor/takedowns.yaml": entry };
    // The policy names only the CURRENT authority — the personnel change.
    const current = POLICY.replace("actors: [human:ciso]", "actors: [human:current]");
    const parsed = parseLedger(entry, ".ksor/takedowns.yaml");
    if (!parsed.ok) throw new Error("fixture ledger does not parse");
    const entries = ledgerDigests(parsed.ledger);

    const run = (ledgerBaselines: CheckOptions["ledgerBaselines"]): string[] =>
      checkRecord(
        {
          files: new Map(
            Object.entries({ "instance.md": INSTANCE, ".ksor/governance.yaml": current, ...files }),
          ),
          dirs: [],
        },
        { mode: "build", ledgerBaselines },
      ).refusals.map((r) => r.slug);

    // The lock says a build PASSED on this exact text: history, never re-judged.
    expect(run([{ source: "build.lock.json", entries, accepted: true }])).toEqual([]);
    // Git history proves only that a line was committed, which anyone with
    // write access can do — so it grants nothing, and neither does no baseline.
    expect(run([{ source: "git history", entries }])).toEqual(["ksor-takedown-unauthorised"]);
    expect(run([])).toEqual(["ksor-takedown-unauthorised"]);
    // `run(undefined)` used to live here, asserting that omitting the
    // baselines got the strict rule. `CheckOptions.ledgerBaselines` is
    // required now, so that state does not compile — which is the fix, not
    // a gap: ingest reached it by omission and refused a departed authority
    // the site had already published.
  });

  it("the ledger: an unauthorised actor, a dangling entry, and a shrink against a baseline", () => {
    const entry = (by: string, id: string): string =>
      `- id: 2026-08-25T10:00:00Z-${id}\n  stable_id: knowledge/a\n  scope: node\n  expected: present\n  by: ${by}\n  at: 2026-08-25T10:00:00Z\n`;
    const files = { "knowledge/a.md": doc("A", PUBLIC) };
    expect(slugs({ ...files, ".ksor/takedowns.yaml": entry("human:cfo", "aaaaaa") })).toEqual([
      "ksor-takedown-unauthorised .ksor/takedowns.yaml",
    ]);
    expect(
      slugs({
        ...files,
        ".ksor/takedowns.yaml": entry("human:ciso", "aaaaaa").replace("knowledge/a", "knowledge/z"),
      }),
    ).toEqual(["ksor-takedown-dangling .ksor/takedowns.yaml"]);
    const out = checkRecord(
      record({ ...files, ".ksor/takedowns.yaml": entry("human:ciso", "aaaaaa") }),
      {
        mode: "build",
        ledgerBaselines: [
          {
            source: "build.lock.json",
            entries: [
              { id: "2026-08-25T10:00:00Z-aaaaaa", digest: null },
              { id: "2026-08-25T10:00:00Z-bbbbbb", digest: null },
            ],
          },
        ],
      },
    );
    expect(out.refusals.map((r) => r.slug)).toEqual(["ksor-ledger-shrank"]);
    expect(out.ledgerEntries.map((e) => e.id)).toEqual(["2026-08-25T10:00:00Z-aaaaaa"]);
  });

  it("ksor-instance-format: the instance must say format: 2 and carry none of the moved keys", () => {
    const a = { "knowledge/a.md": doc("A", PUBLIC) };
    const one = INSTANCE.replace("format: 2", "format: 1");
    expect(
      checkRecord(record({ ...a, "instance.md": one }), {
        mode: "build",
        ledgerBaselines: [],
      }).refusals.map((r) => r.slug),
    ).toEqual(["ksor-instance-format"]);
    const moved = INSTANCE.replace("title: Acme", "title: Acme\naudiences: [public, internal]");
    expect(
      checkRecord(record({ ...a, "instance.md": moved }), {
        mode: "build",
        ledgerBaselines: [],
      }).refusals.map((r) => r.slug),
    ).toEqual(["ksor-instance-format"]);
  });

  /**
   * RECORDED, not overlooked (2026-08-25 review). `ksor.approval.by` is checked
   * against the policy's resolved approval set, and a concept may no longer
   * DECLARE `trust_tier` (`ksor-derived-key`) — but `verified[].by`, the input
   * that COMPUTES that tier and therefore the `human-reviewed` badge on every
   * page, twin and `llms-full.txt` block, is checked against no authority set
   * at all. The policy has no verification family, so there is nothing to check
   * it against: `verified` is a claim gated by pull-request review, and record
   * spec §2.3 says so rather than leaving the asymmetry silent. Adding a
   * `verification_authorities` family is an owner decision (it widens the
   * Governance Policy, a public surface) and is left to one; this row exists so
   * the state cannot change by accident in either direction.
   */
  it("a `verified` actor the policy never named is accepted, and does promote the tier", () => {
    const out = checkRecord(
      record({
        "knowledge/a.md": doc(
          "A",
          `verified: { by: "human:nobody-asked", at: 2026-08-22T09:00:00Z }\n${PUBLIC}`,
        ),
      }),
      { mode: "build", ledgerBaselines: [] },
    );
    expect(out.refusals).toEqual([]);
    expect(out.concepts[0]?.trustTier).toBe("human-reviewed");
  });

  it("refusals are sorted by path, then slug — two runs print one order", () => {
    const out = checkRecord(
      record({
        "knowledge/b.md": doc("B", PUBLIC.replace("human:cfo", "human:x")),
        "knowledge/a.md": "no frontmatter\n",
      }),
      { mode: "build", ledgerBaselines: [] },
    );
    expect(out.refusals.map((r) => r.path)).toEqual([
      "knowledge/a.md",
      "knowledge/a.md",
      "knowledge/a.md",
      "knowledge/a.md",
      "knowledge/a.md",
      "knowledge/b.md",
    ]);
  });
});

/**
 * Assets have no audience of their own, so they inherit one by POSITION — the
 * same way a companion inherits its parent's. A public concept linking
 * `/secret/org-chart.png` staged `secret/org-chart.png` into the PUBLIC build:
 * the image bytes and the directory name `secret/` both, which is the canary
 * the visibility sweep asserts against, reached through the one path it does
 * not model (`checkLinks` only refused links that resolve to CONCEPTS).
 */
describe("checkRecord — an asset is reached through the directory that holds it", () => {
  // A `.svg`, so the PNG chunk check has nothing to say about the bytes.
  const ASSET = new Uint8Array([0x3c, 0x73, 0x76, 0x67]);
  const files = {
    "knowledge/policy.md": doc("Policy", PUBLIC, "![chart](/secret/org-chart.svg)\n"),
    "knowledge/secret/plan.md": doc("Plan", INTERNAL),
  };
  const assets = {
    "knowledge/secret/org-chart.svg": ASSET,
    "knowledge/secret/img/chart.svg": ASSET,
  };

  const run = (over: Record<string, string> = {}): string[] =>
    checkRecord(
      {
        files: new Map(
          Object.entries({
            "instance.md": INSTANCE,
            ".ksor/governance.yaml": POLICY,
            ...files,
            ...over,
          }),
        ),
        dirs: ["knowledge/secret", "knowledge/secret/img"],
        assets: new Map(Object.entries(assets)),
      },
      { mode: "build", ledgerBaselines: [] },
    ).refusals.map((r) => `${r.slug} ${r.path}`);

  it("refuses a public link to an asset in a directory no public reader may enter", () => {
    expect(run()).toEqual(["ksor-link-widens knowledge/policy.md"]);
  });

  it("allows it once something in that directory is public", () => {
    expect(run({ "knowledge/secret/open.md": doc("Open", PUBLIC) })).toEqual([]);
  });

  // Found live on a real scaffold: nesting the asset ONE level deeper
  // (`secret/img/chart.svg`) emptied the immediate directory of concepts, so the
  // rule said nothing and `ksor build` exited 0 while a public stage carried
  // `secret/img/chart.svg` — the restricted directory's name and the bytes both.
  it("refuses it from a SUB-directory of the restricted directory", () => {
    expect(
      run({
        "knowledge/policy.md": doc("Policy", PUBLIC, "![chart](/secret/img/chart.svg)\n"),
      }),
    ).toEqual(["ksor-link-widens knowledge/policy.md"]);
  });

  it("says nothing about an asset in a directory that holds no concept at all", () => {
    expect(
      checkRecord(
        {
          files: new Map(
            Object.entries({
              "instance.md": INSTANCE,
              ".ksor/governance.yaml": POLICY,
              "knowledge/policy.md": doc("Policy", PUBLIC, "![chart](/images/chart.svg)\n"),
            }),
          ),
          dirs: ["knowledge/images"],
          assets: new Map([["knowledge/images/chart.svg", ASSET]]),
        },
        { mode: "build", ledgerBaselines: [] },
      ).refusals.map((r) => `${r.slug} ${r.path}`),
    ).toEqual([]);
  });
});

/**
 * `ksor-link-widens` used to be evaluated only for a link that resolved to a
 * CONCEPT, or — through `assetWidens` — to an ASSET. But `targets.exists`
 * admits three more kinds, and none of them was judged against any audience
 * rule: a companion (`<doc>.summary.md`), a directory, and a directory's
 * generated `index.md`. So a public document could publish a restricted
 * concept's id and a restricted directory's name into the public page, its
 * `/md/` twin and `llms-full.txt`, while the identical link spelled `.md` was
 * refused one branch away (found live on a real scaffold).
 */
describe("checkRecord — every link target is judged, not only a concept", () => {
  const files = {
    "knowledge/policy.md": doc("Policy", PUBLIC),
    "knowledge/secret/plan.md": doc("Plan", INTERNAL),
    "knowledge/secret/plan.summary.md": "---\ntype: Summary\n---\nShort.\n",
  };
  const run = (body: string, over: Record<string, string> = {}): string[] =>
    slugs(
      { ...files, "knowledge/policy.md": doc("Policy", PUBLIC, body), ...over },
      ["knowledge/secret"],
      "build",
    );

  it("refuses a public link to a restricted concept's COMPANION", () => {
    expect(run("See [s](/secret/plan.summary.md).\n")).toEqual([
      "ksor-link-widens knowledge/policy.md",
    ]);
  });

  it("refuses a public link to a restricted DIRECTORY", () => {
    expect(run("See [d](/secret/).\n")).toEqual(["ksor-link-widens knowledge/policy.md"]);
  });

  it("refuses a public link to a restricted directory's generated index", () => {
    expect(run("See [i](/secret/index.md).\n")).toEqual(["ksor-link-widens knowledge/policy.md"]);
  });

  it("the control: the same link spelled `.md` was already refused", () => {
    expect(run("See [p](/secret/plan.md).\n")).toEqual(["ksor-link-widens knowledge/policy.md"]);
  });

  it("allows the directory and its index once something in that directory is public", () => {
    const open = { "knowledge/secret/open.md": doc("Open", PUBLIC) };
    expect(run("See [d](/secret/) and [i](/secret/index.md).\n", open)).toEqual([]);
  });

  /**
   * A companion inherits its PARENT's audience, not the directory's — so a
   * public sibling in the same folder widens the folder and not the companion.
   */
  it("allows the companion only when its parent is reachable", () => {
    const open = { "knowledge/secret/open.md": doc("Open", PUBLIC) };
    expect(run("See [s](/secret/plan.summary.md).\n", open)).toEqual([
      "ksor-link-widens knowledge/policy.md",
    ]);
    expect(
      run("See [s](/secret/plan.summary.md).\n", {
        "knowledge/secret/plan.md": doc("Plan", PUBLIC),
      }),
    ).toEqual([]);
  });

  it("says nothing about a directory that holds no concept at all", () => {
    expect(
      slugs(
        { ...files, "knowledge/policy.md": doc("Policy", PUBLIC, "See [x](/images/).\n") },
        ["knowledge/secret", "knowledge/images"],
        "build",
      ),
    ).toEqual([]);
  });

  it("an internal document may still link the internal companion and directory", () => {
    expect(
      slugs(
        {
          ...files,
          "knowledge/other.md": doc(
            "Other",
            INTERNAL,
            "See [s](/secret/plan.summary.md) and [d](/secret/).\n",
          ),
        },
        ["knowledge/secret"],
        "build",
      ),
    ).toEqual([]);
  });
});

/**
 * One bad document used to produce a CASCADE of `ksor-index-stale` refusals.
 * A refused document is not a concept, so its directory generates a different
 * index (or none), and the staleness comparison — which runs over the concepts
 * that PARSED — reported every affected directory and every ancestor. Their
 * printed fix ("run `ksor build`, which regenerates every index, and commit the
 * result") cannot be applied: `ksor build` refuses on the real error and writes
 * nothing. Worse, when the refused document was the directory's only one, the
 * why-line said "an index exists for a directory that earns none" about an
 * index that is correct.
 */
describe("checkRecord — a refused document produces ONE problem, not a cascade", () => {
  const good = doc("Returns", PUBLIC);
  const typo = good.replace("ksor:", "ksor:\n  effective-from: 2026-01-01T00:00:00Z");
  const indexes = (files: Record<string, string>): ReadonlyMap<string, string> =>
    checkRecord(record(files, ["knowledge/policies"]), { mode: "build", ledgerBaselines: [] })
      .indexes;

  it("the green record checks clean, indexes and all", () => {
    const files = { "knowledge/policies/returns.md": good };
    const generated = indexes(files);
    expect(
      slugs(
        {
          ...files,
          "knowledge/index.md": generated.get("knowledge/index.md") ?? "",
          "knowledge/policies/index.md": generated.get("knowledge/policies/index.md") ?? "",
        },
        ["knowledge/policies"],
        "check",
      ),
    ).toEqual([]);
  });

  it("one frontmatter typo yields one refusal — and never an index instruction that cannot be run", () => {
    const generated = indexes({ "knowledge/policies/returns.md": good });
    const out = slugs(
      {
        "knowledge/policies/returns.md": typo,
        "knowledge/index.md": generated.get("knowledge/index.md") ?? "",
        "knowledge/policies/index.md": generated.get("knowledge/policies/index.md") ?? "",
      },
      ["knowledge/policies"],
      "check",
    );
    expect(out).toEqual(["ksor-ksor-key-unknown knowledge/policies/returns.md"]);
  });

  it("a genuinely stale index is still refused when every document parses", () => {
    expect(
      slugs(
        {
          "knowledge/policies/returns.md": good,
          "knowledge/index.md": "# Wrong\n",
          "knowledge/policies/index.md": "# Wrong\n",
        },
        ["knowledge/policies"],
        "check",
      ),
    ).toEqual([
      "ksor-index-stale knowledge/index.md",
      "ksor-index-stale knowledge/policies/index.md",
    ]);
  });

  /**
   * The same shape one seam further along, and this one FABRICATES A
   * GOVERNANCE FACT (2026-08-25 review). The ledger was judged against the
   * concepts that PARSED, so a frontmatter typo on a denied document reported
   * `ksor-takedown-dangling` — "this denial names a document that does not
   * exist" — about a file still sitting in the checkout. Its printed remedy is
   * the harmful part: acting on it appends a ledger entry asserting a removal
   * that never happened.
   */
  const denial = (id: string, expected: string): string =>
    `- id: 2026-08-25T10:00:00Z-aaaaaa\n  stable_id: knowledge/${id}\n  scope: node\n  expected: ${expected}\n  by: human:ciso\n  at: 2026-08-25T10:00:00Z\n`;

  it("a denial on a document that failed to parse is not dangling", () => {
    const dirs = ["knowledge/policies"];
    const live = { ".ksor/takedowns.yaml": denial("policies/returns", "present") };
    expect(slugs({ "knowledge/policies/returns.md": good, ...live }, dirs)).toEqual([]);
    // The control the fix must not weaken: a denial that names nothing still dangles.
    expect(
      slugs(
        {
          "knowledge/policies/returns.md": good,
          ".ksor/takedowns.yaml": denial("policies/gone", "present"),
        },
        dirs,
      ),
    ).toEqual(["ksor-takedown-dangling .ksor/takedowns.yaml"]);
    expect(slugs({ "knowledge/policies/returns.md": typo, ...live }, dirs)).toEqual([
      "ksor-ksor-key-unknown knowledge/policies/returns.md",
    ]);
  });

  // The other direction of the same question, which must stay REFUSING: a
  // ledger entry recording the path as removed is contradicted by a file at
  // that path whether or not the file parses.
  it("`expected: removed` still refuses a path that is back, unreadable or not", () => {
    expect(
      slugs(
        {
          "knowledge/policies/returns.md": typo,
          ".ksor/takedowns.yaml": denial("policies/returns", "removed"),
        },
        ["knowledge/policies"],
      ),
    ).toEqual([
      "ksor-takedown-readded .ksor/takedowns.yaml",
      "ksor-ksor-key-unknown knowledge/policies/returns.md",
    ]);
  });

  // `checkSupersession` asked the same question the same wrong way: the
  // successor "names no concept" when its document is right there and merely
  // unreadable, and the remedy — drop the pointer — throws away a correct one.
  it("a successor that failed to parse does not strand the concept pointing at it", () => {
    const dep = doc(
      "A",
      `ksor:\n  audience: [public]\n  approval: { by: "human:cfo", at: 2026-08-21T09:00:00Z }\n  deprecated: { by: "human:ciso", at: 2026-08-22T09:00:00Z }\n  superseded_by: policies/returns\n`,
    ).replace("status: stable", "status: deprecated");
    const dirs = ["knowledge/policies"];
    expect(slugs({ "knowledge/a.md": dep, "knowledge/policies/returns.md": good }, dirs)).toEqual(
      [],
    );
    // The control: a successor that genuinely is not there still strands.
    expect(slugs({ "knowledge/a.md": dep }, dirs)).toEqual([
      "ksor-supersession-strands knowledge/a.md",
    ]);
    expect(slugs({ "knowledge/a.md": dep, "knowledge/policies/returns.md": typo }, dirs)).toEqual([
      "ksor-ksor-key-unknown knowledge/policies/returns.md",
    ]);
  });

  /**
   * The instance is the other input the index generator reads — its title is
   * the root index's heading — so a typo in `instance.md` made the generated
   * root index differ from the committed one and printed `ksor-index-stale`
   * beside `ksor-instance-format`. Two errors, and the second's remedy is
   * `ksor build`, which refuses on the first and writes nothing.
   */
  it("an unreadable instance.md yields one refusal, not a stale index beside it", () => {
    const generated = indexes({ "knowledge/policies/returns.md": good });
    const committed = {
      "knowledge/policies/returns.md": good,
      "knowledge/index.md": generated.get("knowledge/index.md") ?? "",
      "knowledge/policies/index.md": generated.get("knowledge/policies/index.md") ?? "",
    };
    expect(
      slugs(
        { ...committed, "instance.md": INSTANCE.replace("format: 2", "format: 1") },
        ["knowledge/policies"],
        "check",
      ),
    ).toEqual(["ksor-instance-format instance.md"]);
    // The other way the instance is unreadable: it is not there at all.
    const missing: RecordFiles = {
      files: new Map(Object.entries({ ".ksor/governance.yaml": POLICY, ...committed })),
      dirs: ["knowledge/policies"],
    };
    expect(
      checkRecord(missing, { mode: "check", ledgerBaselines: [] }).refusals.map(
        (r) => `${r.slug} ${r.path}`,
      ),
    ).toEqual(["ksor-instance-format instance.md"]);
  });
});
