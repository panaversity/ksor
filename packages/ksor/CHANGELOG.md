# @panaversity/ksor

## 0.0.6

### Patch Changes

- 3890ad2: fix: a scaffolded project has exactly two commands, one per surface —
  `pnpm dev` for the site people read, `pnpm serve` for the record agents query
  (it applies the schema, authorizes ingest, ingests, and serves). Neither asks
  the reader to decide anything.

  fix: the one-command script is no longer called `up`. `up` is
  pnpm's own alias for `update`, so the script shipped in 0.0.5 was shadowed by
  the package manager: an adopter following the runbook ran `pnpm up` expecting
  to bring their record up and instead upgraded their dependencies. Anyone on
  0.0.5 should use `pnpm run schema && pnpm run grant && pnpm run ingest &&
pnpm run serve` until they re-scaffold.

## 0.0.5

### Patch Changes

- 995f002: feat: scaffolded projects ship a commented `.env.example` naming every
  variable the agent surface needs — the DSN variable, the provider key, and
  `KSOR_AUTH_DISABLED=1`, which a local run requires because `ksor serve` refuses
  to boot unauthenticated. Copy it to `.env` and it is read automatically.

  feat: standing up the agent surface is one command and one config block.
  `ksor` now reads `./.env` automatically (Node-native, no dependency; a real
  environment variable still wins), scaffolded projects get `pnpm up` —
  schema → grant → ingest → serve — and `ksor schema --apply` is re-runnable
  instead of failing on an already-provisioned database, so the whole sequence
  is safe to repeat and doubles as the refresh after editing `knowledge/`.

  fix: a scaffolded project deploys on the first try. The shipped `vercel.json`
  pinned `--frozen-lockfile`, so an adopter's first Vercel import failed with
  `ERR_PNPM_OUTDATED_LOCKFILE` — the scaffold declares a root dependency whose
  stamped version the committed lockfile cannot record.

  fix: the serve runbook no longer tells first-timers to declare
  `retrieval.vector_floor: uncalibrated` before serving, which made every request
  refuse until a floor was measured. Configuring the record needs one `database:`
  block; the abstention gate is turned on deliberately, after it serves.

- 4e84cdf: fix: `ksor serve` reports its real version to MCP clients. In 0.0.4 every
  client saw `serverInfo.version` of `0.0.0`: the gateway read the version from
  an environment variable at module scope, and the CLI's static import evaluated
  that module before the CLI could set the variable. The version now travels as
  an argument, and a test drives the bundled binary to assert it.

## 0.0.4

### Patch Changes

- 473302a: feat: `@panaversity/ksor` now ships the whole Knowledge System of Record as ONE
  package. The kernel (corpus store, hybrid retrieval, calibrated abstention, and
  the MCP gateway) is bundled into the CLI, which exposes one `ksor` binary with
  all verbs: `init`, `dev`/`build` (still exit 2), `serve` (runs the MCP server
  in-process, reading `./instance.md`), and the corpus operations `ingest`,
  `schema`, `calibrate`, `gc`. An adopter installs one thing and the content SoR
  is always present. Note: the CLI is no longer zero-dependency — installing it
  now pulls the server runtime (pg, the embedding SDK, the MCP SDK).

  Because MCP serving is a core surface, `ksor init` now declares
  `@panaversity/ksor` as a dependency of the scaffolded project — pinned to the
  exact CLI version that scaffolded it — with `pnpm serve` and `pnpm ingest`
  scripts, so the served tool is a first-class, version-pinned command rather
  than an `npx` afterthought. The scaffold's first `pnpm install` is non-frozen
  (it resolves the tool and writes the lockfile); `pnpm dev` still needs no
  database.

  The MCP surface ships on the **2026-07-28** spec revision, via SDK v2
  (`@modelcontextprotocol/server`). Since this release is the agent surface's
  debut, it ships current rather than one revision behind: the door serves the
  handshake-free modern era (`server/discover`, per-request envelope) and keeps
  serving 2025-era clients through the same stateless idiom, so nothing that
  works today stops working.

  New verb: **`ksor grant`** authorizes ingest for a corpus (and `--revoke`
  withdraws it) — the row row-level security requires before any write. It runs
  through the same `pg` driver every other verb uses, so finishing setup no
  longer requires dropping out of ksor into `psql`. Idempotent, and it reports
  the state it established rather than a bare "ok". Kept a separate act from
  `schema --apply` on purpose: a schema step that granted itself write access
  would make the tool its own authorizer.

  Scaffold serve-rung fixes (from a multi-agent operability review): the
  scaffolded format checker (`pnpm check`) now accepts the `database:`/`embedding:`/
  `retrieval:`/`budgets:` blocks that `ksor serve`/`ingest` require, so a project
  climbing to serving is no longer rejected by its own CI; the scaffold's
  `pnpm ingest` script now `--flip`s (a first ingest without it left the server
  answering from an unactivated generation); the kernel's build-scripted deps
  (`@google/genai`, `protobufjs`) are denied under `allowBuilds` so the first
  install does not exit 1; and the scaffold `AGENTS.md`/`README.md` now carry the
  full serve runbook — the ordered `schema` → grant → `ingest` → `serve` pipeline,
  the `instance.md` block shapes, the env contract, the generation model, and the
  fail-closed security posture.

