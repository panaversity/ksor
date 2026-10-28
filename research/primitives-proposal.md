---
issue: https://github.com/panaversity/ksor/pull/1
status: superseded
last_updated: 2026-09-02
---

# ksor primitives — the written proposal

> **Supersession note (2026-09-02).** This proposal did its job — the
> primitives were derived before code — and the code has since settled each
> section its own way. It is kept as the evidence trail; AGENTS.md → Decisions
> is the authority wherever the two disagree.
>
> - **Landed, except one verb.** Of §1's four, `init`, `build` and `serve`
>   ship; `ksor dev` is designed and not implemented — it reports so and exits
>   `2` (`docs/status.md`). `serve` arrived as the graduated rung of decision 11
>   — the predecessor's content kernel converted whole, behind
>   `ksor serve`, speaking MCP over stateless Streamable HTTP (decision 13).
>   §6's envelope requirement is met in the form the door serves: an answer is
>   cited hits with a `generation`, and an abstention is the typed
>   `abstained` outcome rather than a phrasing (`specs/ksor/serve/spec.md`).
>   §5's boundary suite is in the tree and enrolls every workspace package.
>   §2's instance format has been replaced by `instance.md` `format: 2`
>   (decision 27), still strictly parsed, still refusing unknown keys.
> - **Closed by decision 23.** §3's third capability channel, "MCP tools as a
>   plugin contribution", is not how tools reach the door: the tool surface is
>   adopter-owned CODE — ordinary `registerTool` in the scaffold's
>   `system/gateways/content.ts` — and the door verifies its own served surface
>   at boot rather than accepting registrations through a config API. A
>   `defineGateway` config API was built and discarded on the way.
> - **Parked.** §3's other two channels (content transforms as remark-tier
>   plugins; ingest adapters with a source-address scheme) and its
>   shadcn-shaped registry of corpus items; §2's published JSON Schema
>   generated from the zod source and the Standard Schema boundary; §6's
>   engagement lock and Work Record scaffold. None has an owner issue; each
>   re-earns its place with a spec when the work arrives.
> - **§4** was moved to `research/site-shell.md` and that file is now itself
>   superseded — see the note in §4.

The handover's first directive: before any code, derive the primitives from
working TypeScript frameworks instead of inventing them. This is that
proposal. Sources: deep reads of vercel/eve and vercel/next.js
(`research/base-environment.md`), and of better-auth, shadcn/ui, and the
predecessor scaffold, plus a verified docs-framework survey (2026-08-18, fresh
clones and primary sources; file-level evidence in the study transcripts).

Each section names the primitive, the design, and the evidence it derives
from. §4 (the shell) ends in a recommendation that needs owner ratification
into AGENTS.md → Decisions; everything else is implementable as written.

## Question

How can the foundational primitives for KSoR be derived from existing working TypeScript frameworks, rather than invented, to establish a robust and consistent architecture for the `ksor` CLI verbs, configuration, extension points, and core services, and what are the specific designs and supporting evidence for each primitive?

## Evidence

This proposal was developed in response to a directive to derive KSoR primitives from working TypeScript frameworks. The sources for this derivation included deep reads of `vercel/eve`, `vercel/next.js` (`research/base-environment.md`), `better-auth`, `shadcn/ui`, and the predecessor scaffold. A verified docs-framework survey was also conducted on 2026-08-18, using fresh clones and primary sources.

Key evidence supporting the proposed primitives includes:

- **CLI Verbs**: The decision to have one package with four verbs (`init`, `dev`, `build`, `serve`) as thin commands is informed by `next.js` separating `create-next-app` for version decoupling.
- **Configuration (`instance.md`)**: The design emphasizes strict, fail-closed parsing of frontmatter as machine config, with the body as the MCP system prompt. This is based on the predecessor's `instance-format` spec and `better-auth`'s lesson on deriving types from config values. Strict parsing and named errors for unknown keys ensure robustness.
- **Extension Points**: A single plugin shape with three capability channels (content transforms, ingest adapters, MCP tools) is proposed, drawing on `better-auth`'s `KsorPlugin` pattern and `shadcn`'s registry for corpus items and path-safety validation.
- **Boundary Enforcement**: The `scripts/boundaries.integration.test.ts` (already implemented) reproduces the predecessor's `tests/test_boundaries.py` in TypeScript at baseline zero (`ALLOWED = { "@panaversity/ksor": [] }`) to enforce package enrollment, internal import graph respect, and prevention of CLI imports.
- **Serve Envelope**: Requirements from the Expert Twin Architecture (Zia Developer AI) drive the design of the `serve` envelope. This includes abstention as a discriminated union type (product principle 5), derived provenance labels (Governed, External, Inference, Unknown), an engagement lock (`build.lock.json` format 2) for reproducibility of judgment, and the scaffold as a servable Work Record.

