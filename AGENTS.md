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
   agent); **serving fails safe** (serve refuses to boot unauthenticated at
   all — a local run flags it explicitly and binds loopback; a public bind
   additionally fails closed unless auth is configured — "disabled by default"
   must never silently become an open server); **the governance level is derived, never declared**
   (tools report the level the governance artifacts achieve; no `governance:`
   key in `instance.md`); **no empty scaffolded directories** (an empty
   directory is an unanswered question in the adopter's repo — directories
   appear when the ladder or the work demands them); **the site is preview and
   review, not an editor** (the agent writes; the human checks).
   _Revision 2026-08-20: the serving clause read "local serve binds loopback
   with auth off", describing a default the code has never had — `buildAuth`
   refuses to boot unless SSO is configured OR `KSOR_AUTH=disabled-local` is
   explicit, loopback included (`packages/gateway-kit/src/auth.ts`). The
   posture is unchanged and STRONGER than the sentence claimed; the wording is
   corrected here and in the three docs that had copied it (both READMEs and
   the scaffold's AGENTS.md), which were telling adopters a local `serve` would
   come up without the flag it requires._

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
   unauthenticated, so `KSOR_AUTH=disabled-local` is required for a local run, and
   a runbook that omitted it dead-ended at its last step (found live). An empty
   directory is an unanswered question; a named, commented example of the
   variables a rung needs is an ANSWERED one, and it is the only place those
   values can live without being pasted into a shell. `.gitignore` gains
   `!.env.example` so the example survives the `.env*` rule that hides real
   secrets._ _Revision 2026-08-23: the closed root set gains TWO more,
   `Dockerfile` and `.dockerignore`. The reasoning is the `.env.example` one
   applied to the surface that IS the product: MCP serving is core (decision 11
   revision 2026-08-20), a served record therefore has to reach a host, and
   every container runtime asks for exactly these two files. Emitting them is
   what makes "vendor-free is the ownership argument" true in the artifact
   rather than only in the prose — the Dockerfile names no host, and
   `vercel.json` POINTS AT it instead of replacing it, so moving hosts is a
   redeploy and not a rewrite. A test asserts that neutrality directly, because
   it is cheap to lose to one convenient host-specific line and nothing else
   would go red. The same revision extends `vercel.json` from one static build
   to two services (site + door) behind one domain. Verified live before it
   shipped, and the verification earned its cost: a project-level
   `trailingSlash: true` — harmless while the project was static-only —
   308-redirected **every door route including `POST /mcp`**, which would have
   broken the MCP endpoint of every adopter who deployed. It is removed; the
   site's own Next config already sets it where it belongs._
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
   always; no selector was added._ _Revision 2026-08-24 (owner): the
   second shell is RETIRED — `workbench/shells/docusaurus/` deleted, the
   conformance suites run one. Every surface the record grew had to be built
   twice to keep it green, for a shell no adopter runs (`ksor init` has always
   emitted Fumadocs, no selector). The five-clause surface contract is
   unchanged and still asserted against one implementation; both suites keep
   their `.each(SHELLS)` shape so adding a shell back needs no restructuring.
   Restored by an adopter actually swapping one; the recipe is in git history.
   **Consequence to hold onto:** this removes the structural objection to
   reversing the `output: "export"` clause, since a Docusaurus shell could
   never satisfy a Next-server contract. That reversal is now CHEAPER, not
   decided — it still contradicts `specs/ksor/visibility/spec.md`, and site
   auth does not authorize it (issue #130)._

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

    _Revision 2026-08-22 (issue #54): `@google/genai` is REMOVED. It was 17 MB
    installed and brought 30 transitive packages with it — 54 MB and 52
    top-level packages for a `ksor init` that needs neither — to make exactly
    two HTTP calls that `providers/gemini.ts` already wrapped behind a
    structurally-typed client slice. `lib/providers/gemini-rest.ts` implements
    that slice with `fetch`: **22 MB, 22 packages**. The swap was gated on one
    measurement taken BEFORE any code was written — SDK and REST return
    byte-identical vectors for the same text, model, `outputDimensionality` and
    `taskType` (max per-component difference 0.000e+0 at 1536 dims), so no
    stored embedding and no calibrated floor moved. Had they differed by a
    rounding step this would have silently invalidated `vector_floor` on every
    record. The seam is unchanged and still vendor-neutral, so a provider that
    prefers an SDK can supply one through `clientFactory`; the live call in
    `gemini.live.db.test.ts` remains the drift tripwire and now meets the vendor
    without a library in between. Reversed if the vendor's REST contract starts
    changing faster than we can follow it, which the live test is what would
    tell us._

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
    default → a 2.0 reader still reads a 2.1 DB; 2.2 adds the governance
    columns the same additive way). When the `takedown` write
    verb lands it must make a container selection an EXPLICIT choice —
    expand to leaves (identity) or declare a subtree rule — never silently
    guess. Reversed per-clause with evidence; the `node` default is not
    reversible without an owner decision (it is the identity guarantee).

15. **Governance is stored on the record, not re-derived per surface**
    (2026-08-20, from the end-to-end review). The ingest adapter kept four
    frontmatter keys and dropped the rest, so `visibility`, the authored
    `status`, `owner` and `provenance` existed only in markdown and each
    surface implemented its own subset — the site enforced `visibility:` and
    the MCP door could not, because the record did not carry it (a document
    marked `visibility: internal` was hidden from the website and served in
    full to every agent, reproduced live). Schema 2.2 puts them on
    `content_nodes`; ONE frontmatter module reads them; `lib/audience.ts` is
    the single serving seam, bound the way `lib/takedown.ts` binds denial. A
    new guarantee about a document is a COLUMN plus a seam, never a filter in
    one surface's build step. Reversed only by an owner decision recorded here.

16. **Forward migrations exist and are walked, not sorted** (2026-08-20).
    `schema/migrations/<from>-<to>__<slug>.sql`: each file names both ends of
    its step, so a missing step refuses instead of being silently skipped, and
    each applies in one transaction with the `schema_meta` row recording it.
    `schema.sql` remains the DDL source of truth for a FRESH database. This
    retires "drop and recreate", which destroyed the two tables that cannot be
    rebuilt from markdown. Reversed only with a recorded replacement.

17. **A pool with a floor of ZERO — not a connection per call, not a pinned
    set** (owner-directed, 2026-08-21). The question the owner asked is the
    right one for a product that will run on Cloud Run against a serverless
    Postgres: who holds a connection, and for how long. Three postures were
    weighed and the middle one is ours.

    _Connect per call_ pays a full handshake on every request. Measured
    locally (Postgres 17.7, loopback, no TLS, n=30): a fresh connect + trivial
    query is **3.02ms** median against **0.15ms** on an open one — a **2.87ms**
    floor under every request that does no work at all. A remote TLS endpoint
    is materially worse, because the handshake adds round trips this local
    number does not contain. Paying that per request buys nothing an idle
    timeout does not already buy.

    _A pinned pool_ (`min: 2`, which ksor inherited from the predecessor) is
    the posture the owner objected to, and the objection was correct — more so
    than it looked. pg-pool reaps an idle connection ONLY while the pool is
    above `min` (pg-pool 3.14 `index.js:409`), and it does not open anything
    eagerly. So a non-zero `min` does not prewarm: it pins that many sockets
    open forever and prewarms nothing. The predecessor's psycopg pool DID
    prewarm, which is why 2 was reasonable there; ksor took the number without
    the mechanism and got the cost with none of the benefit. Against a compute
    that suspends on idle, those pinned sockets are also the ones most likely
    to be dead on the next request.

    **What ships: `min: 0` with a 10-second idle timeout.** A server that is
    quiet for ten seconds holds NOTHING — no socket, no backend, nothing for a
    suspend to kill and nothing billed on a per-connection plan — which is the
    "connections are closed" property, obtained by expiry rather than by
    per-request teardown. Inside a burst, connections are reused and the
    handshake is paid once. `prewarmPool` exists for the deployment that wants
    warm sockets and asks for them explicitly; it is never implied by `min`.

    This posture is only safe because the reconnect path is real, so it is
    part of the decision: `withGuardedClient` keeps an error listener attached
    for the whole checkout (pg-pool removes the client's own during one, and a
    socket dying mid-statement then reaches Node as an uncaught exception and
    exits the process), and `acquire` distinguishes a saturated pool from a
    slow connect so a cold reconnect is retried rather than reported as
    exhaustion. Held by `idle.db.test.ts`, `checkout-error.db.test.ts`, and an
    MCP-client suspend/resume test that terminates every backend and asserts
    none survived before the next call answers.

    Walked live 2026-08-21 against a served record: Postgres stopped under the
    running gateway → the in-flight request returned "content store temporarily
    unavailable" and the process stayed up; Postgres restarted → the FIRST
    request answered with cited hits; SIGTERM → drained in 0.34s with the port
    released and no orphan.

    Reversed if a deployment target makes per-request connection genuinely
    cheaper (a local pooler sidecar would), or if a measurement here shows the
    idle window costing more than it saves.

    _Revision 2026-08-21: the posture the reversal clause names is now an
    OPT-IN rather than a fork — `KSOR_DB_CONNECT_PER_REQUEST=1` releases every
    connection with destroy, so each call opens and closes its own. The default
    is unchanged and unchanged for the same reason: measured on loopback,
    per-request costs **2.58ms/call** against **0.13ms** pooled, and a remote
    TLS endpoint widens that gap rather than narrowing it. What the option
    buys is not a property the default lacks — a quiet server already holds
    ZERO — it is the deployment where a pool is a fiction: an external pooler
    sidecar, or a runtime that reuses no process between invocations. Both
    postures are asserted in `connect-per-request.db.test.ts`, including the
    measurement, so the default stays a choice rather than a habit._

18. **One rule, two surfaces, one table** (2026-08-21, from the visibility
    leak's fourth recurrence). The site and the kernel enforce the SAME
    visibility rule in two languages — TypeScript in the site's build, SQL in
    the serving predicate — and it drifted four separate times while each
    side's own tests stayed green, because each side was internally consistent
    with itself. So the rule stops living in two heads: `AUDIENCE_CASES`
    (`packages/content/src/lib/audience-conformance.ts`) IS the rule, as a
    decision table; the SQL predicate is asserted against every row through
    real Postgres, and the TypeScript half against the same rows.
    The TypeScript rule itself is ONE canonical file
    (`packages/content/src/lib/audience-rule.ts`), copied byte-identically into
    the scaffold — the site cannot import the kernel, whose package carries pg
    and the embedding providers, so the copy is asserted by a drift test rather
    than trusted. A surface that drifts now fails on the ROW it broke.
    Extends to any guarantee two surfaces must both honour; the next one is
    takedown, which is already single-seam on the serving side. Reversed if the
    site ever can import the rule directly, which would make the table a
    convenience rather than a guard.

19. **A surface that refuses must refuse on BOTH surfaces** (2026-08-21, from
    the governance review). Product principle 2 says the site and the MCP door
    render the same corpus; the sharper form is that they must also REFUSE the
    same corpus. Two states had the site stopping by name while the door came
    up clean and served the restricted half: a generation built before
    governance reached the node row (schema 2.2 added `visibility` and a
    migration cannot backfill frontmatter, so every carried-forward node reads
    as the widest tier), and a document declaring `visibility:` in a record
    that declares no `audiences:` (an author restricted something and nothing
    enforced it). Both are now boot checks in `assertGovernanceServable`, and
    schema 2.4 stamps each generation with the schema it was built against so
    the first is detectable at all. When a new refusal lands on either surface,
    the question to answer is what the OTHER surface does in that state.
    Reversed only by an owner decision recorded here.

20. **The keyword arm stays in Postgres — never reimplemented in JS**
    (2026-08-21, from an adversarial review of the artifact rung). A
    database-free serving rung is more feasible than it looks: exact int8
    cosine in plain JS measures 19ms at 5,000 chunks and beats HNSW on RECALL
    because it is exact rather than approximate, the abstention gate reads only
    the VECTOR arm, and the denial seam already exports JSON. The blocker is
    not the vector arm — it is `websearch_to_tsquery`. Its parsing, stemming
    and stop-word behaviour diverge from any reimplementation SILENTLY: no
    error, just a different set of matches. And this record's own gold shows
    how little room that leaves — in-corpus 0.730 / 0.671 against a
    scope-adjacent near-miss at 0.683 (`behavioural.db.test.ts`), so the
    abstention decision turns on about one hundredth. A tokenizer that stems
    one word differently moves which questions get answered, and nothing goes
    red. Reversed only by a measurement showing a JS implementation agreeing
    with Postgres across the gold set — which is a bigger project than the arm
    it would replace.

21. **A governance act NAMES its actor; the tool never guesses one**
    (2026-08-21, same review). `--actor` fell back to `$USER` / `$USERNAME` /
    `"operator"`, so a ledger row read `runner` under CI and `root` in a
    container: a self-asserted string wearing a schema, indistinguishable from
    a person who was never there. `retrieval_log.actor` is `NOT NULL` with the
    comment "NO default: unset errors loudly" — and the fallback is precisely
    what stopped it erroring. `ksor takedown` now REFUSES a denial or a
    revocation without `--actor`, before the DSN is even resolved (a missing
    actor is an argument error, not an environment one). Read-only modes need
    nothing. This is product principle "honest absence, never silent weakness"
    applied to attribution, and it generalises: a column that records WHO must
    never be populated from ambient state. Reversed only by an identity source
    the tool can VERIFY rather than read — a bearer token's subject qualifies,
    an environment variable never will.

22. **Navigation is a SHAPE, not a length** (2026-08-22, issue #55 — the first
    DELIBERATE divergence from the converted oracle). `classify()` labelled any
    segment under 250 code points `nav`, and the serving predicate admits only
    `prose`, so a record could be fully ingested and unable to answer questions
    it plainly contained. On the curriculum corpus the oracle was tuned against
    the proxy holds — a short segment there really is a link list. On a handbook
    it inverts, because a handbook's most valuable statements are its shortest.
    Walked live on 0.0.14: three ordinary policy statements, three of four
    chunks unsearchable, and "how long does a buyer have to send something back"
    answered with the scaffold's placeholder against a record stating thirty
    days.

    A segment is now `nav` when link lines are most of it, or when what remains
    after them is under `MIN_CONTENT_CHARS` — the SAME floor the serving
    predicate applies, so this never labels `prose` something search would
    refuse anyway. Length is not consulted: a 180-character link list is nav and
    a 51-character fact is prose, which is the ordering length got backwards.

    Measured on the handbook gold, real Gemini embeddings, paired: short
    substantive facts **0/9 → 9/9 at rank 1**, the long-prose control held at
    **4/4**, and the link-list negative was returned **0** times — so the gain
    is correctness rather than permissiveness, which is the distinction the gold
    was built to make. Recorded in `evals/baseline.ts`; the harness prints
    current against it and the floors may not fall silently.

    `CHUNK_POLICY` moves v5 → v6 because it is persisted provenance and the
    behaviour it labels changed. The oracle fixture is NOT regenerated — it
    stays the record that the port was faithful — and the divergence is asserted
    as a property instead: sourceType may differ only `nav` → `prose`, only
    where the whole section carries real prose, and everything else stays
    byte-identical. That corpus cannot settle the question either way; it
    contains no markdown links at all, which is asserted so the next reader does
    not mistake its 61 `nav` labels for evidence about navigation.

    Adopters get it by re-running `ksor ingest`: chunks are re-classified on
    every build, and carry-forward sets only the embedding fields
    (`ingest/generation.ts:174`), so unchanged content is not re-embedded.
    Reversed only by a measurement showing the shape rule admitting navigation
    the length rule kept out.

23. **The tool surface is adopter-owned CODE; the guarantees under it are
    verified, not prevented** (owner-directed, 2026-08-23). Agents are the
    operator, and an agent pays for a record's tool surface out of its context
    window — twice. Measured on the live 81-document book: the three tool
    definitions cost **~2,990 tokens, always resident**, and one `search` at the
    default `k=10` costs **~3,541 tokens per call**. A record could change none
    of it.

    `ksor init` emits the REGISTRATION — ordinary `registerTool` with ordinary
    zod — into `system/gateways/content.ts`. A config API (`defineGateway`) was
    built first and discarded: models are trained on the MCP SDK and on zod, not
    on our field names, and a config schema can only ever expose what we thought
    of, while `registerTool` lets a record add its own tools.

    What stays in the package: the handlers, the output schemas, and the FLOOR
    text. Handlers because they are the only thing that can prove a passage came
    from the governed record — a hand-written one returning fabricated hits with
    plausible `stable_id`s passes every shape check there is.

    **The exchange is prevention for verification.** A description is now a
    template literal in adopter code, so nothing structural stops someone
    dropping the floor. The door therefore inspects its OWN served surface at
    boot — in-memory transport, full MCP handshake, `tools/list` — and refuses
    `ksor-gateway-floor-missing`. That is this codebase's posture everywhere
    else (`assertGovernanceServable`, decision 19, decision 18's table): hand the
    code over, then refuse to boot on a state that breaks it. Verified live: a
    registration that dropped `FLOOR.search` exited 1 naming the tool and the fix.

    Two copies of the registration exist — canonical in the package, emitted in
    the scaffold, differing only in the import specifier and pinned by a drift
    test. That is FORCED, not chosen: Node refuses to type-strip any `.ts` under
    `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, verified
    directly), so the package cannot import its own emitted template as the
    fallback for a deleted file.

    `@panaversity/ksor/gateway` re-exports `z` and `McpServer` so a registration
    stays a FILE — no package, no build step, no dependency the scaffold must
    declare — and so the SDK validates with the same zod instance it was built
    against.

    Costs recorded rather than argued away. **Renaming tools trades away
    cross-record familiarity** (working rule 8); the owner weighed it and chose
    renaming, because disambiguating several attached records is the commoner
    problem. **A public subpath export is a real pre-1.0 API commitment** and is
    the reversible half of this decision. **A tool an adopter adds carries no
    ksor provenance claim**, and making that visible to an agent is left open.

    Two defects found while building this, both of the same shape — framework
    text retyped instead of moved — and both now guarded: a dropped
    injection-defence paragraph in the outline floor (`FLOOR_GUARANTEES`), and a
    retyped `READ_OUTPUT` serving `content` where the record serves `text`
    (`served-surface.golden.json`). Neither was caught by typecheck, unit tests
    or the build; both were caught by comparing against what the door actually
    serves. Reversed only by an owner decision recorded here.

24. **Study attachments are part of their parent, and the collection is where
    that is enforced** (2026-08-23, porting the predecessor's summaries and
    flashcards under decision 6). A document may carry `<doc>.summary.md` and
    `<doc>.flashcards.yaml`. An attachment has no route, no sidebar row, no
    `llms.txt` line, no markdown twin, no search entry, no stable id and no MCP
    node; it inherits its parent's tier and its parent's takedown entirely.

    **One exclusion, not six.** The route table, the sidebar, `llms.txt`,
    `llms-full.txt`, `/md/`, the search index and the caveat map all read
    `source`, and `source` is built from ONE collection — so `files:
["**/*.md", "**/*.mdx", "!**/*.summary.md", "!**/*.summary.mdx"]` on that
    collection is the whole of "an attachment is not a document". Subtracting
    per surface is the failure mode `research/visibility.md` §4–§5 names, and
    pruning the page tree is not even sufficient: `getSortedPages()`
    deliberately re-adds what the tree dropped and the search index never reads
    the tree. The existing `meta` collection is pinned to `meta.{json,yaml}` in
    the same change — verified against the real record, its default glob
    (`**/*.{yaml,json}`) swallows every deck.

    **The site-only scope was breached by exactly one predicate, deliberately.**
    `isDoc` (`packages/content/src/ingest/adapters/plain-tree.ts`) is a bare
    suffix test, so `x.summary.md` ALREADY ingested as a node with
    `stable_id: knowledge/x.summary` — one cause wearing four costumes: the
    door served a summary the site hides; served an internal parent's summary
    at the record default tier; served a taken-down parent's summary undenied
    (per-node denial matches a different id, and the subtree walk goes through
    `parent_id`, which is the enclosing SECTION, not the sibling document); and
    served an orphan the site refuses. Leaving ingest alone was not the
    conservative option, it was shipping the leak — critical rule 1.

    **Refusals, not defaults.** An attachment with no parent is refused
    (`ksor-attachment-orphan`), and an attachment declaring frontmatter is
    refused as a CLASS (`ksor-attachment-frontmatter`) rather than by
    allow-listing keys — one rule closes `visibility:` widening, `sor_id:`
    takedown escape and `status:`/`owner:` claiming governance a non-node
    cannot carry. Both live in the build as well as in `pnpm check`, because
    staging never depends on the checker having run.

    **Two predecessor mechanisms were NOT carried, both defects.** Its spaced
    repetition is write-only — `useFSRS` computes a due queue its deck never
    reads, rendering `deck.cards` in authored order, so the scheduling
    influenced nothing a learner saw. And its deck-version reset does not
    exist: it logs, while the toast it raises says progress "was reset due to a
    deck update" and fires only from the `JSON.parse` catch, i.e. storage
    corruption. Here the queue drives the session, and a card is identified by
    a hash of its own text so an edited card resets alone and the notice is
    true.

    **The scheduler names itself honestly.** `ksor-sm2-v1`, a two-grade SM-2
    variant, persisted with the state. Not FSRS (`ts-fsrs` was weighed at
    684 KB and zero transitive deps, and declined by the owner), no retention
    target claimed, and what it gives up is recorded beside the code.
    Contract: `specs/ksor/study-attachments/spec.md`. Reversed per-clause with
    evidence; the no-independent-id clause is not reversible without an owner
    decision, because it IS the governance guarantee.

    _Revision 2026-08-23: a THIRD kind, `<doc>.quiz.yaml`, on the same rule and
    with no new pattern — which is the test this decision was meant to face.
    Adding it touched the suffix list and nothing else about the guarantee: no
    route, no stable id, no MCP node, parent's tier and takedown, all
    inherited. It also settles issue #35's open question — "does an agent get
    the answers? Should it?" — without a mechanism, because ingest creates no
    node and there is therefore no row for `search` or `read` to return. And it
    routes around that issue's stated blocker rather than resolving it: a quiz
    is a FILE named after its document, not a `:::quiz` directive inside one,
    so `knowledge/` stays CommonMark with no grammar ratified. The directive
    grammar remains unratified and remains worth ratifying for other reasons.
    Contract: `specs/ksor/quiz/spec.md`._

    _One thing IS new, and is the reason this revision is recorded rather than
    silent: the quiz carries the predecessor's hygiene audit, converted as a
    REFUSAL instead of a script. Its own README lists these as bugs that
    shipped and were caught by students — every correct answer at one position
    across 9 quizzes and 451 questions — and its findings file, six weeks old,
    still reports 88% pick-longest in a file nobody fixed. That is what an
    advisory checker is worth, so here the checks run inside the schema and a
    quiz that fails them cannot be loaded at all. Thresholds diverge
    deliberately (60% floors, not its 15–35% distribution target, and no ratio
    rule below five questions) because a small bank cannot satisfy a
    distribution without the checker choosing an author's answers for them —
    which would be governance overreaching into content. Reversed by a
    measurement showing the floors refusing honest quizzes._

    _Revision 2026-08-24: a FOURTH and FIFTH kind — `<doc>.teaching.yaml` was
    built and then REMOVED (the owner's "teaching aid" meant the slide deck,
    not a pedagogy panel; it is recorded here because the removal is the
    decision, not an accident), and `<doc>.slides.yaml` ships. Again the
    suffix list changed and the guarantee did not, which is now three
    consecutive kinds added without a new pattern.

    What IS new is that a presentation has two possible sources, and the
    default is the one the record OWNS: `deck:` carries the slides and the site
    renders them. An embedded deck cannot be governed at all — it is not
    reviewed in the pull request, not versioned with its document, not
    withdrawn when the document is withdrawn, and it can rot to a dead link
    with nothing going red. So the linked mode exists for an adopter whose deck
    already lives elsewhere, and `ksor-slides-two-sources` refuses a file
    declaring both, because two presentations with nothing saying which governs
    is precisely the disagreement this product exists to settle.

    The linked frame is CLICK-TO-LOAD rather than always-on, which the
    zero-external-requests browser assertion forced and which is better than
    what it replaced: the site keeps working offline and behind a firewall, and
    a reader who only wanted the policy never announces that to a slide host.
    Contract: `specs/ksor/slides/spec.md`. Reversed per-clause with evidence._

25. **The scaffold meets the adopter's package manager** (owner, 2026-08-24,
    issue #28). Decision 1 makes Node the one prerequisite; requiring a
    SPECIFIC manager on top re-added the second-prerequisite tax that decision
    exists to avoid. `ksor init` now reads `npm_config_user_agent` and emits
    the invoking manager's scaffold — npm and bun alongside pnpm, each shape
    proven end to end (install, bin resolution, checker, full static build)
    before this landed and walked per-manager in CI. Unrecognized or absent
    falls back to pnpm, the most-protected posture. Selection is detection
    only — no `--pm` flag; the run that scaffolds is the run that knows the
    toolchain, and a wrong guess is re-run with the other runner. The pnpm
    scaffold is unchanged. npm and bun scaffolds declare `workspaces` in the
    manifest, ship no lockfile (the stamped CLI version cannot be pre-resolved
    into one — the tarball hash does not exist at template-build time; the
    README says to COMMIT the lock the first install writes), and carry the
    install-script denial (`.npmrc ignore-scripts=true` for npm; bun's own
    default refusal for bun). What neither can carry is pnpm's 48-hour release
    quarantine (`minimumReleaseAge`) — that absence is DISCLOSED in the
    emitted scaffold (owner chose disclosure over refusing the managers):
    honest absence, never silent weakness. This repo's own workspace stays
    pnpm (decision 5, untouched). Reversed per-manager if a manager's walk
    cannot be kept green; the disclosure clause is not reversible without an
    owner decision, because silence about a weaker posture is the failure mode
    it exists to prevent.

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

Three tiers by filename convention; pick the tightest tier that can express the
assertion.

- `*.test.ts` — unit, colocated (packages `src/` and `scripts/`): pure, no
  fs/subprocess/network (<3s total)
- `*.integration.test.ts` — built artifacts, subprocesses, repo-tree scans,
  tmp dirs (<15s)
- `*.db.test.ts` — real Postgres, gated on `KSOR_DB_URL` (`pnpm test:db`; CI
  provides the service). The kernel's guarantees are SQL, so the tier that runs
  them against a real database is where they are actually held.

The tiers are a contract, not a preference: a file that reads the filesystem
belongs in the second one however small it is. Seven did not, and drifted there
because the unit tier is the fastest to run (round-9 review of PR 43).

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
  `workbench/`), and a root `instance.md` additionally makes `ksor init`
  refuse `error: nested` anywhere inside the checkout (guard rule 10).
- Do not create GitHub issues/comments or publish packages on your own
  initiative.
