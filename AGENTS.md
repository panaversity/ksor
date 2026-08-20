# AGENTS.md

The durable contract for working in this repository: what ksor is, the
vocabulary, the decisions, the invariants, and how it is built and tested.
Loaded every session, so it holds **only what stays true** — what is true this
week lives in [`docs/status.md`](docs/status.md); the product pitch lives in
[`README.md`](README.md), its only home.

> CLAUDE.md is a symlink to this file. They are the same file: one contract for
> every agent — human-readable and agent-readable, like everything else here.

## Critical rules

1. **Never weaken provenance, citation, abstention, or governance guarantees to
   simplify an implementation.** They are the product, not features of it.
2. **Never push directly to `main`.** Every change lands through a pull request.
3. **Never break the agent-discoverable surfaces**: docs bundled in the npm
   package (`packages/ksor/docs/`), and — once the site ships — its `llms.txt`
   and `/.well-known/mcp/server.json`. Agents finding ksor is how ksor gets used.

## What this is, in one line

A CLI (`ksor` — the npm package is `@panaversity/ksor`) that compiles a folder
of governed markdown into two surfaces — a static website for people and an MCP
server for AI agents — with cited answers and honest abstention. It is not an
agent framework; it is the knowledge layer agent frameworks read from.

**Which verbs are implemented is not recorded here.** This file describes what
ksor _is_; `docs/status.md` holds what is built this week. One rule keeps the
CLI itself the current answer: an unimplemented verb says so and exits `2`, an
unknown word is refused with exit `1` — so no document has to be kept in step
with the binary.

A Python-era predecessor (vsor, `panaversity/zia-vsor-sdk`) proved much of the
design. Its work may be taken and converted to TypeScript (decision 6), but it
is a source to mine, not an authority to follow: nothing crosses without asking
what it was for, and converted code re-earns its place with tests here.

## What we claim, and to whom

Positioning, recorded because a session that re-derives it tends to describe
the machinery instead of the value:

- **A system of record is where the official version lives.** When the ledger
  and a spreadsheet disagree, the ledger wins. Businesses have had them for
  decades; **AI never did** — it answers from everything it has ever read,
  which is exactly why it cannot tell you which of its sentences were checked.
  KSoR is that record, for institutional knowledge.
- **Vendor-free is the ownership argument.** The agent surface speaks MCP, an
  open standard: one corpus will answer in any assistant, agent framework, or
  worker the owner writes. What a customer owns is the source; runtimes are
  interchangeable. Never position ksor as an integration with one assistant.
- **The interesting problem is not retrieval.** Chunking, embedding, and
  hybrid search are commodity. Whether an agent can be _trusted_ is decided by
  the governance of what it reads — provenance, something citable, and a
  measured floor under which it declines. Lead with that, not the pipeline.
- **Agents are the operator, not the audience for a manual.** The owner tells
  the coding agent they already use; scaffolded projects will therefore ship
  skills and rules as a product surface, not documentation.
- **Out of the box the owner is meant to touch knowledge only** — plain
  markdown, in any language they write in.

## Vocabulary

Used precisely; do not repurpose.

| Term                | Means                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------- |
| **corpus**          | the governed markdown under `knowledge/` — the source of truth                               |
| **instance**        | one deployment configured (`instance.md`): corpus, floors, budgets. **Not governance**       |
| **build**           | one execution of `ksor build`, identified by a `build_id`                                    |
| **generation**      | the monotonic version of published content — what a citation pins                            |
| **build.lock.json** | the committed record of a build: what was published, from which commit, with which toolchain |
| **surface**         | something that serves the corpus — the website and the MCP server                            |
| **scaffold**        | what `ksor init` writes into an adopter's repo — owned by the adopter (decision 4)           |
| **level**           | how much governance a project has climbed to, 0–4 — a ladder, not a gate                     |
| **abstain**         | the corpus does not cover this — a correct answer, never an error                            |

## Repository layout