## Decision

This proposal outlined the foundational primitives for KSoR, derived from existing TypeScript frameworks, to guide the development of the `ksor` CLI verbs, configuration, extension points, and core services. While the proposal did its job in deriving these primitives before code was written, the implementation has since settled each section in its own way, and `AGENTS.md → Decisions` is the authority wherever the two disagree.

Key decisions and their current status:

- **CLI Verbs**: `init`, `build`, and `serve` have shipped. `ksor dev` is designed but not implemented (reports exit `2`). `serve` integrates the predecessor's content kernel, converted whole, behind `ksor serve`, speaking MCP over stateless Streamable HTTP (Decision 13).
- **Configuration (`instance.md`)**: Replaced by `instance.md` `format: 2` (Decision 27), which is strictly parsed and refuses unknown keys. This adheres to the principle of strict, fail-closed parsing.
- **Extension Points**: The MCP tools channel is closed by Decision 23. The tool surface is now adopter-owned CODE using `registerTool` in `system/gateways/content.ts`, and the door verifies its own served surface at boot. A `defineGateway` config API was built and discarded. Other channels (content transforms, ingest adapters) and the `shadcn`-shaped registry are currently parked, awaiting an owner issue and spec.
- **Boundary Enforcement**: Implemented in `scripts/boundaries.integration.test.ts` with baseline zero, enforcing package enrollment, import graph respect, and preventing CLI imports. This aligns with the initial design.
- **Serve Envelope**: The envelope requirement is met. An answer is cited hits with a `generation`, and abstention is a typed `abstained` outcome (`specs/ksor/serve/spec.md`), fulfilling the discriminated union requirement. Provenance labels are derived from the envelope. Engagement lock and Work Record scaffold aspects are parked.
- **Shell Decision**: The recommendation in §4 for Docusaurus was initially challenged and then explicitly superseded. `research/site-shell.md` (where §4 was moved) is now also superseded (Decision 9), meaning the decision landed with Next.js + Fumadocs + shadcn as the single core shell.

## Rejected

- **Second package for `init` (`create-ksor`)**: Rejected, as `npx @panaversity/ksor init` achieves version decoupling without a separate package. Reconsideration is deferred until `init`'s dependency tree diverges from the framework's.
- **Reintroducing predecessor's complexity**: Explicitly rejected reintroducing complexities like wheel transport, runtime materialization, and staleness stamps. `AGENTS.md` mandates asking "what it was for" before carrying such mechanisms.
- **Uncalibrated null floor**: An inherited assumption in `instance.md` that a null floor means UNCALIBRATED and the abstention gate is off was marked as an open question in `AGENTS.md → Decisions`, implying it was implicitly rejected as a silent pass-through.
- **`defineGateway` config API**: A `defineGateway` config API was built and discarded on the way, indicating a rejection of that approach for tools reaching the door.
- **MCP tools as a plugin contribution**: Rejected by Decision 23. The tool surface is now adopter-owned CODE via `registerTool` rather than a plugin API.
- **JSON Schema generated by hand**: The `shadcn` pattern of hand-mirroring Zod schema to JSON was explicitly rejected ("we do not copy that"). The decision is to _generate_ JSON Schema from the Zod source.
- **Docusaurus as the core shell**: The recommendation in §4 for Docusaurus was ultimately reversed and superseded by Decision 9, which adopted Next.js + Fumadocs + shadcn as the single core shell.
- **Ingest adapters with a source-address scheme and shadcn-shaped registry**: Parked, awaiting an owner issue and spec, indicating a deferral that effectively acts as a rejection for current implementation.
- **Engagement lock and Work Record scaffold**: Parked, awaiting an owner issue and spec, indicating a deferral that effectively acts as a rejection for current implementation.
- **Non-literal dynamic imports in boundary enforcement**: Explicitly stated as a violation ("don't hide the graph"), implying rejection of such imports.
- **Dependency on TypeScript compiler API for boundary scan**: Rejected (forbidden until TS 7.1). `oxc-parser` is the recorded upgrade path, implying `tsc` API was not chosen.
- **Generating gold from the judgment under test for Eval Engine**: Explicitly rejected ("gold generated from the judgment under test would bless its own errors"), emphasizing externally authored evaluations.

## Reversal

