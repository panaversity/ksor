---
issue: https://github.com/panaversity/ksor/pull/16
status: accepted
last_updated: 2026-08-19
---

# Kernel conversion — the content SoR crosses whole, in TypeScript

The owner's decision (2026-08-19, recorded as AGENTS.md decision 11): the
predecessor kernel's content SoR converts to TypeScript in this workspace,
end to end, tests included — the production-proven retrieval, generations,
calibrated abstention, and fail-closed gateway become `ksor serve` and the
packages under it. This document preserves the evidence trail and the
method; the served surface's contract is `specs/ksor/serve/spec.md`.

## Question

How can the predecessor kernel's content Source of Record (SoR), including its retrieval, generations, calibrated abstention, and fail-closed gateway, be fully converted to TypeScript within this workspace, with tests included, to become `ksor serve` and its underlying packages, while preserving the evidence trail and method?

## Evidence

The conversion is based on the `sor-agentfactory @ b554f91` source (verified 2026-08-19).

**Source Verification:**

1.  **Embedding-provider seam merged**: PR #444 ("Part A") landed, making the kernel provider-agnostic. Vendor-coupling objection solved upstream.
2.  **Seam clean**: Content gateway only reaches six symbols from `sor_gateway_kit` and `sor_platform`, with no edges to `sor-learning`, `sor-pedagogy`, or `zia-tutor`.
3.  **MCP surface model-free**: `search`, `outline`, `read_lesson` return governed evidence; calling model composes prose. Serve never needs a generation-side model.

**Manifest of Crossing Components:**

- `packages/sor-content/` becomes `packages/content/` (ingest, chunking, generations, retrieval, calibrate, `schema.sql`).
- `packages/sor-platform/` becomes `packages/postgres/` (trimmed `load_bundle`, pooled db endpoint, contracts, renamed 2026-08-20).
- `packages/sor-gateway-kit/` becomes `packages/gateway-kit/` (auth + serve + harden + transport security).
- `gateways/sor-content/` becomes the `ksor serve` door (fail-closed, MCP TS SDK, stateless Streamable HTTP).

Mirroring source topology during conversion is deliberate for 1:1 mappability of Python test suite as oracle.

**Dropped Components:**

- Agent-Factory-Book-specific items (~1,600 lines with tests): `docusaurus_sidebar.py` ingest adapter, `rendered.py` MDX shell rendering, book's instance declaration.
- Dropped kit modules: `wiring.build_gateway_server`, `manifest.py`, `publish.py`.
- Never crosses: `sor-learning`, `sor-pedagogy`, `gateways/zia-tutor`, `instances/learning`, prompt skills.

**Integration Question Resolution:**

- **Python as sidecar (Option A) rejected**: `ksor init` would need Docker + a second language.
- **Port contract to TS (Option B)** and **Extract Python as reference + conformance fixtures (Option C)**: C is how B is done safely.
  1.  Fixtures first: Gold sets, `schema.sql`, calibration data extracted as conformance fixtures.
  2.  Python suite is oracle: Each converted package matches oracle's observable behavior on fixtures; tests convert alongside.
  3.  Method is crown jewel: `calibrate.py`'s calibrated abstention floor crosses with measurement discipline.

**Placement (Owner-confirmed 2026-08-19):**

- `ksor init` stays database-free.
- Kernel is framework-owned (workspace packages, monorepo, boundary graph, changesets release).
- CI embeds for real: `GEMINI_API_KEY` as repo secret, live calibration/retrieval evals run gated, deterministic test provider for fast tiers.

**Adaptations for TypeScript (Python never needed):**

- Visibility: Serve for audience X reads X's stage, leaks nothing past it.
- Envelope as discriminated union: abstention is a type, provenance labels derive from citation + published generation.
- `instance.md` grows keys (`embedding.*`, `database.*`, retrieval floors).
- DB-backed test tier: Postgres suites land gated against service container in CI, local Postgres, or throwaway Neon in dev.

**Outcome Ledger (2026-08-19):**