- af53bed: fix: `ksor serve` no longer exits when the database terminates an idle
  connection. The Postgres pool had no `'error'` listener, so an idle client
  dropped by a restart, a failover, or an administrative `pg_terminate_backend`
  became an uncaught exception and killed the process instead of being discarded
  and reconnected. Long-running servers were exposed to this on any routine
  database maintenance; the pool now logs the discarded connection's error class
  and keeps serving.
- 4fa4906: test(ci): make the scaffold browser e2e reliable — retry `pnpm build` once on the
  known upstream Turbopack static-image flake (`TurbopackInternalError: Input image
not found`), scoped to that exact signature so a real build break still fails on
  the first try. Test-infrastructure only: the published CLI tarball is unchanged
  (the retry helper is not reachable from the CLI entry and does not ship). The
  durable fix — dropping the scaffold home page's static `app/icon.png` import — is
  tracked as an owner call.

## 0.0.3

### Patch Changes

- 8e88899: The scaffold now answers Vercel's deploy interview: a shipped
  `vercel.json` declares the repo root as the deploy directory (pinning
  `system/site` omits the record — the interview's natural answer breaks
  the build), the static export as the deliverable, and matching trailing
  slashes. The README gains a Deploying section documenting what was
  always true but never written down: the built site is a folder of files
  with zero host-specific dependencies — Vercel, GitHub Pages, nginx, or
  `python3 -m http.server` all serve it, with `KSOR_BASE_PATH` for
  sub-path hosts.
- 113fddd: The record can now declare its audience. A governed `visibility:` key
  (one value, orthogonal to `status:`) against an `audiences:` model in
  instance.md; per-audience **staged** builds enforce it — a build below a
  document's tier carries no trace of it: no page, no search entry, no
  llms.txt line, no sidebar title, no asset bytes, and nothing about the
  filter itself in the client bundle. Non-public builds name themselves.
  Seven checker rules guard the model, including the cross-audience link
  no single build can catch. Absent `audiences:`, nothing changes —
  purely additive. Evidence and the measured build-time-vs-per-request
  decision: the ksor repository's research/visibility.md and issue #10.

## 0.0.2

### Patch Changes

- 54a8f5f: `ksor init` is implemented — the first working verb. One command emits a
  complete governed knowledge project: the record (`knowledge/`), a working
  Fumadocs site (`system/site/`, static export, hot reload, static search,
  llms.txt), the agent kit (AGENTS.md constitution, CLAUDE.md pointer,
  `.agents/skills` with byte-identical `.claude/skills` copies, Gemini
  pointer), adopter CI, and a dependency-free format checker (`pnpm check`).
  Deterministic (every emitted byte ships as template content, lockfile
  included), atomic, offline. Refusals carry stable slugs with working
  remedies; environment failures exit 3 with slugs, never raw stack traces.

  The scaffold ships branded and self-explaining: the KSoR mark as the
  default favicon, a real landing page led by the instance name with the
  first document derived (never hardcoded), a deletable "Built with KSoR"
  maker's mark, a README that explains every emitted file, and a governed
  `order:` frontmatter key that drives the sidebar, `llms.txt`, and the
  home page from one declaration. The site shell is replaceable behind a
  four-clause surface contract, proven by a second (Docusaurus) shell and
  a shell-agnostic conformance suite in the ksor repository.

## 0.0.1

### Patch Changes

- 98aae4a: Rebuilt the package on the real toolchain: the CLI is now compiled TypeScript
  (pure ESM, Node >= 24) instead of a hand-written script, and it exports the CLI
  contract — `exitCodes` (1 refused, 2 not implemented, 3 environment), `verbs`,
  and `resolveCommand` — so scripts and agents can rely on documented exit
  semantics. `ksor --help`/`-h` and `--version` now answer with exit 0; every designed
  verb still answers honestly that it is not implemented and exits 2, and an
  unknown word is refused with exit 1 and a stable `error: unknown-verb` slug. Documentation now ships inside the
  package under `docs/`.

## 0.0.0

Name reservation (published 2026-08-11). The package holds the scope, states
the intent, and ships an honest placeholder CLI: any invocation prints the
reservation notice and exits `2`. Nothing in this version is a released
capability.
