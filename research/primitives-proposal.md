---
issue: https://github.com/panaversity/ksor/pull/1
status: proposed
last_updated: 2026-08-18
---

# ksor primitives — the written proposal

The handover's first directive: before any code, derive the primitives from
working TypeScript frameworks instead of inventing them. This is that
proposal. Sources: deep reads of vercel/eve and vercel/next.js
(`research/base-environment.md`), and of better-auth, shadcn/ui, and the
predecessor scaffold, plus a verified docs-framework survey (2026-08-18, fresh
clones and primary sources; file-level evidence in the study transcripts).

Each section names the primitive, the design, and the evidence it derives
from. §4 (the shell) ends in a recommendation that needs owner ratification
into AGENTS.md → Decisions; everything else is implementable as written.

## 1 · The verb

**One package, four verbs, one library.** `@panaversity/ksor` ships `init`,
`dev`, `build`, `serve` as thin commands over library functions; the CLI is
the top of the import graph and nothing imports it (enforced at baseline zero
by `scripts/boundaries.integration.test.ts`).

- next.js separates `create-next-app` from `next` because the scaffolder runs
  _before_ the framework exists in the project and must stay
  version-decoupled with a tiny dependency tree. ksor gets the same property
  without a second package: `npx @panaversity/ksor init` runs from the
  registry before any install, and the scaffold it emits adds ksor as a
  devDependency. A separate `create-ksor` becomes worthwhile only if init's
  dependency tree diverges from the framework's — revisit then, not now.
- What the verbs share: the instance parser (§2), the corpus walker
  (path = identity), and the `build.lock.json` writer (format 2, crossing
  from the predecessor unchanged so no migration is ever needed).
- Verb contracts cross from the predecessor's four language-neutral specs and
  are re-ratified per verb as `specs/` entries when each is implemented —
  init's byte-checkable scaffold table and negative contract (no network I/O,
  deterministic trees), build's five-minute promise and preconditions-stated
  posture, instance-format's strict parse, surface's negative contract.
- The predecessor's worst complexity — wheel transport, runtime
  materialization, staleness stamps — ceases to exist: the site shell is an
  ordinary npm dependency of the scaffolded project. Nothing may reintroduce
  that shape (AGENTS.md: never carry a mechanism across without asking what
  it was for).

## 2 · The config object — instance.md

**Frontmatter is machine config; the body is the MCP system prompt,
byte-preserved. Parsing is strict and fail-closed.**

- Format crosses from the predecessor's instance-format spec: `format: 1`,
  `name`, a `ksor.requires` exact-floor pin; an unknown top-level key is a
  **named error with migration guidance**, never a silent pass-through;
  reserved forward keys (retrieval floors, budgets) are accepted and inert;
  a null floor means UNCALIBRATED → the abstention gate is off and surfaced
  on /health (an inherited assumption — see AGENTS.md → Decisions, open questions).
- The TypeScript shape, from better-auth's core lesson: **types derive from
  the config value; the schema is the single source of truth.** The SDK owns
  one zod schema for the frontmatter; `parseInstance()` returns the inferred
  `Instance` type; the public boundary exposes Standard Schema
  (`StandardSchemaV1`), not zod (base-environment ledger).
- Where better-auth cannot help: its config is a TS file, so the type system
  carries plugin types to the consumer. instance.md is markdown — SMEs edit
  it, not developers. The stringly-typed-config trap is therefore closed at
  runtime instead: every extension's options are validated by that
  extension's own declared schema during parse, and every violation carries
  the extension name, the key path, why, and the fix (errors are
  documentation). The published JSON Schema for instance frontmatter is
  **generated from the zod source** — shadcn hand-mirrors its Zod schema into
  a JSON file and admits it must be kept in sync by hand; we do not copy that.

## 3 · The extension point

**One plugin shape, three capability channels — not three mechanisms.**

A ksor plugin is one object (better-auth's `BetterAuthPlugin` pattern:
runtime channels + declarative data + type channels, authored with
`satisfies KsorPlugin` so literals never widen) that may contribute any of:

1. **content transforms** — remark-tier plugins applied identically to both
   surfaces (the 10 predecessor lib packages become the first citizens);
2. **ingest adapters** — a source address scheme resolving to governed
   markdown candidates (shadcn's four-way address dispatch — local path, URL,
   `github:`, `@namespace` with `{name}` templates and `${ENV_VAR}`-expanded
   auth — is the seam; each adapter is one branch returning items validated
   at the boundary);
3. **MCP tools** — additional read-only tools on the agent surface.

Plus the declarative channel every plugin carries: its options schema
(validated at instance parse, §2) and its metadata. One registration point,
uniform discovery, and the boundary test keeps plugins out of the CLI.

