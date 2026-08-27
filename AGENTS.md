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
  Since decision 27 the SOURCE is open too, not only the protocol: the record
  is an OKF bundle in the KSoR Profile, so `knowledge/` handed to any OKF
  consumer reads as a conformant bundle with no ksor in the loop. That is the
  strongest available form of this claim — say it that way rather than
  reasoning from the protocol alone.
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

| Term                | Means                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| **corpus**          | the governed markdown under `knowledge/` — the source of truth. It is an OKF bundle (27)         |
| **concept**         | one governed document in the bundle. Its id is its bundle-relative path without `.md`            |
| **companion**       | a file attached to a concept — summary, flashcards, quiz, slides. Never a concept itself (24)    |
| **instance**        | one deployment configured (`instance.md`): identity, floors, budgets. **Not governance**         |
| **policy**          | `.ksor/governance.yaml` — the audience registry and the approval/takedown authorities (27)       |
| **ledger**          | `.ksor/takedowns.yaml` — the committed, append-only record of every takedown act (27)            |
| **build**           | one execution of `ksor build`, identified by a `build_id`                                        |
| **refresh**         | the scaffold's `pnpm refresh` — PUBLISH: `ksor build`, then `ksor ingest --flip`, then `ksor gc` |
| **build_id**        | what every machine artefact stamps — the content hash of everything a projection reads           |
| **generation**      | the monotonic version of published content — what a citation pins. **Not `build_id`**            |
| **build.lock.json** | the committed record of a build: what was published, from which commit, with which toolchain     |
| **surface**         | something that serves the corpus — the website and the MCP server                                |
| **scaffold**        | what `ksor init` writes into an adopter's repo — owned by the adopter (decision 4)               |
| **audience**        | an identifier a concept lists and a viewer holds; the concept is admitted when they overlap      |
| **viewer**          | the audience list a build or a request is made for — always contains `public`                    |
| **trust tier**      | unverified · machine-confirmed · human-reviewed — derived from `verified[]`, never declared      |
| **abstain**         | the corpus does not cover this — a correct answer, never an error                                |

One command is confused with its own halves, so the mental model is written
down rather than left to be inferred: **`ksor build` makes the SITE correct**
(it checks the record, regenerates the indexes and writes the lock — no
database), **`ksor ingest` makes the AGENT DOOR correct** (it embeds, loads
Postgres and flips a generation), and **`pnpm refresh` runs both** so every
surface is current. The scaffold's script is the name an adopter uses;
`ksor ingest` is the name CI and this repo's docs use, because there the
individual step is the subject. That split is deliberate — it is not two ways
to do one thing.