| Path                                                       | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/ksor/`                                           | the published package: CLI + SDK (MCP surface lands here)                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `packages/{postgres,content,gateway-kit,content-gateway}/` | the kernel (decision 11): Postgres access discipline (pooling, scoped transactions, retry classification), the content corpus store + retrieval + abstention, serving postures, and the content MCP door (one gateway per record — `content-gateway` today; `identity-gateway`, `praxis-gateway` follow). BUNDLED into `@panaversity/ksor` — the CLI inlines all four and exposes one `ksor` binary; the kernel packages stay private, never published (decision 12 publish revision 2026-08-20) |
| `packages/ksor/docs/`                                      | user docs, shipped inside the npm tarball                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `workbench/example-corpus/`                                | living KSoR fixture: dev target, test + eval surface                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `workbench/shells/`                                        | alternative site shells proving the swap seam (decision 9)                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `docs/status.md`                                           | the only authority on what is implemented (npm links it)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `research/`                                                | plans and records; frontmatter is guard-enforced                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `specs/`                                                   | one-page feature contracts; frontmatter is guard-enforced                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `.agents/skills/`                                          | repo-maintenance skills (`.claude/skills` symlinks here)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `scripts/`                                                 | guards, corpus checks, boundary tests — plain node/vitest                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tsconfig.base.json`                                       | the shared strict base — extend, don't fork                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `.githooks/`                                               | committed pre-commit hook (`pnpm prepare` sets hooksPath)                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### How a package is named

The table above is generated by a rule, not by taste. ksor is built to hold
MORE records than one — the content SoR today, identity and praxis after it —
so the package names have to say which layer a thing belongs to before anyone
argues about it:

| Layer                 | Name                    | Holds                                              |
| --------------------- | ----------------------- | -------------------------------------------------- |
| shared infrastructure | `ksor-postgres`         | pooling, scoped transactions, retry classification |
| shared serving        | `ksor-gateway-kit`      | auth, fail-closed bind, transport security         |
| ONE record's store    | `ksor-<record>`         | `ksor-content`                                     |
| ONE record's MCP door | `ksor-<record>-gateway` | `ksor-content-gateway`                             |
| the product           | `@panaversity/ksor`     | the published CLI; bundles the rest                |

A second record adds exactly two packages — `ksor-identity` and
`ksor-identity-gateway` — and no new pattern. If a change needs a pattern that
is not here, that is the signal to stop and decide, not to invent a name.

**Never name a package for a layer that admits anything.** `platform`, `core`,
`common`, `shared`, `utils` constrain nothing, so unrelated code accretes into
them — which is exactly what happened to `ksor-platform` before it became
`ksor-postgres` (decision 11 revision 2026-08-20): it had quietly collected env
helpers that duplicated gateway-kit's. The test a name must pass is that
"does this belong in X?" has an answer. `postgres` passes; `content` passes (it
is a record, alongside identity and praxis); `platform` never could.

## Commands

```sh
pnpm install              # respects the packageManager pin (pnpm 11)
pnpm build                # tsdown per package (<10s)
pnpm typecheck            # tsc --noEmit, packages + scripts (<5s)
pnpm lint                 # oxlint --fix (<1s)
pnpm fmt                  # oxfmt (<1s)
pnpm guard                # guard-invariants.mjs (<1s)
pnpm check:corpus         # frontmatter, links, instance identity (<1s)
pnpm test:unit            # *.test.ts, colocated, pure (<3s)
pnpm build && pnpm test:integration   # built artifacts + repo-tree suites (<15s)
pnpm publint               # package manifest/tarball correctness (needs build)
```

Run fmt/lint/typecheck freely — they are cheap. Treat local checks as advisory:
CI is the source of truth — don't burn cycles making advisory gates pass before
handing off.

## Decisions

Recorded here, in the same change that acts on them; each names what would
reverse it, and a reversed decision keeps its entry with a revision note.
**Work that contradicts one stops and goes back to a human.**

1. **TypeScript and npm are the front door.** The site toolchain must execute
   on the adopter's machine, so Node is a prerequisite no other runtime can
   hide; a second mandatory runtime buys the adopter nothing. Reversed if the
   end user ever stops needing a local Node build.
2. **Package `@panaversity/ksor`, command `ksor`.** Unscoped `ksor` is blocked
   by npm's publish-time similarity gate (verified by a real `E403`; a registry
   404 is not evidence of publishability). Not reversible.
3. **Apache-2.0, whole repository.** Reversed only by an explicit owner
   relicensing decision recorded here.
4. **Corpus scaffolds are copy-into-repo** (the shadcn model, validated by our
   own study of its mechanics): the adopter owns what `ksor init` emits;
   updates are offered as diffs and applied only by explicit overwrite.
   Reversed per-file if a scaffold file must stay framework-owned to preserve
   a product guarantee.