- **Superseded status**: The proposal itself is `superseded` (2026-09-02), meaning the original plan's specific implementations have been overridden by subsequent code decisions. This is the overarching reversal. `AGENTS.md → Decisions` is now the authority.
- **`instance.md` format**: The initial `format: 1` instance format (from the predecessor's spec) has been _replaced_ by `instance.md` `format: 2` (Decision 27). This is a direct reversal in the configuration primitive.
- **MCP tools plugin contribution**: §3's "MCP tools as a plugin contribution" channel was _closed_ by Decision 23. The approach was reversed to adopter-owned CODE using `registerTool`, with a `defineGateway` config API built and _discarded_.
- **Shell recommendation**: The proposal's §4 initially recommended Docusaurus. This recommendation was _reversed_ by Decision 9, which ratified Next.js + Fumadocs + shadcn as the single core shell, based on owner extensibility/ecosystem arguments and the framework-neutrality of lib packages.
- **`ksor dev` implementation**: The plan in §1 for `ksor dev` to ship as a verb has been _reversed_; it is designed but not implemented and exits `2`.
- **Serve envelope phrasing**: The requirement for abstention to be "a type, not a phrasing" led to the `abstained` outcome being typed, _reversing_ any previous reliance on prose interpretation.
- **JSON Schema generation**: The previous implication (from `shadcn` anti-pattern) might have been manual sync. The decision to _generate_ JSON Schema from Zod source _reverses_ any manual synchronization approach.
- **Owner ratification of shell recommendation**: The initial plan for §4's recommendation to need owner ratification was _superseded_ by Decision 9, where the owner actively reversed the Docusaurus recommendation.
- **`takedown --export`**: The predecessor's `takedown --export` was part of the CLI. This has been _deleted_, representing a reversal of its existence (AGENTS.md: never carry a mechanism across without asking what it was for).

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

1.  **content transforms** — remark-tier plugins applied identically to both
    surfaces (the 10 predecessor lib packages become the first citizens);
2.  **ingest adapters** — a source address scheme resolving to governed
    markdown candidates (shadcn's four-way address dispatch — local path, URL,
    `github:`, `@namespace` with `{name}` templates and `${ENV_VAR}`-expanded
    auth — is the seam; each adapter is one branch returning items validated
    at the boundary);
3.  **MCP tools** — additional read-only tools on the agent surface.

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

**Moved, then superseded.** The shell question outgrew a section: the
evidence, the argument, the unanswered structural question, and the candidate
decision texts moved to `research/site-shell.md`. Decision 9's 2026-08-24
revision retired the second shell it argued about, so that file is superseded
and lives in git history (last at `c057265`), not the working tree.

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

1.  every workspace package must be enrolled in `ALLOWED` — enrolment is a
    decision with a name on it, not a silence;
2.  internal imports must respect the declared graph (static scan of
    import/export-from, string-literal `import()`/`require()`; a non-literal
    dynamic import is itself a violation — don't hide the graph);
3.  nothing imports the CLI — it is the top of the graph, never a library.

The scan is deliberately not built on the TypeScript compiler API (forbidden
until TS 7.1, guard rule 6); if it ever needs real AST fidelity, oxc-parser
is the recorded upgrade path.

## 6 · The serve envelope — requirements from the Expert Twin Architecture

Added 2026-08-18: the owner's Expert Twin Architecture (Zia Developer AI —
four records, two engines) sits directly on top of ksor as its Knowledge
Record. Its first rule — _governed at the gates, fails closed_ — is only as
strong as this surface makes it, which pins two requirements on `serve` and
two on the scaffold before either is designed:

1.  **Abstention is a type, not a phrasing.** The answer envelope is a
    discriminated union —
    `{ ok: true, answer, citations, generation } | { ok: false, reason: "abstained" }`
    — so a praxis fails closed on a compile-time branch, never on interpreting
    prose. (This is also product principle 5 made mechanical, and the
    discriminated-union guidance from the typing review applied where it is
    load-bearing.)
2.  **Provenance labels are derived, never asserted.** The twin's
    Governed / External / Inference / Unknown labels must be computable from
    the envelope: citation present **and** generation published ⇒ Governed;
    the abstention branch ⇒ Unknown. A model may only supply the
    External-vs-Inference distinction. If the surface cannot support that
    derivation, the labels degrade to confident guesses wearing badges.
3.  **An engagement lock, not scattered prose.** `build.lock.json` (format 2)
    already pins what a _build_ rested on; the scaffold's decision log must do
    the same for _judgment_ — each recorded gate names the corpus generation
    (and, for twins, the praxis/scaffold versions) in force when it closed.
    Same pattern, second application: reproducibility of judgment becomes
    testable the way reproducibility of builds is.
4.  **The scaffold is the Work Record — build it once.** The twin
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
