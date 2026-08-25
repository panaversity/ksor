/**
 * The record conformance fixture (record spec §7 item 1): one conformant
 * record holding every valid shape in §2, and one small record per refusal
 * the checker can raise — parsed and judged identically by the kernel rules
 * and the emitted `check.mjs` (`checker-drift.integration.test.ts`). Files
 * are record-relative; `dirs` names directories that hold no file.
 */
import { ledgerDigests, parseLedger } from "@panaversity/ksor-content/record";

export interface ConformanceRecord {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
  /** Record-relative binary files (assets), as bytes — the text map cannot carry them. */
  readonly bytes?: Readonly<Record<string, readonly number[]>>;
  readonly dirs?: readonly string[];
  /**
   * The project AROUND the record — `CLAUDE.md`, the two skill trees,
   * `system/site` — written after the defaults, so `null` deletes one. These
   * are the rules only `pnpm check` runs (record spec §6).
   */
  readonly project?: Readonly<Record<string, string | null>>;
  /** A committed `build.lock.json`, the one ledger baseline a dependency-free check can read. */
  readonly lock?: string;
  /** `<slug> <path>` pairs `checkRecord` must produce in `check` mode, sorted. */
  readonly expected: readonly string[];
}

/**
 * A parseable lock carrying the ledger baseline and nothing else that matters
 * (build spec §2). `ledgerFor` builds the `(id, digest)` pairs from a ledger's
 * TEXT, so a fixture can commit a lock that recorded a DIFFERENT text under the
 * same id — which is what `ksor-ledger-amended` catches.
 */
export function lockWith(
  ledgerEntries: readonly { readonly id: string; readonly digest: string }[],
): string {
  const zero = "0".repeat(64);
  return `${JSON.stringify(
    {
      format: 1,
      build_id: `sha256:${zero}`,
      ksor_version: "0.0.0",
      okf: { version: "0.2", commit: "ad30107c", spec_sha256: "26aa5da0" },
      source_commit: null,
      dirty: true,
      as_of: "2026-08-25T12:00:00.000Z",
      drafts: "hidden",
      instance_sha256: zero,
      policy_sha256: zero,
      ledger_sha256: zero,
      ledger_entries: ledgerEntries,
      audiences: { registry: [], viewers: {} },
      documents: [],
      companions: [],
      assets: [],
      indexes: [],
    },
    null,
    2,
  )}\n`;
}

/** The `(id, digest)` pairs a build would have recorded for this ledger text. */
export function ledgerFor(text: string): { id: string; digest: string }[] {
  const parsed = parseLedger(text, ".ksor/takedowns.yaml");
  if (!parsed.ok)
    throw new Error(`fixture ledger does not parse: ${JSON.stringify(parsed.refusals)}`);
  return ledgerDigests(parsed.ledger);
}

export const POLICY = `version: "0.1"
audiences:
  internal:
    description: Employees
ownership:
  - scope: { paths: [policies] }
    owner: team:finance
approval_authorities:
  - actors: [human:cfo, human:kim]
takedown_authorities:
  actors: [human:ciso]
`;

export const INSTANCE = `---
format: 2
name: acme
title: Acme
description: The Acme record.
toolchain:
  requires: ">=0.0.1"
  scaffolded: "0.0.1"
---

Answer only from this record.
`;

const approval = `  approval: { by: "human:cfo", at: 2026-08-21T09:00:00Z }`;

/** A stable `Document` — the level-0 shape. */
export function doc(
  title: string,
  opts: { audience?: string; body?: string; extra?: string } = {},
): string {
  return `---
type: Document
title: ${title}
description: ${title}, in one sentence.
status: stable
generated: { by: "ksor-starter/0.0.1", at: 2026-08-20T09:00:00Z }
${opts.extra ?? ""}ksor:
  audience: [${opts.audience ?? "public"}]
${approval}
---

${opts.body ?? "Body.\n"}`;
}

