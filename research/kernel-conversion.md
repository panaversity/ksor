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

| Source                      | Becomes                 | Note                                                                                      |
| --------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `packages/sor-content/`     | `packages/content/`     | kernel: ingest, chunking, generations, retrieval, calibrate, schema.sql                   |
| `packages/sor-platform/`    | `packages/platform/`    | trimmed: load_bundle, pooled db endpoint, contracts minus the 6 Learning/Pedagogy classes |
| `packages/sor-gateway-kit/` | `packages/gateway-kit/` | only auth + serve + harden + transport_security_from_env (~430 of 918 ln)                 |
| `gateways/sor-content/`     | the `ksor serve` door   | dual-mode fail-closed posture; MCP TS SDK, stdio + stateless Streamable HTTP              |

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
5. gateway-kit (auth/serve/harden) + the MCP door (stdio + stateless
   Streamable HTTP, $mcp-builder loaded) + visibility integration;
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
  guard; the gateway (three tools, stdio + stateless HTTP, kit posture).
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