The scaffold/distribution story is shadcn's, already settled as AGENTS.md decision 4:
corpus items as typed registry entries (`ksor:*` kinds, `files[]` with
required-`target` kinds mirroring `registry:file`/`registry:page`),
recursive `registryDependencies` with visited-set + topo-sort and
name+source-hash identity (never bare-name dedupe), **path-safety validation
on every registry-controlled write target**, mergeable resources deep-merged
rather than overwritten, no lockfile and no version tracking — updates are
`add --diff` then an explicit `--overwrite`. The registry itself is static
JSON on any host; `shadcn build`'s inline-the-content model is exactly
`ksor build`'s shape for corpus items.

## 4 · The shell

> **Revision 2026-08-18 (supersession visible):** ratified the OTHER way —
> AGENTS.md decision 9: Next.js + Fumadocs + shadcn as the single core shell,
> behind a pinned surface contract, replacing Docusaurus before v1 traffic.
> This section's stay-Docusaurus recommendation was optimizing cheapest
> crossing; the owner's extensibility/ecosystem arguments plus one new fact —
> all 10 predecessor lib packages verified framework-neutral (zero Docusaurus
> imports), so the "free crossing" was mostly illusion — reversed it. The
> section's own closing line named Fumadocs the rewrite target; kept below as
> the evidence trail.

**Moved.** The shell question outgrew a section: the evidence, the argument,
the unanswered structural question, and the candidate decision texts now live
in [`research/site-shell.md`](./site-shell.md) — one fact, one file.

> **Revision note (2026-08-18):** this section recommended **Docusaurus**.
> That recommendation is preserved in the new file and is now **challenged,
> not withdrawn**: it did not weigh the fork's carrying cost, the fact that
> the migration is paid either way and only gets dearer, or decision 4
> (scaffolds are adopter-owned). Still undecided; it turns on a question only
> the owner can answer.

## 5 · The boundary, and its enforcement

**Decided before there are packages to enforce — and already implemented in
the base-environment PR.** `scripts/boundaries.integration.test.ts`
reproduces the predecessor's `tests/test_boundaries.py` in TypeScript at
baseline zero (`ALLOWED = { "@panaversity/ksor": [] }`):

1. every workspace package must be enrolled in `ALLOWED` — enrolment is a
   decision with a name on it, not a silence;
2. internal imports must respect the declared graph (static scan of
   import/export-from, string-literal `import()`/`require()`; a non-literal
   dynamic import is itself a violation — don't hide the graph);
3. nothing imports the CLI — it is the top of the graph, never a library.

The scan is deliberately not built on the TypeScript compiler API (forbidden
until TS 7.1, guard rule 6); if it ever needs real AST fidelity, oxc-parser
is the recorded upgrade path.

## 6 · The serve envelope — requirements from the Expert Twin Architecture

Added 2026-08-18: the owner's Expert Twin Architecture (Zia Developer AI —
four records, two engines) sits directly on top of ksor as its Knowledge
Record. Its first rule — _governed at the gates, fails closed_ — is only as
strong as this surface makes it, which pins two requirements on `serve` and
two on the scaffold before either is designed:

1. **Abstention is a type, not a phrasing.** The answer envelope is a
   discriminated union —
   `{ ok: true, answer, citations, generation } | { ok: false, reason: "abstained" }`
   — so a praxis fails closed on a compile-time branch, never on interpreting
   prose. (This is also product principle 5 made mechanical, and the
   discriminated-union guidance from the typing review applied where it is
   load-bearing.)
2. **Provenance labels are derived, never asserted.** The twin's
   Governed / External / Inference / Unknown labels must be computable from
   the envelope: citation present **and** generation published ⇒ Governed;
   the abstention branch ⇒ Unknown. A model may only supply the
   External-vs-Inference distinction. If the surface cannot support that
   derivation, the labels degrade to confident guesses wearing badges.
3. **An engagement lock, not scattered prose.** `build.lock.json` (format 2)
   already pins what a _build_ rested on; the scaffold's decision log must do
   the same for _judgment_ — each recorded gate names the corpus generation
   (and, for twins, the praxis/scaffold versions) in force when it closed.
   Same pattern, second application: reproducibility of judgment becomes
   testable the way reproducibility of builds is.
4. **The scaffold is the Work Record — build it once.** The twin
   architecture's Project Record (constitution above specs, decision log with
   citations, gate log, the continuation pointer, "holds only what nothing
   else records") is clause-for-clause what `ksor init` should emit, as
   governed markdown — so a twin's Work Record is itself servable and
   auditable by ksor tooling. Likewise its Scaffold Engine ("versioned
   against the SoR, ships complete, selection cited") is this proposal's §3
   registry items, not a parallel mechanism; and its Eval Engine inherits
   AGENTS.md → Testing's gating rules verbatim — decision evals externally
   authored (gold generated from the judgment under test would bless its own
   errors) and ratcheting.

## What this unblocks

Implementation order stays the plan's: `init` first (scaffold + templates
cross from the predecessor), then `build` (+ `build.lock.json` format 2 and
the shipped-bytes agent-surface acceptance), then `dev`, then `serve` (MCP
SDK v2, stdio + Streamable HTTP). Each verb re-ratifies its predecessor spec
into `specs/` as it lands, red-first per the $implement-spec skill.