const VALID_FILES: Record<string, string> = {
  "instance.md": INSTANCE,
  ".ksor/governance.yaml": POLICY,
  ".ksor/takedowns.yaml": `- id: 2026-08-24T10:00:00Z-aaaaaa
  stable_id: knowledge/policies/retired
  scope: node
  expected: removed
  by: human:ciso
  at: 2026-08-24T10:00:00Z
  reason: superseded figure
- id: 2026-08-24T11:00:00Z-bbbbbb
  revokes: 2026-08-24T10:00:00Z-aaaaaa
  by: human:ciso
  at: 2026-08-24T11:00:00Z
`,
  // A draft: the floor, and nothing more.
  "knowledge/welcome.md": `---
type: Document
title: Welcome
description: Where to start.
status: draft
order: 1
ksor:
  audience: [public]
---

Start with [the policies](policies/). See also [the summary](welcome.summary.md).
`,
  "knowledge/welcome.summary.md": "---\ntype: Summary\n---\n\nStart here.\n",
  "knowledge/welcome.flashcards.yaml": "cards: []\n",
  // A reserved type with everything the profile asks of it: sources, owner,
  // verification, effectivity, a cited claim in both footnote forms.
  "knowledge/policies/purchase-approval.md": `---
type: Policy
title: Purchase approval
description: Who may approve a purchase, at which thresholds.
status: stable
order: 2
generated: { by: "claude-code/1.0", at: 2026-08-20T09:00:00Z }
sources:
  - { id: fin-2024, resource: "https://example.com/finance-handbook-2024.pdf", title: Finance handbook 2024 }
verified:
  - { by: "human:kim", at: 2026-08-21T14:00:00Z }
stale_after: 2027-08-21T00:00:00Z
ksor:
  audience: [public]
  owner: team:finance
${approval}
  effective_from: 2026-09-01T00:00:00Z
---

A purchase above 10,000 needs a director's signature. [^fin-2024]

[^fin-2024]: Finance handbook 2024, §3.
`,
  // Restricted, with a bare `verified` mapping (OKF §5.2) and a link DOWN to public.
  "knowledge/policies/board-pay.md": doc("Board pay", {
    audience: "internal",
    extra: 'verified: { by: "nightly-audit/2", at: 2026-08-22T01:00:00Z }\n',
    body: "See [purchase approval](/policies/purchase-approval.md).\n",
  }),
  // Deprecated with its successor.
  "knowledge/policies/old-threshold.md": `---
type: Document
title: Old threshold
description: The threshold before 2026.
status: deprecated
generated: { by: "claude-code/1.0", at: 2026-08-01T09:00:00Z }
ksor:
  audience: [public]
${approval}
  deprecated: { by: "human:ciso", at: 2026-08-22T10:00:00Z }
  superseded_by: policies/purchase-approval
---

Superseded.
`,
};

/** A conformant record; its indexes are generated by the module at test time. */
export const VALID: ConformanceRecord = {
  name: "conformant",
  files: VALID_FILES,
  dirs: ["knowledge/policies"],
  expected: [],
};

const base = (files: Record<string, string>): Record<string, string> => ({
  ...VALID_FILES,
  ...files,
});
const frontmatter = (fm: string, body = "Body.\n"): string => `---\n${fm}---\n\n${body}`;
const stable = `type: Document\ntitle: T\ndescription: D.\nstatus: stable\ngenerated: { by: "x/1", at: 2026-08-20T09:00:00Z }\nksor:\n  audience: [public]\n${approval}\n`;

/** A PNG whose signature and IHDR length are right and whose IHDR CRC is not. */
const CORRUPT_PNG: readonly number[] = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0xde, 0xad, 0xbe,
  0xef,
];