- **Spine**: `schema.sql` verbatim + `renderSchema`; pool discipline; hybrid RRF SQL with riding abstention signal + `splitHits` drift guard; abstention gates; `instance.md` adaptation; snapshot HMAC; rlog; service read plane; gateway.
- **Workers**: Chunker (33 cases/79 chunks); `plain-tree` adapter + manifest (golden manifest byte-for-byte); embedding seam (contract layer, retry asymmetry, single-flight cache, breaker); calibrate math (92 oracle assertions); `gateway-kit` (55 tests); read libs (68 tests).
- **Acceptance**: Real MCP client spawns built binary; search with citations + snapshot, outline, byte-exact read, abstention as only passing answer, HTTP fail-closed boot. 424 unit + 114 integration + gated db tier, all green.

**Decision-6 Drops (recorded):** Bundle transport + snapshot key ring as deployment machinery, Redis L2s, rate limiting, search result cache, Sentry, centroid routing (title-boost negative result), rerank, book vocabulary.

**Divergences (commented in source):** JS/Python float rounding, code-point counting, BSD-sed `\b` no-op, pg NUMERIC-as-string coercion, promises cannot cancel.

**Live Walk (2026-08-19):** Run against throwaway Neon (gemini-embedding-001/d1536). Three example-corpus documents ingested; synthesized calibration door live (Gemini wrote probes); report separable (max OOC 0.553 < min in-corpus 0.682); far-domain question ABSTAINED; scope-adjacent near-miss ABSTAINED.

**CLI Walk (2026-08-19):** Full loop with real Gemini, example corpus, shipped binaries (`ksor-content schema --apply`, `psql INSERT`, `ksor-content ingest --flip`, `ksor-content calibrate`, `ksor-gateway`). MCP client verified `search`/`outline`/`read` tools: served purchase approval, abstained autovacuum daemon.

**Post-Review Hardening (2026-08-19):** Two adversarial review passes drove fixes and three architectural decisions.

- **Fixed (fail-closed, with regression tests):** Config layer fails closed (unknown instance keys refused, `vector_floor: uncalibrated` state); degradation fails closed (embed outage abstains); revocation closes snapshot window; node/window identity (window cursor is position index); DB serving bounded (pool checkout, `maxLifetimeSeconds`, per-request deadline, `/mcp` concurrency cap); correctness batch (CRLF normalized, embedding contract checks dimension, shrink guard counts nodes, sibling slug collisions named, OUTLINE child_count honors takedown deny, BOM-prefixed frontmatter strips, numeric CLI flags validate, graceful SIGTERM drain, half-applied-schema/missing-DSN exit codes).
- **Carried-but-unused, resolved (rule 9):** `readcache` deleted; `RequiredEnvError` and `runServer` shutdown machinery wired; `platform` gained first tests.

## Decision

The owner (2026-08-19, AGENTS.md decision 11) decided to convert the predecessor kernel's content SoR entirely to TypeScript within this workspace, including all tests. This converted kernel will become `ksor serve` and its supporting packages, upholding production-proven retrieval, generations, calibrated abstention, and a fail-closed gateway. The served surface's contract is defined by `specs/ksor/serve/spec.md`.

The conversion process involved:

- Verifying the `sor-agentfactory @ b554f91` source and its merged embedding-provider seam and clean content gateway.
- Mapping Python packages to TypeScript equivalents, deliberately mirroring topology for oracle-based testing.
- Resolving integration by extracting fixtures and schema as conformance tests first, then porting packages to match observable behavior, with the Python test suite as the oracle. The `calibrate.py` method for calibrated abstention is a key intellectual asset carried over.
- Confirming placement: `ksor init` remains database-free, the kernel is framework-owned within the monorepo, and CI embeds use `GEMINI_API_KEY` with gated evaluations.
- Implementing TypeScript-specific adaptations for visibility, a discriminated union for the envelope, `instance.md` key growth, and a DB-backed test tier.

**Post-review architectural decisions (2026-08-19):**