5. **Toolchain** per the `research/base-environment.md` §2 ledger: TS 7 native
   (never depend on its compiler API before 7.1 — guard rule 6), Node ≥24,
   pnpm exact-pinned, pure ESM, tsdown with `isolatedDeclarations` (explicit
   types at every exported boundary, oxc fast path for `.d.ts`), vitest tiers,
   oxlint+oxfmt, changesets with npm trusted publishing. Reversed per-pin when
   a recorded caveat fires. _Revision 2026-08-18: turbo removed — a task
   runner for one package earned nothing; plain `pnpm -r` is the whole of it.
   It (or a then-current alternative) returns with the first inter-package
   dependency edge — the site/lib conversion PR — judged against the real
   task graph, not package count. The `pnpm build` vocabulary is the stable
   contract either way; the runner behind it is replaceable machinery._
6. **Predecessor conversion is granted** (owner, 2026-08-18): Apache-2.0
   covers the predecessor work end to end, and the owner has granted taking it
   — Python included — and converting it to TypeScript. This retires the
   copy-grant blocker the handover carried. Conversion is engineering-gated,
   not licence-gated: ask what a mechanism was for before carrying it, and
   converted code lands with its own tests. Not reversible (a recorded grant).
7. **Product design decisions adopted from the predecessor** under decision 6
   — each individually reversible with new evidence, recorded here:
   **conversation is the interface** (the human runs `ksor init <name>` once,
   then talks to the coding agent they already use; CLI verbs are for the
   agent); **serving fails safe** (local serve binds loopback with auth off; a
   public bind fails closed unless auth is configured or unauthenticated
   serving is explicitly flagged — "disabled by default" must never silently
   become an open server); **the governance level is derived, never declared**
   (tools report the level the governance artifacts achieve; no `governance:`
   key in `instance.md`); **no empty scaffolded directories** (an empty
   directory is an unanswered question in the adopter's repo — directories
   appear when the ladder or the work demands them); **the site is preview and
   review, not an editor** (the agent writes; the human checks).

8. **Scaffold structure: root workspace + system roof** (owner, 2026-08-18).
   `ksor init` emits the workspace manifests at the repo root (defaults beat
   hiding them behind new algorithms), `knowledge/` at root as the record —
   CommonMark only, framework-free forever — and ALL code under `system/`
   (site now; gateways/packages as earned; growth inside, never beside). The
   root set is closed at birth; full lock record and the closed set:
   `research/scaffold-structure.md` + `specs/ksor/init/spec.md`. Reversed
   per-clause with evidence, recorded there. _Revision 2026-08-20: the closed
   root set gains ONE member, `.env.example`. The served rung needs three
   variables and one of them is not guessable — `ksor serve` refuses to boot
   unauthenticated, so `KSOR_AUTH_DISABLED=1` is required for a local run, and
   a runbook that omitted it dead-ended at its last step (found live). An empty
   directory is an unanswered question; a named, commented example of the
   variables a rung needs is an ANSWERED one, and it is the only place those
   values can live without being pasted into a shell. `.gitignore` gains
   `!.env.example` so the example survives the `.env*` rule that hides real
   secrets._
9. **Site shell: one in core — Next.js + Fumadocs + shadcn** (owner,
   2026-08-18), replacing Docusaurus natively before v1 traffic. No shell
   selector at init (one obvious way; a flag forks every skill, test, and
   recipe). Choice lives in three existing layers: the pinned **surface
   contract** (render the record, llms.txt, per-page md artifacts, browser
   smoke, no authored content — the shell is a slot), adopter ownership of
   `system/site`, and future registry-distributed alternative shells.
   _Revision note: supersedes the site-shell open question and the
   primitives proposal §4 stay-Docusaurus lean (proposed, never ratified) —
   the extensibility ceiling (auth, features), agent-ecosystem alignment,
   and the verified portability of the predecessor's remark layer decided
   it._ Reversed if Fumadocs's static export or llms surface regresses
   before the site slice ships. _Revision 2026-08-18: the two-shell proof
   is in-tree — `workbench/shells/docusaurus/` swaps in by its README
   recipe and one shell-agnostic conformance suite runs the surface
   contract against both shells in CI. `ksor init` still emits Fumadocs,
   always; no selector was added._
10. **Scaffold templates are MIT-0** (owner, 2026-08-18): init's output
    lands in the adopter's proprietary repo free of attribution
    obligations, and init never emits a LICENSE file into a repo whose
    knowledge is theirs. The grant sentence lives in the scaffolded README.
