# @panaversity/ksor

## 0.0.11

### Patch Changes

- 0a0dd27: A record describes itself on the surface agents discover it through

  `/.well-known/mcp/server.json` carried one hard-coded sentence — "The <name>
  Knowledge System of Record: governed markdown served with citations and honest
  abstention." — byte-identical in every ksor record ever scaffolded. An agent
  choosing between records in a registry learned nothing from any of them, which
  is the opposite of what that document exists for.

  The description now comes from the record's own prose: its display title and the
  first real sentence of `instance.md`, which is what the intake interview writes.
  A record whose owner has not described it yet SAYS so rather than borrowing a
  confident sentence it has not earned — the same answer the MCP door already
  gives an agent that connects, so the two surfaces do not disagree about whether
  this record knows what it is.

  The scaffold's opening paragraphs are authoring guidance, not scope, so the
  template is detected across the whole body rather than paragraph by paragraph:
  publishing instructions-to-the-author as a description would be worse than
  admitting there is none.

- 0fe759d: Three defects found by auditing 0.0.10 against a live record

  **A repeated `sslmode` was read the wrong end.** `pinnedTlsDsn` took the FIRST
  value of a repeated parameter; `pg` takes the LAST. So on
  `?sslmode=require&sslmode=disable` — whose effective mode is `disable` — the pin
  saw a weak mode, collapsed the duplicates into one `verify-full`, turned TLS on,
  and printed "TLS verified" at an operator whose DSN ended in `disable`. The
  direction was safe; silently overruling an explicit opt-out and then misreporting
  it was not. All three TLS functions now read the mode the driver will use.

  The same sweep asserted the larger worry the pin creates — that re-serializing a
  connection string could alter a credential. Seventeen DSNs with the passwords
  people actually paste (raw `@`, spaces, `%`, `+`, brackets, non-ASCII,
  percent-encoded separators) are now checked field by field against `pg`'s own
  resolved view: everything the driver derives is byte-identical, and so is the
  TLS decision.

  **The outline's `position` disclosed documents an audience may not see.** It was
  the rank in the whole record, so a public caller received 1, 3, 4 — a gap exactly
  where an internal sibling sat, telling them something exists and roughly where.
  The same row's `child_count` was already computed over visible children only, so
  one response object disagreed with itself. `position` is now the rank among the
  siblings the caller can see, computed as a window over the filtered set so it
  stays correct across pages and at every depth, and both it and `depth` say what
  they are in the tool schema.

  **`ksor serve` now says when the record has no identity yet.** The MCP door
  already refused to pass an unedited `instance.md` to agents as instructions —
  it substitutes a plain statement that the scope is unstated — but the operator
  starting the server was told nothing, so a record serving with no declared
  identity looked exactly like one that had been described. It is a boot line now,
  beside the abstention posture: both answer "how much should I trust this".

- f5cd885: The bearer door's key line joins the boot block instead of interrupting it

  In bearer mode the line naming where the signing keys were discovered printed
  before the aligned posture block and in a different shape, so it read as a stray
  log line rather than as part of what the server was telling you about itself. It
  is a `keys` row in the block now, under `auth`, resolved at boot exactly as
  before.

- 5f30b5f: The site build no longer fails when two evaluations of the record staging overlap

  The scaffold stages a per-audience copy of the record before the site build
  reads it, removing the previous stage first. `rmSync(..., { force: true })`
  suppresses ENOENT but retries nothing: Node retries EBUSY / EMFILE / ENFILE /
  ENOTEMPTY / EPERM only when `maxRetries` is set, and it defaults to zero. The
  bundler evaluates the source config more than once when it wants it in more than
  one place, so one run could remove the stage while another was still copying
  into it — surfacing as `ENOTEMPTY` and failing the entire site build (seen once
  in CI, 2026-08-21).

  The removal now asks for those retries. Losing that race is safe: the stage is a
  deterministic function of the record and the denylist, so redoing it produces
  the same bytes.

  Three claims in the scaffold's `AGENTS.md` that recent releases made false are
  also corrected: `--actor` no longer "defaults to the operating user" (it is
  required, and there is no default by design); the signing keys are discovered
  from the SSO's own metadata rather than fetched from Better Auth's path; and the
  `order:` key now drives the MCP `outline` tool alongside the sidebar and
  `llms.txt`, which is what "one order drives every surface" was always supposed
  to mean.