- **Decision A (Four packages stay):** `platform`, `content`, `gateway-kit`, `content-gateway` remain separate packages, not as Python layout mirrors, but as seams required for the multi-record roadmap (e.g., future identity or praxis packages). This decision overrides the `turbo` removal precedent (Decision 5).
- **Decision B (Move HTTP door to SDK's Web-standard transport - recommended for next PR):** Transition the HTTP door from hand-rolled `node:http` to `WebStandardStreamableHTTPServerTransport` with Hono. This deletes significant boilerplate and leverages SDK helpers, aligning with the 2026-07-28 protocol revision. _(Note: superseded 2026-08-20; kernel is bundled into `@panaversity/ksor`, which now carries `hono` + `@hono/node-server`, altering its zero-dep status)._
- **Decision C (Migration path owed before adopters have data):** Before data exists and schema moves forward, a versioned plain-SQL migration runner keyed on `schema_meta` must exist (raw `pg`, no ORM). This is deferred but tracked.

## Rejected

- **Running Python kernel as a sidecar container (Option A)**: Rejected as it would force `ksor init` to require Docker and a second language, undermining the scaffold's core promise.
- **Consolidating `platform` into `content`, or `kit` into the CLI/content-gateway**: Rejected to maintain architectural seams for a multi-record roadmap (Decision A). Folding `gateway-kit` would force future gateways to re-implement auth, and folding `platform` would force identity to depend on content for a pool.
- **`drizzle-orm`**: Dropped as unused from the migration path for schema changes (Decision C).
- **Bundle transport + snapshot key ring as deployment machinery**: Dropped in favor of an ephemeral default for deployment, keeping it honest.
- **Redis L2s, rate limiting, search result cache, Sentry**: Dropped from the initial conversion, indicating these were not deemed essential for the core kernel functionality at this stage.
- **Centroid routing**: Dropped, with its title-boost negative result carried in comments.
- **Rerank**: Retired upstream and dropped from the conversion.
- **Book vocabulary**: Specific to Agent-Factory-Book and dropped.
- **Deprecated HTTP+SSE transport for MCP**: Explicitly rejected in favor of stateless Streamable HTTP (from `serve/spec.md` context).
- **Spawn design for integration path**: The initial sketch of a zero-dep CLI launching a separately installed gateway under `system/gateways/` was superseded. The kernel is now bundled into `@panaversity/ksor`, and `ksor serve` runs the gateway's `main` in-process (Decision 12 revision).

## Reversal

- **Vendor-coupling objection to kernel conversion**: This was a potential blocking point, but it was _reversed_ because the embedding-provider seam was merged upstream (PR #444) before we asked it, making the kernel provider-agnostic.
- **Initial deferral of two-implementation contract resolution**: The decision to defer resolution of differences between two implementations was _reversed_ by the owner's explicit instruction, leading to the development of the workbench shell and conformance suite.
- **Zero-dependency status of `@panaversity/ksor`**: The decision (Decision B) to move the HTTP door to the SDK's Web-standard transport initially considered a runtime dependency on the _private_ `content-gateway` to keep the CLI zero-dep. However, this was _superseded_ on 2026-08-20. The kernel is now bundled into `@panaversity/ksor`, which now carries `hono` + `@hono/node-server` and is no longer zero-dep (AGENTS.md decision 13's revision). This is a significant reversal of the zero-dependency guarantee for the published CLI.
- **`drizzle-orm` usage**: `drizzle-orm` was initially part of Decision 12 for the schema migration path but was later _dropped as unused_, reversing that part of the decision.
- **Integration path spawn design**: The initially sketched spawn design (zero-dep CLI launching a separately installed gateway) was _superseded_ by the decision to bundle the kernel into `@panaversity/ksor` and run the gateway's `main` in-process (Decision 12 revision).
- **Consolidation of packages**: The initial thought of consolidating packages (e.g., platform into content) was _reversed_ in Decision A, which affirmed that the four packages (`platform`, `content`, `gateway-kit`, `content-gateway`) should stay separate due to future multi-record roadmap needs.
- **`pg` native checkout race**: The hand-rolled checkout race was _replaced by pg's native mechanism_, reversing the previous implementation.

## Source, verified

`sor-agentfactory @ b554f91` (local read, 2026-08-19). Three facts checked
against the tree, not recalled:

1. **The embedding-provider seam is merged** (its PR #444, "Part A"). The
   handover recorded five in-flight upstream PRs; they landed. The kernel is
   provider-agnostic: `embedding.provider/model/dim` in the instance, an API
   key owed iff the resolved provider needs one, and `calibrate.py` carries a
   zero-LLM calibration door (`--queries-file` — no text generator is ever
   constructed). The vendor-coupling objection to converting the kernel was
   solved upstream before we asked it.
2. **The seam is clean, measured.** The content gateway reaches outside its
   two packages for six symbols (`sor_gateway_kit`: build_auth,
   current_actor, require, run_gateway · `sor_platform`: load_bundle,
   db.pooled_endpoint_for). No edge to sor-learning, sor-pedagogy, or
   zia-tutor anywhere — their AST boundary tests held that line.
3. **The MCP surface is already model-free.** Three tools — search, outline,
   read_lesson — return governed evidence; the calling model composes prose.
   Production (the Zia tutor connector) runs exactly this shape. Serve never
   needs a generation-side model; the embed side is the irreducible key
   (query embedding at read time).

## The manifest

Comes whole (line counts from the live tree; the source manifest's ~9.4k src
/ ~8k tests is the post-trim figure):

| Source                      | Becomes                 | Note                                                                                                                                                       |
| --------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/sor-content/`     | `packages/content/`     | kernel: ingest, chunking, generations, retrieval, calibrate, schema.sql                                                                                    |
| `packages/sor-platform/`    | `packages/postgres/`    | trimmed: load_bundle, pooled db endpoint, contracts minus the 6 Learning/Pedagogy classes (renamed from `platform` 2026-08-20 — see AGENTS.md decision 11) |
| `packages/sor-gateway-kit/` | `packages/gateway-kit/` | only auth + serve + harden + transport_security_from_env (~430 of 918 ln)                                                                                  |
| `gateways/sor-content/`     | the `ksor serve` door   | fail-closed posture; MCP TS SDK, stateless Streamable HTTP (one transport)                                                                                 |

Mirroring the source topology during conversion is deliberate: it keeps the
Python test suite mappable 1:1 as the oracle. Consolidation (platform folding
into content, kit into the CLI) is a post-conversion decision, judged against
the real import graph — the same rule that removed turbo (decision 5,
revision 2026-08-18).

**Drops on the way out** (Agent-Factory-Book-specific, ~1,600 ln with tests):
`docusaurus_sidebar.py` ingest adapter (ksor's corpus is a plain
`knowledge/` tree — `plain_tree.py` is the adapter and it is tested),
`rendered.py` MDX shell rendering, the book's 150-line instance declaration.
Dropped kit modules: `wiring.build_gateway_server`, `manifest.py`,
`publish.py` — tutor-shaped. **Never crosses:** sor-learning, sor-pedagogy,
gateways/zia-tutor, instances/learning, the prompt skills.

Every crossing mechanism still passes decision 6's gate individually —
named in the conversion PR that carries it, with what it is for. First
candidates for that question: the instance-bundle fetch + SHA256 + snapshot
key ring (exists for multi-instance Cloud Run fleets; ksor serve reads one
repo's record) and Redis/Sentry seams (optional there, maybe absent here).

## The integration question, resolved

The extraction analysis posed three options: A — run the Python as a sidecar
container (dead: it makes `ksor init` need Docker + a second language,
killing the scaffold's central promise); B — port the contract to TS; C —
extract the Python as reference implementation + conformance fixtures. The
TypeScript conversion dissolves A's premise entirely (the kernel runs
in-process under Node; Vercel + Neon is a one-push deploy), and **C is how B
is done safely**, not its rival:

1. **Fixtures first.** Gold sets, the `schema.sql` contract, and the
   calibration data — including the floor's measurement history
   (0.58 → 0.625 → 0.634 as the corpus grew) — extract as conformance
   fixtures before any port. They are the red tests.
2. **The Python suite is the oracle.** Each converted package must match the
   oracle's observable behaviour on the fixtures; its tests convert alongside
   it (red first, per $implement-spec).
3. **The crown jewel is the method, not the code.** `calibrate.py` (613 ln +
   698 test) is the only calibrated abstention floor we know of in a shipping
   product; the risk–coverage math and the two calibration doors cross with
   their measurement discipline intact ("record which door produced a floor
   next to it").

## Placement — the ladder, held

Owner-confirmed 2026-08-19:

- **`ksor init` stays database-free.** `pnpm dev` on a fresh scaffold is
  unchanged, forever, at level 0. The out-of-the-box claim ("the owner
  touches knowledge only") and the shipped deploy story hold.
- **The kernel is framework-owned**: workspace packages in this monorepo,
  enrolled in the boundary graph, released by changesets — never thousands
  of lines copied into an adopter's repo. The scaffold's reserved
  `system/gateways/*` slot receives only thin adopter-owned wiring when a
  project climbs to the served rung.
- **CI embeds for real**: `GEMINI_API_KEY` as a repo secret (owner action,
  `docs/status.md`); live calibration/retrieval evals run gated (they spend
  provider tokens), a deterministic test provider covers the fast tiers.

## Adaptations the Python never needed

- **Visibility.** Serve is the third surface behind the staging seam: a
  serve for audience X reads X's stage and can leak nothing past it — the
  same five guarantees the two site shells hold
  (`specs/ksor/visibility/spec.md`).
- **The envelope is a discriminated union** (primitives proposal §6):
  abstention is a type, provenance labels derive from citation + published
  generation — never asserted.
- **instance.md grows keys** (`embedding.*`, `database.*`, retrieval floors)
  exactly where the format reserved them — accepted-and-inert until the
  served rung, then load-bearing.
- **A DB-backed test tier.** Postgres suites cannot live in the <15s
  integration budget; they land gated (the `KSOR_E2E` precedent) against a
  service container in CI, local Postgres or a throwaway Neon in dev.
  Connection strings live in env vars only — never in the tree.

## Sequencing sketch

Small PRs, red first; each conversion PR names what its mechanisms are for:

1. this record + `specs/ksor/serve/spec.md` + the decision entry;
2. fixtures extracted from the oracle (gold sets, schema contract,
   calibration history) + the DB test tier;
3. platform trim + kernel core (schema, db, ingest: chunking, generations,
   manifest) with converted tests;
4. retrieval + calibrate + the abstention envelope;
5. gateway-kit (auth/serve/harden) + the MCP door (stateless Streamable
   HTTP, one transport, $mcp-builder loaded) + visibility integration;
6. `ksor serve` verb wiring, scaffold rung, ops skills conversion, and the
   behavioural eval gate (AGENTS.md → Testing: the abstention question that
   must pass by abstaining).

## Outcome ledger (2026-08-19, same-day)

What landed on the kernel-conversion branch, each slice oracle-anchored:

- **Spine** (coordinator): schema.sql verbatim + renderSchema; the pool
  discipline (one set_config bind; Neon cold-wake retry shape; ingest
  one-attempt); hybrid RRF SQL with the riding abstention signal +
  splitHits drift guard; abstention gates; instance.md adaptation (the
  checker's grammar, fail-closed kernel groups); snapshot HMAC; rlog;
  the service read plane (search/read/outline envelopes); the space
  guard; the gateway (three tools, stateless HTTP one transport, kit posture).
- **Workers**, fixtures-first with the oracle as judge: chunker (33
  cases/79 chunks, 5-mutation battery, policy string unbumped);
  plain-tree adapter + manifest (golden manifest byte-for-byte);
  embedding seam (contract layer, retry asymmetry, single-flight cache,
  breaker; token-bag fake provider added so floors are real in tests);
  calibrate math (92 oracle assertions, CPython compensated-sum parity
  reproduced to the ULP); gateway-kit (55 tests, fail-closed postures
  mutation-verified); read libs (68 tests, SQL live-proven).
- **Acceptance**: a real MCP client spawns the built binary — search
  with citations + snapshot, outline, byte-exact read, the abstention as
  the only passing answer, HTTP fail-closed boot. 424 unit + 114
  integration + the gated db tier, green.

Decision-6 drops, recorded: bundle transport + snapshot key ring as
deployment machinery (ephemeral default kept honest), Redis L2s, rate
limiting, search result cache, Sentry, centroid routing (its title-boost
negative result carried in comments), rerank (retired upstream), book
vocabulary. Divergences that matter, all commented in source: JS/Python
float rounding (half-even reproduced), code-point counting everywhere,
BSD-sed `\b` no-op (perl), pg NUMERIC-as-string coercion, promises
cannot cancel (timeout abandons, never rejects unhandled).

Open at this ledger's write: the ingest pipeline worker (build/carry-
forward/worker/gc + `ksor-content` CLI) and the live-Gemini walk; the
calibrate CLI's doors; visibility-staged serve; behavioural evals in CI.

## The live walk (2026-08-19, real space)

Run against a throwaway Neon at the production space
(gemini-embedding-001/d1536): three example-corpus documents ingested with
real embeddings; the SYNTHESIZED calibration door live (Gemini wrote the
probe questions); the report separable (max OOC 0.553 < min in-corpus
0.682), paste line emitted in the oracle's exact format
(`vector_floor: 0.618 # calibrated on generation None, model
gemini-embedding-001/d1536, door: synthesized`). Under the ratified floor:
both in-corpus questions SERVED with the right document ranked first; the
far-domain question ABSTAINED; and the scope-adjacent near-miss ("what is
the parental leave policy?" against a policy corpus) ABSTAINED — the
near-miss class the testing rules demand, on real vectors.

## The CLI walk (2026-08-19 — the commands an adopter runs)

The full loop, real Gemini, the example corpus, nothing but the shipped
binaries:

```sh
ksor-content schema --instance instance.md --apply     # DDL at the declared space
psql "$DSN" -c "INSERT INTO ingest_tenant_grants (role_name, tenant_id)
  VALUES ('sor_content_ingest', '<name>')"             # authorization is a row, not a flag
ksor-content ingest --instance instance.md --knowledge knowledge/ --flip
#   → "ingest: generation 1 — 4 nodes, 3 chunks; embedded 3, carried 0, failed 0"
ksor-content calibrate --instance instance.md          # synthesized door, live
#   → "vector_floor: 0.611   # calibrated on generation None, model gemini-embedding-001/d1536, door: synthesized"
# paste the line into instance.md (the human ratification act), then:
ksor-gateway                                            # stateless HTTP; loopback by default, a public bind is deliberate
```

Driven by a real MCP client afterwards: tools search/outline/read listed;
"who approves purchases over fifty thousand dollars?" SERVED with
generation-1 citations; "how do I tune a postgres autovacuum daemon?"
ABSTAINED; outline browsed; the document read back byte-faithful.

Review round 1 (independent agent, live-verified): 11 findings — 4
confirmed (chunked-body replay dropped; unbounded chunked-GET read;
audit actor never wired; a false premise under the DNS-rebind
deviation) — all fixed fail-closed in 91c1910 with live probes added.

## Post-review hardening and decisions (2026-08-19)

Two adversarial review passes on the served surface (the reviewer executed
the built code, not only read it) drove a round of fixes and three
architectural decisions. The correctness fixes are done and green; the
architecture decisions are recorded here so the owner can act on them.

### Fixed (fail-closed, with regression tests)

- **The config layer fails closed like the gate it configures.** Unknown
  top-level instance keys are REFUSED (a misspelled `retreival:` silently
  disabled the abstention gate). The fail-closed invariant is now
  representable: `vector_floor: uncalibrated` refuses every serve until a
  number is pasted — three states (number / absent / uncalibrated) where
  there were two.
- **Degradation fails closed**: an embed outage with a declared floor
  abstains; only an undeclared-floor corpus serves keyword-only.
- **Revocation closes the snapshot window**: a pinned read verifies the
  generation is still servable (active or rollback pointer); a withdrawn
  generation's tokens refresh instead of serving it for the TTL.
- **Node/window identity**: the window cursor is a position index into the
  scoped chunk list, not an ordinal (unique per source) or a heading (can
  repeat) — multi-source nodes no longer orphan chunks and repeated
  headings no longer ping-pong. Tenant is forced 1:1 with the corpus so
  per-tenant GC never crosses corpora.
- **DB serving is bounded**: the pool has a native checkout+connect bound
  (never 0) and `maxLifetimeSeconds`; the read path a hard per-request
  deadline; the gateway a `/mcp` concurrency cap that sheds `503 +
Retry-After` instead of queueing invisibly. Proven by a saturation
  db-test (small pool, many concurrent slow reads → excess sheds fast,
  nothing hangs, the pool drains) — the axis every other db test left
  uncontended. The hand-rolled checkout race was replaced by pg's native
  mechanism.
- **Correctness batch**: CRLF normalized before chunking (line-ending
  churn no longer re-embeds the whole corpus); the embedding contract
  checks dimension; the shrink guard counts nodes not slugs; sibling slug
  collisions are named before ingest, not surfaced as an opaque DB error;
  the OUTLINE child_count honors takedown deny; BOM-prefixed frontmatter
  strips; numeric CLI flags validate; graceful SIGTERM drain wired; the
  half-applied-schema and missing-DSN paths exit with the right code.
- **Carried-but-unused, resolved** (rule 9): readcache deleted (dead
  subsystem), RequiredEnvError and runServer's shutdown machinery are now
  wired. platform gained its first tests (classification + saturation).

### Decision A — four packages stay (owner-confirmable)

platform, content, gateway-kit, content-gateway are NOT a Python-layout
mirror; they are the seams the stated multi-record roadmap needs.
gateway-kit + content = content-gateway; the same kit + a future identity
or praxis package = identity-gateway / praxis-gateway. Folding gateway-kit
into content-gateway would force every future gateway to re-implement auth
and hardening; folding platform into content would force identity to
depend on content just for a pool. The turbo removal (decision 5) does not
apply — turbo served no future need; these do. Revisit only if the second
record never arrives.

### Decision B — move the HTTP door to the SDK's Web-standard transport (recommended, next PR)

The door is hand-rolled on `node:http` (~540 lines across http.ts + the
kit's harden/serve). Three review findings landed there (chunked-body
replay, unbounded chunked-GET read, the origins-only rebinding hole). SDK
1.30.0 ships `WebStandardStreamableHTTPServerTransport` (Request → Response)
and `createMcpExpressApp` (with the loopback rebinding logic built in and
correct). Pairing the Web-standard transport with Hono (~14kB, zero deps,
runs unchanged on Node / Vercel Edge / Workers / Bun — which the deploy
story wants) deletes readBody, sendJson, the routing if-chain, and most of
harden, and gets the rebinding default right by using the SDK helper
instead of re-deriving it. Cost: one runtime dep on the PRIVATE
content-gateway (a decision-12 entry, not the published CLI's zero-dep
guarantee — _superseded 2026-08-20: the kernel is bundled into
`@panaversity/ksor`, which now carries `hono` + `@hono/node-server` and is no
longer zero-dep; see AGENTS.md decision 13's revision_) and a rewrite of a
currently-tested door. Timing argument: the
2026-07-28 protocol revision will land in exactly this layer, so land in
the Web-standard shape once rather than migrate the hand-rolled door twice.
Not done in the hardening batch to keep a framework swap out of a
correctness pass.

### Decision C — a migration path is owed before adopters have data

`schema.sql` is one file with no runner (`schema_meta` at 2.1), which is
correct while nothing is released. Before an adopter runs a live corpus and
the schema moves forward, a path must exist: versioned plain-SQL migrations

- a runner keyed on `schema_meta` (raw `pg`, no ORM — decision 12's
  `drizzle-orm` was dropped as unused). Until then the gateway fails closed at
  boot on a too-old or unapplied schema (`assertSchemaCompatible`), rather than
  erroring per-request. Deferred deliberately — building the runner before the
  schema stabilizes and before any data exists is premature — but tracked here
  and in docs/status.md so it is not forgotten.

### The integration path (decision 12, sketched)

> **Superseded 2026-08-20 (decision 12 publish/bundling revision).** This
> section sketched a spawn design — a zero-dep CLI launching a separately
> installed gateway under `system/gateways/`. What shipped instead: the kernel
> is BUNDLED into `@panaversity/ksor` (tsdown `noExternal`), `ksor serve` runs
> the gateway's `main` IN-PROCESS (a direct import, not a launcher), and the
> CLI carries the kernel's runtime deps (no longer zero-dep). The paragraph
> below is kept for the reasoning trail; the shipped shape is decision 12 and
> `specs/ksor/serve/spec.md`.

`pnpm dev` runs the site; `ksor serve` runs the content-gateway. The
published `ksor` CLI keeps zero runtime deps, so `ksor serve` is a thin
launcher for the gateway that the scaffold installs under `system/gateways/`
when a project climbs to the served rung — the kernel packages are its
dependencies there, not the CLI's. This is the shape that gives the 24k
lines their first real consumer; wiring it is the serve slice's own PR.