11. **The content kernel converts whole; serve is the graduated rung**
    (owner, 2026-08-19). The predecessor kernel's content SoR
    (`sor-agentfactory @ b554f91`: sor-content, the sor-platform trim, the
    gateway-kit auth/serve/harden slice, and the content gateway) converts
    to TypeScript in this workspace — retrieval, generations, the calibrated
    abstention method with its measurement history, and the fail-closed
    dual-mode serving posture — with the Python suite as conversion oracle:
    gold sets, schema contract, and calibration data extract as conformance
    fixtures first, red before any port. The MCP door speaks the MCP
    TypeScript SDK, stateless Streamable HTTP (one transport — the shape
    the production gateway ships; a local agent uses the same URL).
    Placement is the
    ladder: `ksor init` stays database-free (`pnpm dev` unchanged — the
    out-of-the-box claim holds); the kernel lands as framework-owned
    workspace packages behind `ksor serve`, and adopters climb to it.
    Retrieval runs in a real embedding space through the merged provider
    seam; CI carries a Gemini key for the gated live tiers. Record:
    `research/kernel-conversion.md`; contract: `specs/ksor/serve/spec.md`.
    Each crossing mechanism still answers decision 6's gate individually;
    the database-free-init clause is reversed only by an explicit owner
    decision recorded here. _Revision 2026-08-20: the kernel's floor package was
    renamed `ksor-platform` → **`ksor-postgres`** (directory `packages/postgres`).
    "Platform" was inherited from the predecessor and is a bucket name — it
    constrains nothing, so unrelated code accretes: it had already collected
    `envInt`/`envFloat`, duplicating a differently-shaped pair in gateway-kit.
    The package is Postgres access discipline (pooling, scoped transactions with
    GUCs, retry classification), and the new name makes membership answerable.
    The env helpers moved to `content`, their only consumer. Private package, so
    no published contract changed._ _Revision 2026-08-20 (owner): MCP serving is a
    CORE surface of every KSoR, not an optional rung, so the served tool ships
    as a FIRST-CLASS scaffold dependency — `ksor init` writes
    `@panaversity/ksor` into the scaffold's `package.json` dependencies, pinned
    to the EXACT CLI version that scaffolded the project (via the existing
    `KSOR-STAMP-VERSION` stamp), plus `serve`/`ingest` convenience scripts, so
    `pnpm serve` is a local, version-pinned command rather than an `npx`
    afterthought. This does NOT reverse the database-free-init clause:
    installing the dependency needs no database, and `pnpm dev` still runs the
    site without one — the "climb" to serving is now only standing up Postgres
    and a provider key, not acquiring the tool. The committed scaffold lockfile
    stays site-only (a stamped version cannot be pre-resolved into a committed
    lock), so the adopter's FIRST `pnpm install` is non-frozen and writes the
    lock; their shipped `validate.yml` runs no install, so their CI is
    unaffected. Verified live: an emitted scaffold's `pnpm install` resolves the
    pinned dep, links the `ksor` bin, and `pnpm exec ksor` runs. Reversed only
    by an explicit owner decision recorded here._

12. **The kernel's dependency set** (2026-08-19, with decision 11; each
    entry individually reversible by a better tool winning a recorded
    comparison). One Postgres driver: `pg`, queried **raw** —
    **`schema.sql` stays the DDL source of truth** (converted from the
    oracle; a rendered-SQL test in `schema.integration.test.ts` pins it).
    _Revision 2026-08-19: `drizzle-orm` was proposed here for typed queries
    with an information_schema drift test, then DROPPED as unused before it
    landed — no package declares it, and guard rule 5 enforces its absence;
    raw `pg` with explicit projection-width guards carries the kernel. If a
    typed-query layer returns, it re-earns its place with the drift test the
    original proposal named._ _Revision 2026-08-19 (publish prep): `@types/pg`
    is a declared `dependency` (not a devDep) of `ksor-postgres`,
    `ksor-content`, and `ksor-content-gateway` — their published `.d.mts`
    exposes `pg.Pool`/`PoolClient` in the public API, so an external TS
    consumer needs the types to resolve; enrolled in guard rule 5's per-package
    allowlist._ `zod` from the catalog
    pin (the reserved "first validated public API" arrived). `@google/genai`
    as the default embedding provider behind the seam — the seam, not the
    vendor, is the contract. `jose` for the gateway kit's public-door JWT
    verification. `@modelcontextprotocol/server` (SDK v2, the 2026-07-28 revision; `@modelcontextprotocol/client` is a devDep for the acceptance walk) for the MCP surface. Guard
    rule 5 now scans every workspace package against this list; install
    scripts stay denied (three denials recorded in `pnpm-workspace.yaml`
    with verified why-comments). _Revision 2026-08-20 (ONE package, owner):
    the kernel is BUNDLED INTO the published CLI — `@panaversity/ksor` inlines
    `postgres` + `content` + `gateway-kit` + `content-gateway` (workspace
    devDeps, tsdown `noExternal`), carries their external runtime deps (`pg`,
    `@google/genai`, `@modelcontextprotocol/server`, `hono`, `@hono/node-server`,
    `jose`, `zod`, `@types/pg`), and exposes ONE binary `ksor` with all verbs:
    `init`/`dev`/`build` plus `serve` (runs the gateway IN-PROCESS, a direct
    import), `ingest`/`schema`/`calibrate`/`gc` (delegated to the bundled
    write-plane dispatcher). So an adopter installs ONE thing — `@panaversity/
ksor` — for everything, and the content SoR is always present. This
    REVERSES the decision-1/13 zero-runtime-deps guarantee for the CLI (by
    owner call, weighed against a separate package): the cost is that
    `npx @panaversity/ksor init` now pulls ~60MB; the win is no second package
    to publish (the existing `@panaversity/ksor` publish + trusted-publisher
    setup covers it) and no spawn/resolve dance. `content`'s `schema.sql` ships
    as `ksor/schema/` (build-copied, gitignored, resolved via
    `import.meta.url`). `postgres`/`content`/`gateway-kit`/`content-gateway`
    stay `private: true` forever — dev/test workspace packages, bundled, never
    published. Verified by a real `pnpm pack` → `npm install` in a fresh dir:
    `ksor serve`/`ksor schema`/`ksor ingest` run, schema resolves, deps are
    self-contained. The prior revision (separate `@panaversity/ksor-content-
gateway` package, serve-by-spawn) is superseded._