/** One record per refusal (record spec §5–§6). `expected` is asserted in `check` mode with the valid indexes committed. */
export const REFUSALS: readonly ConformanceRecord[] = [
  {
    name: "ksor-frontmatter-invalid",
    files: base({ "knowledge/bad.md": "---\ntitle: [unclosed\n---\n" }),
    expected: ["ksor-frontmatter-invalid knowledge/bad.md"],
  },
  {
    name: "ksor-missing-key + ksor-audience-missing",
    files: base({ "knowledge/bad.md": frontmatter("title: T\n") }),
    expected: [
      "ksor-audience-missing knowledge/bad.md",
      "ksor-missing-key knowledge/bad.md",
      "ksor-missing-key knowledge/bad.md",
      "ksor-missing-key knowledge/bad.md",
    ],
  },
  {
    // The blocking half of the same rule: a floor key that is THERE and
    // unusable. `title: 42` lost its quotes, and until the profile named it
    // the document was dropped from the record — no page, no MCP node, no lock
    // entry — with an EMPTY refusal list and exit 0.
    name: "ksor-missing-key (present but not text)",
    files: base({ "knowledge/bad.md": frontmatter(stable.replace("title: T", "title: 42")) }),
    expected: ["ksor-missing-key knowledge/bad.md"],
  },
  {
    name: "ksor-status-unknown",
    files: base({
      "knowledge/bad.md": frontmatter(stable.replace("status: stable", "status: approved")),
    }),
    expected: ["ksor-status-unknown knowledge/bad.md"],
  },
  {
    // A block scalar is how an author actually writes a long one, and it is the
    // shape that costs the concept its §8 bullet — and with it the index, the
    // sidebar and the reading order — while its page stays published.
    name: "ksor-one-line-form",
    files: base({
      "knowledge/bad.md": frontmatter(stable.replace("title: T", "title: |\n  T\n  and more")),
    }),
    expected: ["ksor-one-line-form knowledge/bad.md"],
  },
  {
    name: "ksor-audience-unregistered",
    files: base({ "knowledge/bad.md": frontmatter(stable.replace("[public]", "[board]")) }),
    expected: ["ksor-audience-unregistered knowledge/bad.md"],
  },
  {
    name: "ksor-stable-ungenerated + ksor-stable-unapproved",
    files: base({
      "knowledge/bad.md": frontmatter(
        stable.replace(/generated:.*\n/, "").replace(/  approval:.*\n/, ""),
      ),
    }),
    expected: [
      "ksor-stable-unapproved knowledge/bad.md",
      "ksor-stable-ungenerated knowledge/bad.md",
    ],
  },
  {
    name: "ksor-approver-unauthorised",
    files: base({ "knowledge/bad.md": frontmatter(stable.replace("human:cfo", "human:intern")) }),
    expected: ["ksor-approver-unauthorised knowledge/bad.md"],
  },
  {
    name: "ksor-generated-after-approval",
    files: base({
      "knowledge/bad.md": frontmatter(
        stable.replace("2026-08-20T09:00:00Z", "2026-08-22T09:00:00Z"),
      ),
    }),
    expected: ["ksor-generated-after-approval knowledge/bad.md"],
  },
  {
    name: "ksor-deprecated-unattributed",
    files: base({
      "knowledge/bad.md": frontmatter(stable.replace("status: stable", "status: deprecated")),
    }),
    expected: ["ksor-deprecated-unattributed knowledge/bad.md"],
  },
  {
    name: "ksor-deprecator-unauthorised",
    files: base({
      "knowledge/bad.md": frontmatter(
        `${stable.replace("status: stable", "status: deprecated")}  deprecated: { by: "human:kim", at: 2026-08-22T10:00:00Z }\n`,
      ),
    }),
    expected: ["ksor-deprecator-unauthorised knowledge/bad.md"],
  },
  {
    // Accepted in silence before decision 27's row retired: the orphan rule
    // asks whether the parent FILE is in the tree and the generated `index.md`
    // is committed, so it passed — and then no surface published it, because
    // staging gathers companions of admitted CONCEPTS and an index is not one.
    name: "ksor-attachment-of-index",
    files: base({ "knowledge/policies/index.summary.md": "---\ntype: Summary\n---\n\nShort.\n" }),
    expected: ["ksor-attachment-of-index knowledge/policies/index.summary.md"],
  },
  {
    // The state that used to PASS: the document names itself as its owner and
    // withdraws itself. `knowledge/bad.md` sits outside the POLICY's only
    // `ownership` scope (`policies`), so the record resolves no owner for it —
    // and `ksor.owner` is free text the document writes about itself, never a
    // substitute for one. A withdrawal a document attests for itself is not a
    // governance act.
    name: "ksor-deprecator-unauthorised (self-attested owner)",
    files: base({
      "knowledge/bad.md": frontmatter(
        `${stable.replace("status: stable", "status: deprecated")}  owner: human:mallory\n  deprecated: { by: "human:mallory", at: 2026-08-22T10:00:00Z }\n`,
      ),
    }),
    expected: ["ksor-deprecator-unauthorised knowledge/bad.md"],
  },
  {
    name: "ksor-reserved-type-unsourced + ksor-reserved-type-unowned",
    files: base({
      "knowledge/bad.md": frontmatter(stable.replace("type: Document", "type: Policy")),
    }),
    expected: [
      "ksor-reserved-type-unowned knowledge/bad.md",
      "ksor-reserved-type-unsourced knowledge/bad.md",
    ],
  },
  {
    name: "ksor-source-unresourced",
    files: base({
      "knowledge/bad.md": frontmatter(`${stable}sources:\n  - { id: x, title: X }\n`),
    }),
    expected: ["ksor-source-unresourced knowledge/bad.md"],
  },
  {
    name: "ksor-actor-form",
    files: base({
      "knowledge/bad.md": frontmatter(stable.replace('by: "x/1"', 'by: "team:finance"')),
    }),
    expected: ["ksor-actor-form knowledge/bad.md"],
  },
  {
    name: "ksor-instant-form",
    files: base({
      "knowledge/bad.md": frontmatter(stable.replace("2026-08-20T09:00:00Z", "2026-08-20")),
    }),
    expected: ["ksor-instant-form knowledge/bad.md"],
  },
  {
    name: "ksor-footnote-unkeyed",
    files: base({ "knowledge/bad.md": frontmatter(stable, "Claim. [^nope]\n") }),
    expected: ["ksor-footnote-unkeyed knowledge/bad.md"],
  },
  {
    name: "ksor-reserved-name",
    files: base({ "knowledge/log.md": "x", "knowledge/policies/README.md": "y" }),
    expected: [
      "ksor-reserved-name knowledge/log.md",
      "ksor-reserved-name knowledge/policies/README.md",
    ],
  },
  {
    name: "ksor-index-stale",
    files: base({ "knowledge/index.md": "# Old\n" }),
    expected: ["ksor-index-stale knowledge/index.md"],
  },
  {
    name: "ksor-attachment-frontmatter",
    files: base({
      "knowledge/welcome.summary.md": "---\ntype: Summary\nvisibility: public\n---\n",
    }),
    expected: ["ksor-attachment-frontmatter knowledge/welcome.summary.md"],
  },
  {
    name: "ksor-attachment-orphan",
    files: base({ "knowledge/gone.quiz.yaml": "q: 1\n" }),
    expected: ["ksor-attachment-orphan knowledge/gone.quiz.yaml"],
  },
  {
    name: "ksor-link-widens",
    files: base({ "knowledge/bad.md": frontmatter(stable, "[x](policies/board-pay.md)\n") }),
    expected: ["ksor-link-widens knowledge/bad.md"],
  },
  {
    // The asset one level DEEPER than the restricted directory: `secret/img/`
    // holds no concept of its own, so the rule has to ask its parent.
    name: "ksor-link-widens (a nested asset)",
    files: base({
      "knowledge/secret/plan.md": doc("Plan", { audience: "internal" }),
      "knowledge/bad.md": frontmatter(stable, "![chart](/secret/img/chart.svg)\n"),
    }),
    bytes: { "knowledge/secret/img/chart.svg": [0x3c, 0x73, 0x76, 0x67] },
    dirs: ["knowledge/policies", "knowledge/secret", "knowledge/secret/img"],
    expected: ["ksor-link-widens knowledge/bad.md"],
  },
  {
    name: "ksor-supersession-strands",
    files: base({
      // The successor a public reader cannot open.
      "knowledge/policies/old-threshold.md": VALID_FILES[
        "knowledge/policies/old-threshold.md"
      ]!.replace("policies/purchase-approval", "policies/board-pay"),
      // The pointer on a concept that is not deprecated at all.
      "knowledge/bad.md": frontmatter(
        stable.replace(
          `${approval}\n`,
          `${approval}\n  superseded_by: policies/purchase-approval\n`,
        ),
      ),
    }),
    expected: [
      "ksor-supersession-strands knowledge/bad.md",
      "ksor-supersession-strands knowledge/policies/old-threshold.md",
    ],
  },
  {
    name: "ksor-takedown-unauthorised",
    files: base({
      ".ksor/takedowns.yaml": VALID_FILES[".ksor/takedowns.yaml"]!.replace(
        "  by: human:ciso\n  at: 2026-08-24T11:00:00Z",
        "  by: human:kim\n  at: 2026-08-24T11:00:00Z",
      ),
    }),
    expected: ["ksor-takedown-unauthorised .ksor/takedowns.yaml"],
  },
  {
    name: "ksor-takedown-dangling",
    files: base({
      ".ksor/takedowns.yaml": `- id: 2026-08-24T10:00:00Z-cccccc\n  stable_id: knowledge/policies/renamed\n  scope: node\n  expected: present\n  by: human:ciso\n  at: 2026-08-24T10:00:00Z\n`,
    }),
    expected: ["ksor-takedown-dangling .ksor/takedowns.yaml"],
  },
  {
    name: "ksor-takedown-readded",
    files: base({
      ".ksor/takedowns.yaml": `- id: 2026-08-24T10:00:00Z-dddddd\n  stable_id: knowledge/welcome\n  scope: node\n  expected: removed\n  by: human:ciso\n  at: 2026-08-24T10:00:00Z\n`,
    }),
    expected: ["ksor-takedown-readded .ksor/takedowns.yaml"],
  },
  {
    name: "ksor-ledger-invalid",
    files: base({
      ".ksor/takedowns.yaml":
        "- id: x\n  revokes: nothing\n  by: human:ciso\n  at: 2026-08-24T10:00:00Z\n",
    }),
    expected: ["ksor-ledger-invalid .ksor/takedowns.yaml"],
  },
  {
    name: "ksor-policy-invalid",
    files: base({ ".ksor/governance.yaml": 'version: "0.1"\napproval_authorities: []\n' }),
    // A policy that fails its shape is refused once; the per-concept rules that need it are skipped.
    expected: ["ksor-policy-invalid .ksor/governance.yaml"],
  },
  {
    name: "ksor-legacy-key",
    files: base({ "knowledge/bad.md": frontmatter(`${stable}visibility: internal\n`) }),
    expected: ["ksor-legacy-key knowledge/bad.md"],
  },
  {
    // One hyphen. It published an embargoed policy four weeks early.
    name: "ksor-ksor-key-unknown",
    files: base({
      "knowledge/bad.md": frontmatter(
        `${stable}`.replace(
          "  audience: [public]",
          "  audience: [public]\n  effective-from: 2026-09-01T00:00:00Z",
        ),
      ),
    }),
    expected: ["ksor-ksor-key-unknown knowledge/bad.md"],
  },
  {
    // The build appends these under the record's frontmatter; declaring one
    // publishes it twice and forges the stamp.
    name: "ksor-derived-key",
    files: base({
      "knowledge/bad.md": frontmatter(`${stable}build_id: sha256:FORGED\n`),
    }),
    expected: ["ksor-derived-key knowledge/bad.md"],
  },
  {
    // A top-level key one edit from `stale_after`: preserved, it never expires.
    name: "ksor-key-near-miss",
    files: base({ "knowledge/bad.md": frontmatter(`${stable}stale_afer: 2020-01-01T00:00:00Z\n`) }),
    expected: ["ksor-key-near-miss knowledge/bad.md"],
  },
  {
    name: "ksor-instance-format",
    files: base({ "instance.md": INSTANCE.replace("format: 2", "format: 1") }),
    expected: ["ksor-instance-format instance.md"],
  },
  {
    // A case-only collision cannot be written to a case-insensitive disk, so
    // the fixture carries the route collision; the case rule is unit-tested.
    name: "ksor-name-unportable + ksor-name-collides",
    files: base({
      "knowledge/policies.md": frontmatter(stable),
      "knowledge/My Notes.md": frontmatter(stable),
    }),
    expected: [
      "ksor-name-collides knowledge/policies.md",
      "ksor-name-unportable knowledge/My Notes.md",
    ],
  },
  {
    name: "ksor-file-type + ksor-attachment-near-miss",
    files: base({ "knowledge/notes.mdx": "x", "knowledge/welcome.quiz.yml": "q: 1\n" }),
    expected: [
      "ksor-attachment-near-miss knowledge/welcome.quiz.yml",
      "ksor-file-type knowledge/notes.mdx",
    ],
  },
  {
    name: "ksor-link-dead + ksor-link-escapes",
    files: base({ "knowledge/bad.md": frontmatter(stable, "[a](nope.md) [b](../instance.md)\n") }),
    expected: ["ksor-link-dead knowledge/bad.md", "ksor-link-escapes knowledge/bad.md"],
  },
  {
    // The PNG code path: signature intact, one chunk's CRC-32 wrong. A corrupt
    // image took a whole site down at build time naming no file (hygiene.ts).
    name: "ksor-asset-corrupt",
    files: base({}),
    bytes: { "knowledge/broken.png": CORRUPT_PNG },
    expected: ["ksor-asset-corrupt knowledge/broken.png"],
  },
  {
    name: "ksor-record-empty",
    files: { "instance.md": INSTANCE, ".ksor/governance.yaml": POLICY },
    expected: ["ksor-record-empty knowledge/"],
  },
  {
    name: "ksor-policy-missing",
    files: { "instance.md": INSTANCE, "knowledge/a.md": frontmatter(stable) },
    expected: ["ksor-policy-missing .ksor/governance.yaml"],
  },
  {
    // The committed lock is the baseline the emitted checker reads; without a
    // repository it is the only one, so this is the path an adopter's CI takes.
    name: "ksor-ledger-shrank",
    files: base({}),
    lock: lockWith([{ id: "2026-08-24T09:00:00Z-zzzzzz", digest: "0".repeat(64) }]),
    expected: ["ksor-ledger-shrank .ksor/takedowns.yaml"],
  },
  {
    // The committed lock recorded this id with a DIFFERENT stable_id. Comparing
    // id sets alone let exactly this edit through, republishing the denied
    // document and denying an innocent one with nothing red on any surface.
    name: "ksor-ledger-amended",
    files: base({}),
    lock: lockWith(
      ledgerFor(
        VALID_FILES[".ksor/takedowns.yaml"]!.replace(
          "knowledge/policies/retired",
          "knowledge/policies/open",
        ),
      ),
    ),
    expected: ["ksor-ledger-amended .ksor/takedowns.yaml"],
  },
  {
    name: "ksor-pointer-changed",
    files: base({}),
    project: { "CLAUDE.md": "@AGENTS.md\n\nAnd one more rule.\n" },
    expected: ["ksor-pointer-changed CLAUDE.md"],
  },
  {
    name: "ksor-skill-copy-diverged",
    files: base({}),
    project: { ".claude/skills/format-checker/SKILL.md": "only in the copy\n" },
    expected: ["ksor-skill-copy-diverged .claude/skills/format-checker/SKILL.md"],
  },
  {
    name: "ksor-site-holds-content",
    files: base({}),
    project: { "system/site/content/stray.mdx": "# Stray\n" },
    expected: ["ksor-site-holds-content system/site/content/stray.mdx"],
  },
];