- 4a1c154: The shrink guard guards `ksor ingest --flip` again — it had stopped

  `.env.example` documents `KSOR_MAX_SHRINK` as "a corpus that shrinks by more
  than this FRACTION refuses to flip". In 0.0.10 it did not. Deleting eight of ten
  documents and running `ksor ingest --flip` published the two that were left,
  silently, exit 0.

  The cause was the fix that stopped a refused ingest from publishing. That moved
  the flip out of `buildGeneration` and into the command, so the governance gate
  could run against the new generation BEFORE it became the active one — and the
  shrink check, which lived inside the build's flip branch, was stepped straight
  over. The library test that covers the guard stayed green throughout, because it
  drives `buildGeneration` directly with `flip: true`, which is no longer the path
  the CLI takes.

  There is now one answer to "may this generation be activated" — `flipRefusal` —
  and both flip paths ask it, in the same transaction as the flip itself. The new
  test drives the command rather than the library, so a guard that only one of two
  paths performs fails the tier that proves it.

  Verified against a live record: a 10 → 2 node build now names all eight removed
  documents, refuses with exit 1, and leaves the previous generation serving.

## 0.0.10

### Patch Changes

- c07a5db: `ksor calibrate` states what its measurement is worth, not just its result

  The default door synthesizes in-corpus questions by asking a model to write one
  FROM each sampled passage, then scores those questions against the corpus that
  contains the passage. They share vocabulary a reader's question will not, so the
  in-corpus distribution sits higher than real traffic will and the separation the
  run reports is an UPPER BOUND. The `--queries-file` door carried a caveat about
  its own distribution; the default door — the biased one — carried none.

  Found live: a real record calibrated this way reported min in-corpus 0.682
  against max out-of-corpus 0.580 and recommended `vector_floor: 0.631`. Questions
  the record demonstrably answers then scored 0.530 to 0.606 — every one below the
  recommended floor. Pasting it would have made the record abstain on questions
  whose answers it had just cited, which is the failure abstention exists to
  prevent, arrived at from the other side.

  The block now carries that caveat, and prints the one number it always left the
  reader to work out: the separation margin, with the probe counts behind it. A
  margin of 0.054 over six in-corpus and four out-of-corpus probes is a different
  claim from the same margin over sixty, and both figures were already on the
  report without ever reaching the page. The mathematics and the recommended value
  are unchanged.

  It also names the generation it measured. With nothing pinned — the ordinary
  case, calibrating what is being served — the report carried no generation at
  all, so the provenance comment beside a pasted floor read `on generation unknown
(no generation pinned)`. A floor is a threshold inside ONE generation's embedding
  space, and the query that counts the chunks had already resolved which one.

  `runCalibration` had no test of any kind; it has one now, against real Postgres.

- d00f3a2: The signing keys are discovered, not guessed — any standards-compliant SSO now works.

  `KSOR_SSO_URL` is documented as "the AS base", and the verifier appended one
  vendor's layout to it (`/api/auth/jwks`, Better Auth's). Auth0, Okta, Entra,
  Keycloak, Cognito and Google all publish elsewhere, so every one of them failed
  the key fetch — which is classified transient, so the door booted clean and
  returned 503 to every request with nothing naming the cause. The only posture an
  operator could actually reach was `KSOR_ALLOW_PUBLIC_UNAUTHENTICATED=1`: the one
  key we handed people was the one that props the door open.

  `jwks_uri` is now read from the SSO's own metadata document — RFC 8414 first,
  then OpenID Discovery — with `KSOR_JWKS_URL` kept as an explicit override, and
  the vendor path kept as a last resort that reports itself as a guess. Where the
  keys came from is stated on the boot line.

  Verified against three real providers: Google (RFC 8414, cross-origin
  `jwks_uri`), GitHub Actions OIDC, and Entra — whose issuer carries a path,
  the case a naive `${sso}/.well-known/…` gets wrong.

  Discovery never refuses to boot: an unreachable AS falls back and says so.