Two pairs are confused often enough to be worth naming. **`build_id` is not a
`generation`**: the first connects every projection of one publication, the
second is the kernel's counter a citation pins, and they move independently.
**Audience is not `visibility`**: `visibility` was one ranked tier per document
and is now a refused key — a concept holds a LIST, a viewer holds a LIST, and
membership decides rather than rank (decision 27). "Level", the 0–4 numeric
ladder, is retired with it: what a record meets is the conformance floor, and
what it climbs is the trust tiers (product principle 7).

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
pnpm check:corpus         # the SHIPPED docs' frontmatter and links (<1s)
pnpm test:unit            # *.test.ts, colocated, pure (<3s)
pnpm build && pnpm test:integration   # built artifacts + repo-tree suites (~2 min)
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
   a product guarantee. _Revision 2026-08-25 (decision 27): the update vehicle
   this decision promised without naming now exists — `ksor migrate --write`
   rewrites the adopter's record into the profile, and `--write-site` offers
   the byte-copied rule modules to the adopter-owned `system/site` as diffs.
   Ownership is unchanged: migrate prints the diff and changes nothing until
   `--write`, and it refuses by name rather than authoring anything the
   adopter has to mean (a title, a description, the actor behind a takedown)._
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
   _Revision 2026-08-25 (decision 27): two clauses gain a sharper form and
   neither is reversed. "The governance level is derived, never declared"
   holds, but the NUMERIC ladder it derived is gone — tools report the
   conformance floor a record meets and the trust rung its `verified[]`
   earns; there is still no `governance:` key to declare. And "the site is
   preview and review" becomes load-bearing rather than descriptive: the
   preview is now the ONLY surface a `draft` reaches, so the review step is
   enforced by what every build excludes rather than by convention._
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
   site's own Next config already sets it where it belongs._ _Revision
   2026-08-25 (decision 27): the closed root set gains `.ksor/` — the
   Governance Policy and the takedown ledger, both committed — and
   `build.lock.json`. The `.env.example` reasoning applies unchanged: these
   are answered questions, not empty directories, and the ledger in
   particular is why a record with no database can take a document down at
   all. `.gitignore` becomes `.ksor/*` with the two files negated, because
   the directory form `.ksor/` cannot be negated (verified against git).
   "CommonMark only, framework-free forever" gains exactly ONE extension, GFM
   footnotes, for the reason decision 27 gives: it is the only extension that
   degrades to readable text in a plain renderer, which is what
   "framework-free" was protecting._
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
    _Revision 2026-08-25 (decision 26): the emitted `check.mjs` will bundle
    the `yaml` parser and carry its ISC notice in a banner; the templates
    themselves stay MIT-0._
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

    _Revision 2026-08-25 (decision 27): the database-free clause GROWS rather
    than narrowing. `ksor build` joins `init` and the site on the free side of
    the ladder — it generates the indexes, runs the record checker and writes
    `build.lock.json` with no database, no provider key and no network, so the
    governance decision now runs for static output at level 0. What moved the
    other way is that `ksor ingest` runs the SAME checker and refuses without
    a fresh lock: the served rung can no longer publish a record the free rung
    would have refused._

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

    _Revision 2026-08-25 (decision 26): `yaml` 2.9.0 joins the set — ISC,
    zero transitive dependencies, exact-pinned — for the record module; the
    CLI carries it because it bundles `content`._

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
    `bodyLimit` middleware replacing the hand-rolled hardening (`secureHeaders`
    was proposed here and never adopted — see the 2026-08-27 revision).
    `hono` and `@hono/node-server` are declared runtime deps of
    the content-gateway. What stays ours because it is good: `buildAuth` and the
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

    _Revision 2026-08-27 (issue #151): two sentences above describe a door that
    was never built, and one of them was still being repeated in a guard
    comment. **`bodyLimit` is real** — imported and applied at
    `content-gateway/src/http.ts:26,522` — but **`secureHeaders` was never
    adopted**: nothing in the tree imports it, and the door sets its own pair by
    hand (`http.ts:330-331`, HSTS + `x-content-type-options: nosniff`, "nothing
    else"). The CODE is right and this entry was wrong, so the entry is
    corrected rather than the code. **And hono is not free.** "Already the MCP
    SDK's own transitive deps, so zero new install bytes" was true of the 1.x
    monolith and false from the moment the same revision above moved to v2,
    which depends on `zod` and `@modelcontextprotocol/core` and nothing else
    (checked against the installed tree, 2026-08-27); `@hono/node-server` is
    likewise carried by nothing but the door itself. The reason that survives is
    the one this decision already gives — the SDK's only HTTP shape is
    Web-standard, and hono is the shape that needs no bridge to it — so the
    weight is a cost paid deliberately, not an absence of cost. Guard rule 5's
    why-comment carried the same false sentence and is corrected with it._

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

    _Revision 2026-08-25 (decision 27). Four changes, one of them an owner
    decision against the clause above. **`sor_id` is retired** — path is
    identity, so a renamed denied document gets a new id and "immune to
    reorganization" is weakened knowingly; the compensating control is
    `ksor-takedown-dangling`, which refuses the BUILD when an in-force entry
    names a concept that no longer exists, so a rename goes red rather than
    republishing. **A denial is a ledger entry first and a row second**:
    `.ksor/takedowns.yaml` is committed and append-only, the verb writes both
    in one act, and a lift is a revocation ENTRY setting `revoked_at` on the
    row rather than a deleted line. **An entry may be marked `removed`**, the
    sanctioned way to delete a denied file, after which the path reappearing
    refuses. **A directory is ALWAYS the `#section` node** — previously only
    an index-less one was — which is the anchor a `subtree` entry names. The
    `parent_id` walk, the per-node default and the explicit container choice
    are untouched._

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
    _Revision 2026-08-25 (decision 27): the rule is unchanged and the row got
    much wider. Schema 2.5 carries the audience LIST (`audience TEXT[]`, GIN
    indexed, replacing the ranked `visibility`), the authored status on the
    new vocabulary, the OKF trust block as JSONB (`sources`, `verified`,
    `generated`, `approval`, `deprecated`), `effective_from`/`stale_after`,
    and a derived `trust_tier`; the run carries `build_id`, the policy as a
    row with its digest, and the ledger's id set. The single seam widened with
    it — `lib/admit.ts` composes audience overlap, `lib/lifecycle.ts` and
    `lib/trust.ts` into ONE admitted set, bound beside `DENY` in both search
    arms, `read`, `outline` and the calibration sampler — so the door reads
    lifecycle and trust the way it already read audience: from columns, not
    from markdown each surface parsed for itself._

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
    convenience rather than a guard. _Revision 2026-08-25 (decision 26): the
    OKF-native record makes the copied rule modules GENERATED at
    package-build time rather than hand-kept; until that build entry lands
    the byte-copy and its drift test stand unchanged._

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
    Reversed only by an owner decision recorded here. _Revision 2026-08-25
    (decision 27): the shared refusal is now a TABLE rather than a pair of
    boot checks — record spec §2.5 says what each status is admitted to on
    human and on machine surfaces, both surfaces read it, and
    `LIFECYCLE_CASES` asserts it through real Postgres and against the site's
    copy the way `AUDIENCE_CASES` does. The boot gate grew with it: a denylist
    row no ledger entry accounts for refuses, one whose entry was never merged
    is reported, and a floor calibrated under a different serving predicate
    boots into the declared-but-uncalibrated refusal instead of quietly
    reading as `gate: off` — which would have made a refusing record answer
    everything, the exact inversion this decision exists to catch._

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
    an environment variable never will. _Revision 2026-08-25 (decision 27):
    the requirement extends from the VERB to the FILE. A takedown is now a
    committed YAML entry, which anyone with write access can append by hand,
    so every entry's actor — denial, revocation, amendment — is validated
    against the policy's `takedown_authorities` by `pnpm check`, `ksor build`
    AND ingest, not only by the verb. It also names what this decision asked
    for and did not get: a policy allowlist is AUTHORISATION, not
    verification. Every envelope says `checked: policy` for exactly that
    reason, and change-control verification against repository history is
    what would let it say otherwise._

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

    _Revision 2026-08-25: the two measurements above are SUPERSEDED, and are
    kept with their date because the ratio is the point. The OKF-native door
    grew two governance surfaces the 2026-08-23 figures predate: every search
    hit and every `read` reply now carries the record's stored `governance`
    block, and `search` takes a `min_trust_tier` parameter. Measured exactly,
    from the served `tools/list` capture rather than an estimate: the three
    definitions are **16,734 chars ≈ 4,184 tokens, always resident** (was
    ~2,990) as transmitted — `search` 7,932 + `outline` 3,332 + `read` 5,466 =
    16,730, plus the four characters the `tools` array itself carries; a search hit
    carries ~262 chars more than it did, so a `k=10` call is correspondingly
    dearer. The per-call figure is NOT re-measured here — the live 81-document
    book it was taken against does not exist in this tree, and an estimate
    dressed as a measurement is what this entry exists to prevent. The costs
    are recorded, not argued away, which is what the decision asks: the
    resident surface is the price of governance an agent can read, and `k` is
    still the lever (`packages/ksor/docs/tool-surface.md`)._

    _Revision 2026-08-25 (decision 27): the exchange holds — the registration
    is still adopter-owned code, the door still inspects its own served
    surface at boot — but a governance parameter had to reach a file the
    adopter may have scaffolded months earlier. `min_trust_tier`'s DEFAULT and
    its enforcement therefore live in the HANDLER, not in the registration: a
    registration written before the parameter existed keeps working, and the
    boot inspection NOTICES its absence, naming the tool and the line to
    paste, instead of refusing to boot. That is the shape a later parameter
    should take — refuse on a missing floor, notice a missing affordance._

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

    _Revision 2026-08-25 (decision 27): the class refusal becomes a one-key
    ALLOW-LIST for one kind. `<doc>.summary.md` must now carry exactly
    `type: Summary` and nothing else — the profile needs a marker to tell a
    companion from a concept, and an allow-list of one closes precisely the
    leaks the class refusal closed (`visibility:` widening, takedown escape,
    governance claimed by something that is not a node) while admitting the
    marker. The other four kinds are unchanged: `.yaml` companions are
    invisible to OKF and declare nothing. The `index.summary.md` row retires
    with the authored index — `index.md` is generated, creates no node, and
    cannot carry a summary of its own. The no-independent-id clause, which is
    the governance guarantee and the owner-only one, is untouched._

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

26. **The record is real YAML, read by one parser** (2026-08-25, with the
    OKF-native record — `research/okf-native.md` §2 item 8, `specs/ksor/record/spec.md`).
    The kernel and the scaffold read frontmatter with five hand-written line
    scanners (`plain-tree.ts`, the site's `governance.ts` and two rule
    modules, the emitted `check.mjs`), each a different subset of YAML, and
    the profile's nested `ksor:` block, `.ksor/governance.yaml` and
    `.ksor/takedowns.yaml` are shapes none of them can read — a scanner that
    fails on a nested key fails SILENTLY, which is the visibility leak's
    second door (decision 18). `packages/content/src/record/` reads all three
    with `yaml` **2.9.0** (ISC, ZERO transitive dependencies, 796 KB of
    `dist/` installed; published 2026-05-11, so the catalog's 48-hour
    quarantine never holds it), pinned EXACTLY in the catalog, enrolled in
    guard rule 5 for `ksor-content` and — because the CLI bundles the kernel
    — for `@panaversity/ksor`. What the parser is allowed to hand back is
    narrowed at the boundary (`record/frontmatter.ts`): the core schema, one
    document, unique keys, plain data only (a `!!binary` Buffer, a
    `!!timestamp` Date or an unknown tag is refused, never passed on), and
    the fence found by a real-newline walk rather than a multiline regex,
    because JS `^`/`$` break on U+2028 where YAML 1.2 does not (found in
    review). Reversed if a scanner is shown to read every profile shape the
    spec names, which would make the dependency weight buy nothing.

    _This revises three decisions in place: decision 10 (the emitted checker
    will carry the parser's ISC notice once `check.mjs` is built from the
    kernel's rules, plan §2 item 8 — the templates stay MIT-0, the bundled
    parser keeps its own licence), decision 12 (the dependency list gains
    `yaml`), and decision 18 (the scaffold's copy of a rule becomes generated
    at package-build time, not hand-kept; the drift test stays until it is)._

27. **The record is Markdown in the KSoR Profile of OKF** (2026-08-25; plan
    `research/okf-native.md`, contracts `specs/ksor/record/spec.md` and
    `specs/ksor/build/spec.md`). The README already told the public that a
    KSoR record IS an OKF bundle constrained by the KSoR Profile (KSP-001
    §4). A fact-map of the tree on 2026-08-24 found the code agreeing on no
    axis: five hand-written frontmatter scanners, not one of which could read
    the profile's nested `ksor:` block; no serving path that read a
    document's status at all, so a draft was searched and read exactly like
    an approved one; a takedown ledger that lived only in Postgres and was
    EXPORTED to a gitignored file the site read, which is the direction OKF
    §4.1.4 forbids; and machine artefacts carrying no build id, no commit and
    no tool version. Decision 26 gave the record one parser. This gives it
    one grammar, and gives both surfaces one decision to make about a
    document. What was decided, each clause reversible on its own except
    where marked:

    **The conformance floor replaces the numeric ladder.** Level 0 was
    `title` + `status`. The floor is `type`, `title`, `description`,
    `status`, `ksor.audience`, and a policy naming approval and takedown
    actors. The escape for a record that wants neither owners nor sources is
    a NON-RESERVED type: the profile names one, `Document`, and promises
    never to reserve it, so the type-keyed rules never fire on a project that
    has not asked for them. Nothing is demanded of a level-0 record beyond
    saying who its documents are for and who may approve them — both of which
    it has to know anyway to publish anything at all. Governance is still a
    ladder (principle 7); what "the ladder" NAMES is now the trust rungs —
    unverified, machine-confirmed, human-reviewed — derived from `verified[]`
    and never declared. Reversed if a real adopter cannot reach the floor.

    **Audience is a required list, matched by overlap, and omission is
    refused.** A concept holds a list of identifiers; a viewer holds a list
    that must contain `public`; the concept is admitted when the two overlap.
    Rank moves to the viewer and membership stays on the document, which is
    what lets every row of `AUDIENCE_CASES` keep its meaning while the
    document stops carrying one ordered tier. `KSOR_AUDIENCE` becomes a comma
    list (`ksor-viewer-omits-public`, `ksor-viewer-unregistered`); the
    registry lives in the policy; a document that declares no audience is
    refused rather than defaulted, because the visibility leak recurred FOUR
    times while the default lived in someone's head (decision 18). This
    reverses the visibility spec's "one value, never a list — set
    intersection is where access-control bugs live", and it is reversed with
    the evidence that sentence asked for: the decision table now asserts
    overlap through real Postgres and against the site's copy, so a wrong
    intersection fails on the row it broke rather than in production.
    **Owner-only:** this clause is the leak guarantee and is not reversible
    without an owner decision recorded here.

    **Drafts live in the preview; every other status is admitted per surface
    by ONE table.** `pnpm dev` is the review surface (decision 7) and marks
    them; every build excludes them from every surface — pages, sidebar,
    search index, `llms.txt`, twins, the door — because a static site's
    sidebar and search index are machine artefacts too. `KSOR_DRAFTS=show`
    admits them to human surfaces only, is recorded in the lock and in
    `build_id`, and marks the build `noindex`. A stable concept before its
    `effective_from`, one past its `stale_after`, and a deprecated one each
    render for people with a badge and stay off every machine surface. The
    table is record spec §2.5 and it is the whole rule, so both surfaces
    refuse the same states (decision 19) instead of each deciding for itself.

    **`index.md` is generated, committed, drift-checked, and never copied
    into a stage.** It carries no frontmatter, so it can carry no governance,
    so anything authored there would be ungoverned knowledge on a served
    surface. Section prose becomes an ordinary concept in the folder
    (`overview.md`). The COMMITTED index is the record's own map and lists
    every status and every audience — anyone with the repository has the
    files anyway — and every projection REGENERATES its index from the tree
    it was filtered to, which is the clause that matters: copying the
    committed index into a public stage would have published every internal
    title as a folder page, the exact leak the visibility work exists to
    prevent. Reversed to export-only if committed generated files prove a
    review burden.

    **`x.summary.md` carries exactly `type: Summary`, and nothing else.**
    Decision 24 refused a companion's frontmatter as a CLASS; the profile
    needs a marker, so the class refusal becomes a one-key allow-list that
    closes the same three leaks — `visibility:` widening, takedown escape,
    and governance claimed by something that is not a node. `Summary` is a
    companion marker outside the concept type system, not a reserved type;
    ingest still creates no node; the widening rule evaluates a companion's
    body with its parent's audience. Decision 24's no-independent-id clause
    is untouched, and under bare OKF a summary reads as a concept — the
    no-id guarantee is a PROFILE rule and KSP-001 draft 10 says so.

    **`instance.md` is a profile-shaped document beside the bundle; authority
    lives in `.ksor/governance.yaml`.** `format: 2`, with `name` (the one
    sanctioned identity key), `title`, `description`,
    `toolchain: { requires, scaffolded }` and the deployment keys — no
    `status` and no audience, because identity is not knowledge and the
    lifecycle table does not apply to it. The bundle root is `knowledge/`, so
    a bare OKF consumer handed that directory sees a conformant bundle and
    nothing of the site. `audiences:` and `default_visibility:` LEAVE the
    instance: two homes for the audience registry is decision 18's failure
    mode with a different filename. The policy and the ledger are INGESTED —
    registry, authority sets, entry ids, digests — so the door binds to rows
    rather than to files a served container does not carry.

    **Takedown is an append-only committed ledger that the verb also applies
    immediately.** File first, row second, in one act. A revocation is a new
    entry naming the one it revokes, never a deleted line; deleting a denied
    file is an amendment plus the deletion in one change; every entry's actor
    is validated against `takedown_authorities` by the checker, the build AND
    ingest, not only by the verb, because a committed YAML file is something
    anyone with write access can append to. A ledger that SHRANK against its
    own git history or the committed lock refuses the build. What this buys
    that the database never could: a level-0 record with no Postgres gets
    takedown for the first time, and the site reads the denial from the
    repository instead of from an exported artefact. The window between the
    verb and the merge is the pull request's review time, disclosed — the
    door refuses at once, the site follows the merged ledger at its next
    build, which is the latency it already had.

    **Two verbs: `ksor build` and `ksor migrate`.** `build` is database-free,
    generates every index in memory, runs the checker, and only then writes —
    the indexes whose bytes changed, and `build.lock.json`. It is the one
    place the governance decision runs for static output, which is what stops
    the site and the door reading different truths without a database in the
    loop. `migrate --write` is the update vehicle decision 4 promised: it
    rewrites a pre-profile record and refuses, by name, everything it cannot
    know — a title, a description, a `generated.at`, the actor behind an
    existing takedown. Two identities are named apart and never confused in
    prose: `build_id` is what the machine artefacts stamp and what connects
    every projection of one publication; `generation` remains the kernel's
    monotonic counter a citation pins.

    **Every timestamp is an ISO 8601 instant with an explicit offset.**
    Upstream OKF made the same move under the unchanged `0.2` label, so the
    pin is to a commit rather than to a version string, vendored byte-exact
    at `specs/ksor/record/okf-SPEC.md` and asserted against the digest every
    lock stamps — a pin that names bytes the tree does not hold is not a pin.
    A bare `YYYY-MM-DD` is refused (`ksor-instant-form`); `ksor migrate`
    widens one to midnight UTC. The cost is that a date is now longer to
    type; what it buys is that an embargo, a review deadline and an approval
    can be compared across time zones without a convention nobody wrote down.

    **`sor_id` is retired — path is identity, everywhere.** **Owner-only:**
    this runs against decision 14's node-scope clause, which was recorded as
    "immune to reorganization" and not reversible without an owner decision.
    It is weakened knowingly: with path as identity, renaming a denied
    document gives it a new id. The compensating control is
    `ksor-takedown-dangling` — an in-force ledger entry naming a concept that
    no longer exists refuses the BUILD — so a rename goes red on both
    surfaces instead of quietly republishing, which is the failure the 0.0.18
    attack found and the reason the clause existed. `ksor migrate` refuses a
    document carrying `sor_id` rather than dropping it, because dropping it
    silently retires an identity that takedowns and citations are keyed on.

    **`stable` needs approval and NOT verification** — a deliberate
    divergence from KSP 4.2.2.3, which requires `verified` on every stable
    concept. Coupling them manufactures the event R17 forbids deriving from
    approval: an author with an approver and no reviewer would simply write a
    `verified` entry, and the tier that exists to say "nobody has checked
    this" would never appear. A stable, approved, unverified concept is the
    honest state, and it is exactly what tier _unverified_ is for. It is also
    what lets the emitted starter ship approved without claiming a review
    (the 2026-08-25 revision below). The correction is carried in KSP-001
    draft 10 rather than worked around locally.

    **GFM footnotes are the one extension to CommonMark.** Reference and
    definition, the grammar OKF's per-claim citation uses, with the label
    matched against `sources[].id` in both directions. It is the one
    extension because it is the only one that DEGRADES: a footnote read by a
    pure CommonMark renderer is still readable text, where a directive is
    literal colons. This revises decision 8's "CommonMark only" and settles
    nothing about the directive grammar, which remains unratified.

    **What it cost, recorded rather than argued away.** Day one publishes
    nothing until a human approves — one conversational turn, and the claim
    made visible. _Reversed 2026-08-25 — see the revision below._ Every
    adopter with a numeric floor re-measures it, because the serving
    predicate changed and a floor measured under another predicate is a
    declared-but-uncalibrated floor; until they do, the door refuses every
    search as uncalibrated, which is the invariant rather than a regression.
    An upgraded served record has an outage window between
    `ksor schema --apply` and the first 2.5 ingest. `approved` becomes
    `draft` on migration unless the human approves in the same act. Whether
    an edit bumped `generated.at` is UNVERIFIED until change-control
    verification lands — the checker compares two authored instants and no
    more, and every envelope says `checked: policy` rather than implying
    otherwise. Actor ids are published with the content, exactly as a commit
    author is in a public repository. Stale documents leave the open web at
    the next build, so a record with `stale_after` dates needs a scheduled
    rebuild.

    _Revision 2026-08-25 (owner): **the emitted starter PUBLISHES on the
    first build.** What is reversed is the cost clause "day one publishes
    nothing until a human approves" and the sentence that read "five starter
    drafts, one human approval, five stable documents"; both are corrected
    above. The five sample documents now ship `status: stable` carrying
    `ksor.approval: { by: "ksor-starter/<cli version>" }`, and the emitted
    `.ksor/governance.yaml` authorises that actor — so `ksor init` followed by
    `ksor build` reports **5 admitted to a machine surface** where it reported
    **0**._

    _WHY: the all-draft starter did not cost one conversational turn, it cost
    the entire first build. An adopter's `llms.txt` had an empty
    `## Documents`, the `/md/` twins were empty, no document route existed at
    all, and a door pointed at that record answered nothing — on the
    hello-world, which has to be simple to get started. The claim the empty
    build made visible was visible to nobody, because the surfaces that would
    have carried it were the surfaces it emptied._

    _HOW this stays inside R25 and decision 21: the approver is a PRODUCER,
    not a person. `ksor-starter/<version>` is the form `generated.by` already
    uses; no human handle appears, so the tool is not recording that somebody
    reviewed something. What R25 forbids is a self-asserted string wearing a
    schema, indistinguishable from a person who was never there — a producer
    id is distinguishable by construction. The trust tier stays `unverified`,
    which is the honest word for nobody having checked it, and no `verified`
    entry is written. **This is not the starter being pre-approved by the
    adopter, and must never be described that way.**_

    _WHAT IT COSTS, recorded rather than sold: an actor that is not a person
    holds approval authority in the adopter's OWN `.ksor/governance.yaml`
    from the moment they scaffold, and stays there until they delete it. And
    an adopter who never reads the samples publishes five documents they did
    not write, about KSoR rather than about their organisation, on a record
    whose whole purpose is settling which copy governs. Neither is fixable by
    the tool, so both are disclosed instead — in the emitted README, the
    emitted AGENTS.md, a comment in the policy file itself, and the
    intake-interview skill, each naming the producer and saying to delete it
    once the samples are gone. UNCHANGED is everything the owner writes: a new
    document is `draft` and reaches no machine surface until a human approves
    it. Reversed by an owner decision recorded here, or by evidence that
    adopters are shipping the samples as their own record._

    Reversed per clause with evidence, recorded here; the two clauses marked
    **owner-only** — the audience leak guarantee, and retiring `sor_id`
    against decision 14 — are not reversible without an owner decision.

28. **A retired surface is REMOVED, never deprecated** (owner, 2026-08-26).
    Pre-1.0, and the whole population of built records is ours — `migrate` has
    never shipped at all (`docs/status.md`), and the owner confirmed there are
    no external adopters. A deprecation window therefore buys nobody anything
    and costs everybody the second code path coding principle 4 forbids. So a
    surface this project retires is gone in the release that retires it, and
    what replaces it is a REFUSAL naming the fix, never a fallback that keeps
    working quietly.

    This branch already did it five times and recorded it nowhere, which is why
    the rule is being written down rather than invented: the `--knowledge` flag
    refuses as an ordinary unknown one rather than warning
    (`packages/content/src/commands.ts`); `ksor takedown --export` and
    `.ksor-denylist.json` are gone; nine frontmatter keys are refused BY NAME
    rather than ignored (`LEGACY_KEYS` in `record/profile.ts`); `audiences:`
    and `default_visibility:` refuse with a hint
    rather than being read where they used to live (`MOVED_INSTANCE_KEYS`);
    `instance.md format: 1` refuses outright.

    **What makes this safe rather than merely fast is that removal is paired
    with a MIGRATION, not with a warning.** `ksor migrate --write` carries the
    record across, and where it cannot know something it refuses by name
    instead of guessing (`ksor-migrate-underivable`). A removal with no
    migration path is not covered by this decision and stops for a human. The
    migration must also carry the adopter's TOOLING, not only their content:
    this rule was written the same day an audit found `migrate` fixing the
    `build` script and not `refresh`, so a correct upgrade left the adopter's
    own gate red — an upgrade that does that is not an upgrade.

    **The one exception, and why it is one.** A missing FLOOR refuses; a
    missing `min_trust_tier` is NOTICED (`content-gateway/src/gateway-verify.ts`).
    The line is guarantee versus capability: without the
    floor text a guarantee is broken, and without the parameter every
    guarantee still holds and only an affordance is absent. An absence nobody
    is told about is one nobody fixes, so it is reported — never silently
    tolerated. That is the shape any future affordance takes; it is not a
    licence to notice a broken guarantee.

    **What it costs, stated plainly:** our own records upgrade or stop. There
    is no version of ksor that reads both shapes, by design.

    **Reversed the day a record we do not operate is built by a published
    release** — from then on a retirement either ships with a migration that
    runs unattended, or waits for a major. Not reversible by convenience: "an
    adopter might" is not an adopter, and the reversal condition is an event
    that can be observed rather than forecast.

29. **The deploy REGENERATES the lock; it does not verify it** (owner,
    2026-08-26). `vercel.json` builds the site with `pnpm build`, which is
    `ksor build && <site build>`, so a host regenerates every `index.md` and
    `build.lock.json` before the site is built. An adopter can therefore deploy
    without ever having run `ksor build`, and the lock committed to their
    repository is not necessarily the one that shipped.

    Weighed and kept, because the alternative taxes the wrong person. Measured
    on a real scaffold: the site build ALONE refuses `ksor-lock-missing` with no
    lock and `ksor-lock-stale` when a document changed since one was written
    (naming the document), and succeeds on a matching lock writing no tracked
    file. So decoupling works — and it would oblige every adopter to run
    `ksor build` and commit on EVERY knowledge edit, forever, or watch their
    deploy fail. Product principle 7: governance is a ladder, and demanding a
    reviewed lock of a level-0 project is a bug, not rigour.

    **What is NOT given up.** The record checker runs on the deploy exactly as
    it does locally — a record that breaks the profile fails there, exit 1,
    nothing written. And the `build_id` that shipped is stamped into the
    deployed `llms.txt`, so what was published is always discoverable from the
    artifact. What is given up is narrower than it first looks: that the lock
    in git is the one that shipped, and therefore that a human reviewed the
    `build_id` in a pull request.

    **The stricter posture needs no product change**, which is why none was
    made: `buildCommand: "pnpm -C system/site build"` is one line in the
    adopter's own `vercel.json` (decision 4 — that file is theirs), and the
    refusals it relies on already exist and are asserted. It is documented in
    `docs/deploying.md` as a choice rather than shipped as a flag.

    Two costs recorded rather than argued away. `ksor build` rewrites
    `build.lock.json` on EVERY run because `as_of` is the current instant, so a
    no-op `pnpm build` leaves git dirty by one line (`--as-of` pins it; the
    `build_id` itself is stable for the same tree). And `ksor-lock-stale` can
    never fire on a deploy that regenerates the thing it checks — the gate is
    real, it is simply not on that path.

    **Reversed by the first adopter who needs the deployed `build_id` to have
    been reviewed before it shipped** — a regulated record, or an audit that
    asks which commit produced a published answer. That is an observable event,
    not a forecast, and when it arrives the change is a default flip plus a
    migration note, not new machinery.

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
   check rejects them. _Revision 2026-08-25 (decision 27): stronger for
   concepts, with one named exception. `sor_id` is retired, so a concept's id
   is its bundle-relative path without `.md` and nothing can override it; `id`
   and `name` inside a concept are refused by name (`ksor-legacy-key`). The
   exception is the INSTANCE: `instance.md` carries `name`, the machine
   identity citations and `llms.txt` use, because the record itself has no
   path to derive one from._
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
   project is a bug, not rigour. _Revision 2026-08-25 (decision 27): the
   principle stands and the RUNGS are renamed. There is no numeric 0–4 ladder
   any more: there is a conformance floor every record meets (`type`, `title`,
   `description`, `status`, `ksor.audience`, and a policy naming approval and
   takedown actors — with `Document`, the never-reserved type, as the escape
   from owners and sources), and above it the trust rungs each concept climbs
   on its own — unverified, machine-confirmed, human-reviewed. "Demanding
   level 4 of a level-0 project" becomes: demanding `human-reviewed` of a
   record that has not asked anyone to review it._
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
  - same `as_of` ⇒ same `build_id`. Test by building twice and diffing
    `build.lock.json`. The `as_of` clause is decision 27's: `build_id` covers
    each document's ADMITTED set, so moving `as_of` across an `effective_from`
    or a `stale_after` changes what the build publishes and must change the id.
    Two runs without `--as-of` differ only in the `as_of` field itself; with
    `--as-of` repeated they are byte-identical.

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
  tmp dirs (~2 min). The `<15s` this line used to claim was measured before the
  tier spawned the built CLI per test, packed a tarball and installed it — the
  costs that ARE the tier ("the test tier must install the same tree the
  artifact installs"). It is a shape, not a budget: a suite belongs here
  because of what it touches, never because of what it costs.
- `*.db.test.ts` — real Postgres, gated on `KSOR_DB_URL` (`pnpm test:db`; CI
  provides the service). The kernel's guarantees are SQL, so the tier that runs
  them against a real database is where they are actually held.

The tiers are a contract, not a preference: a file that reads the filesystem
belongs in the second one however small it is. Seven did not, and drifted there
because the unit tier is the fastest to run (round-9 review of PR 43).

The tiers themselves did not change with decision 27; what it added is a fourth
obligation that cuts across them. The record's rules are now executed by THREE
programs — the kernel's `record/` modules, the emitted `check.mjs` built from
them, and the site's byte-copies — so a rule is only held when one conformance
fixture is judged identically by all three, and the drift tests are what make
the copies trustworthy rather than merely present. A rule asserted in one
program alone is the shape decision 18 was written about.

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
- Do not author `id:`/`name:` fields where the path is the identity — they are
  refused by name in a concept (`ksor-legacy-key`). `instance.md`'s `name` is
  the one exception, because a record has no path to derive one from.
- Do not edit ALLOWED import graphs without review.
- Do not commit `.only` or skipped tests (guard rule 7 rejects them).
- Do not carry a predecessor mechanism across without asking what it was for,
  and never without tests here — conversion is granted (decision 6), blind
  copying is not.
- Do not create `knowledge/`, `governance/`, `.ksor/`, `build.lock.json`, or
  `instance.md` at this repo's root — those belong to scaffolded projects (the fixture lives under
  `workbench/`), and a root `instance.md` additionally makes `ksor init`
  refuse `error: nested` anywhere inside the checkout (guard rule 10).
- Do not create GitHub issues/comments or publish packages on your own
  initiative.