13. **The content gateway's HTTP door composes the SDK's Web-standard
    transport, not a hand-rolled one** (owner-directed, 2026-08-19). The MCP
    surface IS the product; shipping a door hand-built on `node:http` — which
    reimplemented routing, body parsing, security headers, and the loopback
    DNS-rebind default that the SDK already gets right, and in which three
    security review findings landed — is shipping bad MCP for the one thing
    that is the point. The door uses
    `WebStandardStreamableHTTPServerTransport` (`Request → Response`,
    stateless) behind Hono, with Host validation as middleware (the shape the
    SDK's deprecation of its transport-level option points to) and
    `secureHeaders` / `bodyLimit` middleware replacing the hand-rolled
    hardening. `hono` and `@hono/node-server` are declared runtime deps of
    the content-gateway — already the MCP SDK's own transitive deps, so zero
    new install bytes. What stays ours because it is good: `buildAuth` and the
    fail-closed boot posture, the three probes, and the whole content kernel.
    Reversed only if the SDK drops the Web-standard transport. _Revision
    2026-08-20: the transport choice stands unchanged. The packaging
    sub-claim that these deps "never reach the published zero-dep `ksor` CLI"
    and "the gateway can never fold into it" is SUPERSEDED by decision 12's
    2026-08-20 revision: the gateway IS bundled into `@panaversity/ksor`, which
    now carries `hono` + `@hono/node-server` (guard rule 5 enrolls them) and is
    no longer zero-dep. The SDK's dependency weight is now install weight of the
    one published package, not a reason to keep two._ _Revision 2026-08-20 (SDK
    v2): upstream split the monolith into `@modelcontextprotocol/server` +
    `@modelcontextprotocol/client` 2.0.0 (GA 2026-07-28) implementing the
    **2026-07-28** revision, and the gateway moved to it before shipping — this
    PR is the MCP surface's first release, so shipping it on a superseded
    revision would have made the product's headline surface out of date on day
    one. The transport choice STANDS: v2 keeps
    `WebStandardStreamableHTTPServerTransport`. What changed is the entry — the
    door now composes v2's `createMcpHandler` (per-request server factory,
    `legacy: "stateless"`, `responseMode: "json"`) instead of hand-driving a
    transport per request, because the modern era is served by that entry and
    NOT by a bare transport (proved by probe: the bare wiring answered
    `server/discover` "Method not found" and rejected the 2026-07-28 header as
    "Unsupported protocol version"). 2025-era clients keep working through the
    same stateless idiom, so the upgrade is not a cutoff. v2 also deprecates its
    transport-level `allowedHosts`/`enableDnsRebindingProtection` in favour of
    external middleware — which is what this door already does. Dependency
    weight falls (`server` → `zod` + `core`; the Node middleware is
    `@hono/node-server`, already carried) rather than rising._