- 9062088: A loopback authorization server's keys are reachable again.

  JWKS discovery refused a cleartext `jwks_uri`, which is right for a network AS
  and wrong for a local one: a dev authorization server on loopback advertises
  `http://127.0.0.1:…/jwks`, the resolver refused it, the vendor guess was used
  instead, and every request returned 503. `assertHttpUrl` already exempts
  loopback for the SSO base for exactly this reason; the resolver now does too.
  Cleartext to any non-loopback host is still refused.

  Found by writing the first test that boots the gateway in bearer mode.

- 995ec48: A governance act names its actor; the tool no longer guesses one.

  `ksor takedown --actor` fell back to `$USER` / `$USERNAME` / `"operator"`, so a
  ledger row read `runner` under CI and `root` in a container — a self-asserted
  string wearing a schema, indistinguishable from a person who was never there.
  `retrieval_log.actor` is `NOT NULL` with the comment "NO default: unset errors
  loudly", and the fallback is precisely what stopped it erroring.

  Denying or revoking now REFUSES without `--actor`, before the DSN is resolved:
  a missing actor is an argument error (exit 1), not an environment one. The
  read-only modes — `--list`, `--ledger`, `--export` — write no ledger row and
  need nothing.

- 41b0c38: Reading order is one rule again: the MCP door now reads `order:`

  `order:` is the only ordering key a record may declare — it is in the governed
  frontmatter set the format checker closes, and the checker's own remedy for a
  stray `meta.json` says so. The MCP door never read it. The tree adapter was
  converted from the predecessor, whose ordering keys were Docusaurus's
  `position:` / `sidebar_position:`, neither of which a compliant record may
  declare — so `outline` reported the record's structure in filename order and
  called it the reading order, while the website honoured `order:`. On a
  curriculum, where reading order IS the content, an agent asking "what do I read
  first" got a different answer from the two surfaces.

  Four smaller disagreements went with it, each now a row in a shared decision
  table: unordered documents sorted at 10 000 rather than after everything;
  fractional orders were truncated; ties compared `example.md` against
  `example-two.md`, where `.` sorts after `-`, reversing ordinary pairs; and one
  side folded case while the other did not.

  The rule now lives in one file, copied into the scaffold and asserted
  byte-identical, with `ORDER_CASES` run against BOTH surfaces — so a surface that
  drifts fails on the row it broke.

- 41b0c38: `ksor serve` reports its own posture instead of forwarding other people's warnings

  Booting printed four alarming paragraphs at an operator who had done nothing
  wrong: the driver's multi-line `SECURITY WARNING` about `sslmode` aliases, ksor's
  own three-line restatement of the same thing, and the MCP SDK's note about a
  `responseMode` ksor chose deliberately.

  The driver's warning is correct and its remedy is one word, so ksor now applies
  it: a remote `sslmode=require|prefer|verify-ca` is rewritten to `verify-full`
  before the connection is made. The connection is unchanged today — pg 8 was
  already resolving all three to full verification, which is the entire content of
  its warning — and it can no longer be silently downgraded by a driver upgrade.
  The SDK's note describes a recorded decision, not a defect, and is suppressed by
  exact message so that anything else it says still reaches the operator.

  What is left is the record's posture, aligned and in ksor's own voice, with the
  two lines that decide whether to trust what happens next saying what they mean:
  auth `DISABLED` now names the bind it is survivable on, and an absent abstention
  floor says out-of-corpus questions will be answered rather than refused.

- bea7d80: `read` names every section it will accept, not just the top-level ones

  `read` resolves a `heading` three ways: a full heading path, any prefix of one,
  and a section's last segment when that segment is unique in the document. The
  error for a section it could not find listed only the TOP-LEVEL segments — a
  strict subset of its own vocabulary — so it reported real, reachable sections as
  absent. Found live: a nested section was refused by name and served on the next
  call under the same name.

  The error now lists the full heading paths (the form that always resolves and
  never collides), states the unique-last-segment shorthand rather than doubling
  the list to enumerate it, and counts the tail past twenty instead of printing an
  unbounded list. The `heading` input and the `sections` output now describe the
  same vocabulary in the tool schema, where an agent reads it before making the
  call rather than after failing one.

- 4631268: Correct every remaining document that said `pnpm serve` publishes.

  `serve` was `pnpm schema && pnpm grant && pnpm ingest && ksor serve` and is now
  `ksor serve` alone. Three adopter-facing places still described the old chain:
  the scaffolded `instance.md`'s own comment ("copy .env.example to .env, then run
  `pnpm serve`"), the scaffold README's file table ("the agent surface: schema →
  grant → ingest → serve"), and AGENTS.md's runbook ("`pnpm serve` is the only
  command this rung needs"). Following any of them serves an empty record.

  All three now say the same thing the CLI does: `pnpm provision` once,
  `pnpm refresh` to publish, `pnpm serve` to serve — and why publishing is
  separate, since a restart or an autoscaling event must not republish a record.

  A test now asserts the CLAIM rather than the command. The existing guard could
  not catch this: it checks that a named command exists, and `pnpm serve` does
  exist — what was wrong was the sentence attached to it.

## 0.0.9

### Patch Changes

- f5ad207: A refused `ksor ingest --flip` no longer publishes.

  The governance gate added in 0.0.8 ran _after_ the build, and the build had
  already flipped — so an ingest into a state no surface can serve reported the
  problem, exited 1, and left the record's active pointer moved to the generation
  it had just refused. The shrink guard does the opposite and always has: it
  refuses inside the build and leaves the old generation serving.

  `ingest` now builds without flipping, runs the gate against the new generation,
  and activates only if it passes. A refusal says what was left behind and that
  the previous generation still serves; `ksor gc` reaps the abandoned one.

  Found by running the real 0.0.8 package against a live Neon database rather
  than by reading the code.

## 0.0.8

### Patch Changes

- bfacb31: Correct the documented serving posture, and name the agent surface at `init`.

  The docs said `ksor serve` "binds loopback with auth off by default". It never
  did: `buildAuth` refuses to boot unless SSO is configured or
  `KSOR_AUTH_DISABLED=1` is explicit — loopback included. An adopter who followed
  the prose instead of `.env.example` exported only the DSN and the provider key
  and hit a boot refusal they had been told would not happen, and the sentence
  advertised a weaker posture than the product actually ships. Both READMEs and
  the scaffold's `AGENTS.md` now say what the code does; the scaffold's own
  `.env.example` and setup steps were already correct and are unchanged.

  `ksor init`'s closing handoff now names `pnpm serve` alongside `pnpm dev`, so
  the MCP surface is visible at the moment the adopter is reading the screen
  rather than only in the runbook.