14. **Takedown denial is scoped — per-node by default, subtree by explicit
    opt-in** (owner, 2026-08-19). A review found the ported denial was
    per-node only, so a section takedown left its documents served. Rather
    than flip the whole mechanism to subtree (a governance reversal), scope
    is a property of the takedown row: `scope = 'node'` (default) denies
    exactly the listed `stable_id` — identity, immune to reorganization, an
    auditable frozen list; `scope = 'subtree'` denies the node AND every
    descendant, resolved at SERVING time by a recursive `parent_id` walk.
    Serving-time (not write-time expansion) is required because
    `takedown_denylist` has no generation column by design — a subtree deny
    must also cover descendants a FUTURE re-ingest adds. The walk is by
    `parent_id`, NOT a `stable_id` prefix — a frontmatter `sor_id` override
    decouples stable_id from the path, so a prefix both leaks sor_id children
    and over-matches prefix-siblings (both proved in `takedown.db.test.ts`).
    One seam (`lib/takedown.ts`: `DENIED_CTE` + `DENY`) binds search, read,
    outline, and the calibration sampler; an empty denylist makes the seed
    empty and the recursion terminate at once, so the hot path pays nothing.
    Schema: `takedown_denylist.scope` (schema_meta 2.1, additive with a
    default → a 2.0 reader still reads a 2.1 DB). When the `takedown` write
    verb lands it must make a container selection an EXPLICIT choice —
    expand to leaves (identity) or declare a subtree rule — never silently
    guess. Reversed per-clause with evidence; the `node` default is not
    reversible without an owner decision (it is the identity guarantee).

**Open questions — decide independently when the work arrives:** ~~how
retrieval and abstention are implemented for `serve`~~ — decided 2026-08-19,
decision 11: the predecessor kernel converts (revision trail: recorded as
settled "stays Python" 2026-08-17, reversed to "either" 2026-08-18). PyPI
`ksor` is left unclaimed on purpose (a PyPI pending publisher reserves nothing
— only an upload claims a name); revisit only if the exposure changes.

**The two the SECOND record forces** (surfaced 2026-08-20 while renaming the
floor package; neither blocks the content SoR, both must be answered before
`ksor-identity` exists, and neither is a naming question):