- 082df27: Governance now lives on the record, and databases can move forward.

  **`visibility:` is enforced on the MCP surface.** It used to be enforced only by
  the site's build-time staging step, because ingest dropped the key and the agent
  door had nothing to filter on — a document marked `visibility: internal` was
  hidden from the website and served in full to every agent. Schema 2.2 carries
  `visibility`, `doc_status`, `owner`, `provenance`, `superseded_by` and
  `corpus_id` on `content_nodes`; one seam (`lib/audience.ts`) binds the filter
  into search, read and outline. A server that cannot establish who is asking
  serves the least-privileged tier; an unknown tier refuses rather than widening;
  a record that declares no `audiences:` is unfiltered exactly as before.

  **A takedown now reaches BOTH surfaces, and has a door.** `ksor takedown
<stable-id> --reason …` imposes one (`--subtree`, `--list`, `--revoke`), through
  the ingest role rather than a superuser psql prompt, writing the §7 row that
  records who did it in the same transaction as the denial. `--export` writes the
  manifest the site build reads, so a withdrawn document stops being published on
  the human surface — `llms.txt` included. Schema 2.3 adds the write policy this
  needs, and a `sor_content_auditor` role: `retrieval_log` had FORCE row-level
  security, an INSERT policy, and no SELECT policy or grant, so the provenance
  ledger the governance story rests on was write-only under every credential ksor
  ships.

  **The calibrator no longer hands out a floor it just measured as leaking.** When
  a measurement does not separate in-corpus from out-of-corpus, the report says so
  and names the fail-closed state (`vector_floor: uncalibrated`) instead of
  printing a paste-ready number — the intended operator is a coding agent, and it
  will paste what it is given. Two reporting bugs replicated from the Python
  predecessor are also fixed: a missing generation printed Python's `None` literal
  into the provenance comment, and the alternate-floor line always claimed
  0.95-precision whatever precision was actually measured. Byte-fidelity to the
  oracle is for algorithms, never for reports. The paste line now carries the
  measurement DATE, which the invariant asked for and it never had.

  **Forward migrations.** `schema/migrations/<from>-<to>__<slug>.sql` with a runner
  that walks the chain rather than sorting it, so a missing step refuses instead of
  being skipped. `ksor schema --apply` now compares versions instead of checking
  presence, and migrates an existing database forward — replacing "drop and
  recreate", which destroyed `retrieval_log` and `takedown_denylist`, the only two
  tables that cannot be rebuilt from markdown.

  **A wake-from-suspend is retried instead of failing the request.**
  `connectionTimeoutMillis` bounds two different failures and Postgres reports
  both with the same text: waiting for a slot in a saturated pool, and failing to
  establish a connection at all. ksor treated both as saturation, which is never
  retried — so on a serverless endpoint the first request after an idle period,
  the one most likely to hit a cold start, was the one request that got no
  retries. Measured against a black-holed endpoint: one attempt, 10s, with five
  retries and a 30s budget unused. The two are now told apart by the pool's own
  state and only saturation sheds.

  **A dropped connection no longer kills `ksor serve`.** pg-pool removes a
  client's error listener for the duration of a checkout, so a connection dying
  mid-query became an uncaught exception and exited the process — the failure mode
  of every serverless endpoint that suspends its compute. Checkouts are now
  guarded and broken connections are discarded rather than reused.

  **Search is no longer O(corpus).** The vector arm ranked with a window function,
  which no HNSW index scan can satisfy, so every search computed the distance for
  every chunk and sorted. Measured on PostgreSQL 17.7 / pgvector 0.8.2 at 20k rows:
  452 ms → 39 ms, with the index actually used.

  **`ksor serve` refuses where `pnpm build` refuses.** Two states had the site
  stopping by name while the agent door came up clean and served the restricted
  half. A database migrated to 2.2 carries the governance columns but no VALUES —
  a migration cannot read frontmatter — and a NULL visibility reads as
  `default_visibility`, the widest tier, so an adopter who migrated without
  re-ingesting served every restricted document to every agent with the schema
  check green. Schema 2.4 stamps each generation with the schema it was built
  against, and serve refuses a generation older than the governance columns,
  naming `ksor ingest` as the fix. A document declaring `visibility:` in a record
  with no `audiences:` block is refused too, matching the site's
  `ksor-visibility-without-audiences`.

  **A `--subtree` takedown now reaches documents added after it.** The exported
  manifest could only name what the active generation contained, and the site
  builds from disk — so a document written under a withdrawn section and not yet
  ingested was published to `/docs` and `llms.txt` with no warning anywhere. The
  manifest now carries the DIRECTORIES a subtree denial governs, derived from its
  descendants' recorded file paths. The site also checks the manifest belongs to
  this record: one exported for a different instance used to pass every gate and
  apply the wrong denial set.

  **The readiness probe answers, and means something.** `/ready` reports NOT ready
  while the schema is unverified, instead of green on an instance where every tool
  call would fail on a missing column; the boot check is retried like a serving
  read rather than treated as permanently unknown after one cold start; the whole
  readiness chain shares one wall-clock budget (measured: 10.25s → 8.07s against
  an unreachable endpoint); and concurrent probes share one in-flight check
  however slow it is, instead of stacking a connection each.

  **An embedding outage is no longer reported as "not in the record".** On a
  record with a cosine floor, an unreachable provider means the floor cannot be
  evaluated, so nothing may be served past it — but the abstention envelope tells
  an agent the record does not cover the query and to say so without falling
  back. For the whole outage the agent would assert the record lacks something it
  contains. Searches now return a third outcome, `reason: "unavailable"` with
  `abstained: false`, described in the tool text and the output schema alongside
  `degraded_reason` (which had no description at all, and named a keyword search
  that never ran).

  **A new user is told how to start, and the instructions work.** The README's
  only description of how to reach the agent surface was `pnpm serve # schema →
grant → ingest → serve` — a chain that no longer exists, so following it
  literally serves an empty record. It is now the three deliberate steps
  (`provision`, `refresh`, `serve`) with the reason they are separate, and
  `ksor init`'s own handoff names the publish step it was skipping. The README
  opens with a Start here section that gets you to a running site and then says
  what to do next — open the project in your coding agent, which is the interface.

  **`KSOR_DB_CONNECT_PER_REQUEST=1` closes each connection when its call
  finishes.** Off by default, because the default measures better: a quiet server
  already holds zero connections, and inside a burst the handshake is paid once
  (2.58ms/call per-request against 0.13ms pooled on loopback; a remote TLS
  endpoint widens it). The option is for the deployment where a pool is a fiction
  — an external pooler sidecar, or a runtime that reuses no process between
  invocations.

  **Retrieval stems in the record's language.** `to_tsvector('english', …)` was
  hardcoded in a STORED generated column and at four query sites, against the
  claim that the owner writes "in any language they write in" — and on an
  uncalibrated record the keyword arm is the only arm that gates.
  `retrieval.text_search_config` is declared in `instance.md`, rendered into the
  DDL the way the embedding dimension is, and parameterised (`$n::regconfig`) on
  the query side. Because the column is STORED, changing it after a corpus exists
  restems nothing, so a mismatch between the declared value and the one the
  database was built with refuses at boot.

  **The TLS posture is chosen, not inherited.** pg 8 resolves
  `sslmode=require|prefer|verify-ca` to full verification, and the driver warns
  that those adopt libpq semantics — no certificate verification — in pg 9. The
  option is now passed explicitly for remote endpoints, so a dependency bump
  cannot silently downgrade a deployment. Behaviour on pg 8 is unchanged; the
  point is that it stays unchanged.

  **`outline` carries `permalink`.** It was fetched by every retrieval query,
  width-guarded, then dropped before the wire — so no citation could resolve to a
  page a person can open.

  **`read` takes `snapshot_token`, not `snapshot`.** `search` returns `snapshot`
  as an object and `read` accepted `snapshot` as a string, so an agent copying the
  field of that name from one into the field of that name in the other got an
  input-validation error instead of a pinned read. Declaring the output schemas
  turned an informal ambiguity into a validated contract that contradicted itself.

  **A database that lost its `schema_meta` row is refused, not blamed on the
  network.** The remedy was passed to an error whose constructor takes a class
  name, so a multi-line fix printed inside "content store temporarily unavailable
  (…)" and exited 3 — telling the operator to chase connectivity for a data
  problem that will never fix itself.

  **`ksor takedown --ledger` shows THIS record's acts.** It filtered by tenant
  only while every governance write records the corpus, so a tenant serving two
  records saw one audit trail polluted with the other's.

  **`outline` frames its text as untrusted, like the other two tools.** Titles and
  heading paths are corpus-authored and reach the agent exactly as passage content
  does; `search` and `read` both said so and flagged directive-shaped payloads,
  and `outline` did neither.

  **`pnpm setup` never ran your setup.** The scaffold shipped a script named
  `setup` and three documents told the adopter to run it — but `pnpm setup` is
  pnpm's own installer, and it wins. The documented step printed "No changes to
  the environment were made", exited 0, applied no DDL, and the next command
  failed with `relation "corpora" does not exist`, blaming the database for a step
  that never ran. The script is now `pnpm provision`, and a test rejects any
  scaffold script named after a pnpm command.

  **A takedown that the site cannot honour says so.** A scaffold is adopter-owned,
  so upgrading the CLI does not touch their `system/site` or their `package.json`.
  A project scaffolded before the denylist manifest existed has neither the build
  step that exports it nor the staging code that reads it — so a takedown was
  imposed, the CLI's own remedy was followed exactly, the site rebuilt, and the
  withdrawn document was still published while the MCP door refused it. `--export`
  now detects both halves and prints the exact edit for each.

  **A record with nothing published no longer answers "not in the record".**
  Following `ksor init`'s printed next-steps reaches a provisioned but never
  ingested record, where every question got `abstained` — an assertion about
  coverage for a record that is simply empty. That is now
  `reason: "unpublished"`.

  **A door whose boot checks have not passed refuses requests.** Reporting
  not-ready keeps a platform from routing traffic; it does not stop anything that
  reaches the port. A gateway that started against an unreachable database and
  recovered moments later answered `{"ready":false}` and still served a
  `visibility: internal` document to a direct request. The schema and governance
  checks are one deferred set, retried together, and they gate every request with
  a 503 that names the remedy.

  **`ksor ingest` refuses to publish what `ksor serve` cannot serve.** It exited 0
  on a generation the door then refused to boot on, so the deploy step was green
  and the container crash-looped.

  **The MCP discovery document is valid.** `/.well-known/mcp/server.json` failed
  the published schema on four counts at once — no `version` (required), a `name`
  without the required `namespace/identifier` shape, no `$schema`, and a
  `capabilities` field the schema does not define. `instance.md` gains `version:`
  alongside `mcp_url:` to feed it.

  **`outline` pages.** It truncated at `limit` with no way to continue and did not
  mention `limit` or `has_more` in its description, so an agent read a partial
  list as the complete record. It now takes `offset` and returns `next_offset`.

  **A cold burst is no longer mistaken for an overloaded pool.** pg-pool counts a
  socket that is still completing its handshake as a full slot, so a burst of
  requests arriving at a waking database looked like saturation and was shed
  permanently — with identical requests getting opposite verdicts depending on
  arrival order. Saturation is now measured by connections that actually
  connected.

  Also: every envelope now reports the abstention `gate` and the measured
  `top_cosine`, so `ok=true` from an uncalibrated record can no longer be read as
  coverage; the MCP server states four framework rules in its instructions instead
  of serving the unedited scaffold placeholder; `ingest` records the git commit it
  ingested instead of the literal string `unspecified`; `pnpm provision`
  separates applying DDL and granting ingest from starting a server, and
  `pnpm refresh` (ingest then gc) collects retired generations; the scaffold ships the `database:` block its own
  runbook requires, and `env.example` documents the production variables the code
  actually reads; shutdown logs and has a deadline; pool sizing and the TLS posture
  are chosen rather than inherited; `ksor takedown --export` reads through the
  runtime role rather than the ingest role, so a site build host no longer needs
  write access to the record; and `KSOR_DRAIN_TIMEOUT_MS` is read when the server
  starts rather than when the module loads, which is what made it inert in `.env`; `gate: "uncalibrated"` is gone from the
  tool description and output schema, because that state throws rather than
  reaching the wire; and the docs name every verb the binary has, with a drift
  test that fails when they stop matching.

- bfacb31: `ksor init` now names `pnpm serve` in its next-steps output, and the docs stop
  describing an auth-off default that never existed.

  The handoff printed after scaffolding listed `pnpm install` and `pnpm dev`, so
  the agent projection — the core surface of every KSoR — went unnamed at the one
  moment the adopter is actually reading the screen.

  Separately, decision 7's serving clause and the three docs that copied it said a
  local `serve` "binds loopback with auth off". `buildAuth` has never had that
  default: it refuses to boot unless SSO is configured or `KSOR_AUTH_DISABLED=1`
  is set explicitly, loopback included. The real posture is stronger than the
  sentence claimed, but the docs were telling adopters a local `serve` would come
  up without the flag it requires.

## 0.0.7

### Patch Changes

- fcd44db: feat: restarting an unedited record is free. `ksor serve` runs ingest on every
  start, and ingest now compares the corpus it just read against the generation
  already serving — identical content at the same source commit consumes no
  generation, writes no rows, and embeds nothing ("unchanged — generation N
  already serves this corpus"). Editing a document still builds a generation and
  re-embeds only what changed, and a new source commit over identical bytes still
  records one, because that is a build fact provenance must keep.

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