1. **Which half of `schema.sql` is governance, not content** (issue #17). The schema owns
   two kinds of table. Content-shaped: `content_nodes`, `chunks`, `sources`,
   `node_centroids`, `slug_aliases`. Generic to ANY record: `corpora`,
   `ingestion_runs`, `schema_meta`, `takedown_denylist`,
   `ingest_tenant_grants`, `retrieval_log` — generations, takedown, ingest
   authorization and the provenance trail are machinery every SoR needs
   IDENTICALLY, and they are where the product's guarantees live. A second
   record either forks them (and the guarantees drift per record — the failure
   mode) or shares them (and something must own the shared half). The roles are
   already namespaced `sor_content_*`, so the split is half-anticipated. Decide
   before duplicating, because duplicated governance is the one duplication
   this project cannot afford.
2. **The bundling ceiling** (issue #18). Decision 12 inlines the whole kernel into the one
   published CLI — ~60MB with ONE record. Three records put content + identity
   - praxis and their dependencies into every `npx @panaversity/ksor init`,
     including for adopters who will never climb to a served rung at all. The
     answer is either selective bundling or separately installable records; what
     is NOT available is "keep inlining everything", so the decision arrives with
     the second record whether or not it is taken deliberately.

## Product principles

1. **Docs are priority #1.** Agents read the docs before they ever run the
   product; for a knowledge system of record, the docs are the product twice
   over.
2. **One source, two surfaces.** The site and the MCP surface must render the
   same corpus build — never let them read different truths. Adding a surface
   must never require editing a corpus.
3. **Identity derives from file path.** A doc's path is its ID, its site route,
   and its MCP resource URI. No authored `id:`/`name:` fields — the corpus
   check rejects them.
4. **Errors are documentation.** Every failure states what is wrong, why the
   rule exists, and how to fix it. The CLI's exit codes are a contract
   (1 refused, 2 not implemented, 3 environment), and when refusals gain
   detail, the first stderr line is a stable machine-readable slug.
5. **Abstention is a feature.** "Not in this corpus" is a correct answer, never
   an error, never a licence to fall back on model knowledge.
6. **Provenance is load-bearing — and provenance is not correctness.** Every
   build must record the exact corpus that produced it (`build.lock.json`,
   lands with `ksor build`); every answer must trace to a governed source.
   Provenance proves who-said-when; the expert judgment of whether a source is
   right is a separate mechanism — never sell one as the other.
7. **Governance is a ladder, not a gate.** Level 0 works immediately; projects
   climb only as far as their domain needs. Demanding level 4 of a level-0
   project is a bug, not rigour.
8. **Discoverability determines whether agents find you at all**: bundled docs,
   `llms.txt`, an MCP registry entry, a typed SDK.

## Product invariants

Bought with measurements in the predecessor; they bind each slice of code as
it lands here, and tests assert them from day one of that slice:

- **The generation is the authorization.** Every citation carries it; a
  surface refuses content whose generation is not published.
- **Fail closed — once a floor is declared.** A declared-but-uncalibrated
  floor refuses. A corpus that declares no floor has the gate off, and the
  surface says so honestly (uncalibrated — will not refuse out-of-corpus
  questions). Honest absence, never silent weakness.
- **Never copy a calibrated constant between corpora.** Recalibrate; record
  the measurement and its date beside the number — and record negative results
  beside the constant they explain.
- **Zero chunk overlap.** Concatenating a node's chunks in order reproduces
  the body byte-exact.
- **Reproducibility is a testable claim.** Same corpus tree + same toolchain
  ⇒ same `build_id`. Test by building twice and diffing `build.lock.json`.

## How we work

1. **Test-driven, red first.** Acceptance and tests are written before the
   implementation and watched failing for the right reason; the
   implementation's job is to turn exactly those red lights green. Load
   $implement-spec before writing the first line. An aspect with no test
   planned is a hole in the plan, not a TODO.
2. **Small, composable units.** One responsibility per module; behavior lives
   in small pure functions composed upward; the CLI stays a thin caller of
   library functions (the boundary suite enforces that nothing imports it).
   Prefer composing what exists — net-new code states why composition failed.
3. **Never write the present tense about behaviour that does not run.** If it
   is not built, say "will". This is the rule that protects all the others.
4. **One fact, one file** — everywhere else is a pointer.
5. **Cite `file:line` against pinned SHAs, or say you do not know.**
6. **Supersession is visible.** A reversed decision keeps its entry and gains a
   revision note; superseded documents live in git history, not the working
   tree.
7. **Smallest change that proves the next assumption.**
8. **One obvious way.** Agents sample across options; a golden path is a
   compatibility guarantee.
9. **Never carry a mechanism across without asking what it was for** — from
   the predecessor or anywhere else.
10. **Governs acts, not artifacts.** Ask of every mechanism: which act does it
    constrain, who performs it, and what row exists afterwards proving they
    did — never merely what field it adds to a register. Rights checked at
    ingest but not at serving, approval attached to a corpus but not to an
    answer — those fail this test.
11. **Every change names its business claim** — the promise in "What we claim"
    it serves. Work that cannot name which claim it serves does not get built.

**Specs — where they count, never for small things.** A change gets a spec at
`specs/<area>/<feature>/spec.md` only when it alters a public surface (CLI
verbs, scaffold contents, MCP tools, `build.lock.json`, response envelopes),
crosses a package boundary, is expensive to reverse, or will be built
unattended by an agent. A spec is one page: status, the business claim it
serves, the observable contract, acceptance, out-of-scope. Where spec and code
disagree, the code wins and the spec is corrected in the same commit. Specs
cite the research they distill; guard rule 8 enforces the frontmatter
(status + claim). `specs/` appeared with its first spec: `specs/base-env/`.

## Coding principles

1. **Code is liability — and so is context.** Every net-new snippet, file, and
   skill earns its right to exist; cut what stops earning it.
2. TypeScript strict, pure ESM, no `require()`, no `any`. **Derive types from
   values wherever a value already holds the truth** (`as const`, schema
   inference — a hand annotation wider than the value is a downgrade); declare
   them **explicitly at the exported boundary** (`isolatedDeclarations`
   enforces this) and wherever the type carries a constraint no value
   expresses (brands, discriminated unions that encode a protocol). Never
   depend on the TypeScript compiler API — TS 7 has no stable one until 7.1
   (guard rule 6).
3. Runtime dependencies need a recorded decision (guard rule 5). Wrap
   third-party libraries at a boundary module so they stay replaceable.
4. Pre-1.0: prefer breaking changes. Correctness and simplicity over backwards
   compatibility; no legacy fallback paths.
5. Comment why, not what. Default to no comment.
6. If a guard fails, fix the violation. Guards have no suppression mechanism;
   a rule that must land against existing violations lands together with the
   fixes.
7. Package boundaries are enrolled, never implied: every workspace package
   appears in `ALLOWED` in `scripts/boundaries.integration.test.ts`, declaring
   what it may import.

## Testing

Two tiers by filename convention; pick the tightest tier that can express the
assertion.

- `*.test.ts` — unit, colocated (packages `src/` and `scripts/`): pure, no
  fs/subprocess/network (<3s total)
- `*.integration.test.ts` — built artifacts, subprocesses, repo-tree scans,
  tmp dirs (<15s)

Agent evals land with `ksor serve` (CI-only — they spend model tokens), in
three classes, and being explicit about which class gates is the design:
**behavioural** evals gate (abstains out-of-corpus, citations resolve,
unpublished generations never served); **relevance** evals are reported, never
gating — their gold is generated from the corpus under test, so a wrong rule
would generate a gold question that blesses the wrong rule; **correctness**
evals are externally authored and ratchet — the baseline may only grow.
Out-of-corpus probes must include scope-adjacent near-misses, not only
far-domain questions. Every suite includes at least one question whose only
passing answer is the abstention.

Three rules paid for with shipped defects (post-mortems in
`research/handover-vsor-to-ksor.md`):

- **Assert on shipped bytes and computed values, not behavior alone.**
- **The test tier must install the same tree the artifact installs.**
- **A failing assertion must print the value it actually saw.**

## Documentation

Update docs in the same PR as the behavior change; run `pnpm check:corpus`
before handing off.

Do not rely on training data for claims about ksor. In order: 1 source, types,
and tests · 2 real CLI output · 3 existing docs · 4 merged PRs and the
changelog. `research/` plans are intent, not behavior — cite as "planned".
For third-party systems, fetch current official docs; don't recall them.
Corpus documents name their sources precisely and copy load-bearing values
exactly; superseded documents are marked, never deleted. Any tree, count, or
list rendered into a doc is generated from source with a drift test, or not
rendered at all.

## Changesets and releases

Every PR changing anything under `packages/ksor` needs a changeset — bundled
docs included, they ship in the tarball (and the CI gate watches the whole
package directory). Repo docs and tooling outside `packages/ksor` are exempt.
Patch by default pre-1.0; minor only for public-API breaks. Write the body
for release-notes readers.
Check: `pnpm changeset status --since=origin/main`.

Releases publish only from CI (`release.yml`: changesets action + npm trusted
publishing, full gate runs in the same job). Never run `changeset publish` or
`npm publish` locally; never cancel a running release — the concurrency group
queues.

## Skills

Always-on policy lives in this file; deep workflows live in skills and never
duplicate this file — they go deeper.

- $implement-spec — the implementation discipline: red-first, live
  verification, detail pass, truth sweep
- $release — the release airlock, pre-publish testing, and the red-Release
  runbook (trusted publisher, org PR-permission, snapshots)
- $find-skills — discover/install ecosystem skills (hash-pinned in skills-lock.json)
- $skill-creator — vendored (anthropics/skills): create, improve, and eval skills
- $mcp-builder — vendored (anthropics/skills): MCP server design and tooling,
  for the `serve` slice

The contract for authoring one: frontmatter `name` equals the directory name
(guard rule 3), the `description` is the trigger — name the tasks and phrases,
bump `metadata.version` on every edit, and a new skill must beat its absence
in a with/without comparison recorded in the PR — a skill nobody can show
winning is deleted. Vendored skills (hash-pinned in `skills-lock.json`) keep
their upstream frontmatter untouched.

## Commit and PR style

Imperative, concise commit subjects. PRs describe problem → solution →
behavior for a reviewer, not a file list. Leave PRs in draft; a human marks
ready.

## Authority, and definition of done

1. **The code beats every document.** Where they disagree, correct the
   document in the same commit.
2. **This file** is authoritative on vocabulary, decisions, invariants, and
   process.
3. **`docs/status.md`** is the only authority on what is actually built.
4. **Superseded documents live in git history, not the working tree.**

Done means: red tests written first are green; acceptance passes on a clean
machine; any document the change made false was corrected in the same commit;
review findings were fixed or recorded, never quietly dropped.

## Do not

- Do not weaken provenance, citation, abstention, or governance to make a test
  pass.
- Do not add runtime dependencies without a recorded decision (guard rule 5).
- Do not author `id:`/`name:` fields where the path is the identity.
- Do not edit ALLOWED import graphs without review.
- Do not commit `.only` or skipped tests (guard rule 7 rejects them).
- Do not carry a predecessor mechanism across without asking what it was for,
  and never without tests here — conversion is granted (decision 6), blind
  copying is not.
- Do not create `knowledge/`, `governance/`, or `instance.md` at this repo's
  root — those belong to scaffolded projects (the fixture lives under
  `workbench/`).
- Do not create GitHub issues/comments or publish packages on your own
  initiative.
