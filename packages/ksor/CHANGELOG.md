# @panaversity/ksor

## 0.0.33

### Patch Changes

- 8f8d7b5: A third worked authorization recipe: Auth0, the hosted provider with a free
  tier — written around the confusions rather than the happy path, because every
  step in it is one that was got wrong first on a real tenant.

  The recipe leads with the thing that causes the trouble: **Auth0's "API" is your
  ksor door, and Auth0's "Application" is whoever calls it.** From there it covers
  what a scripted caller needs versus an interactive one (they are two different
  applications, because a machine-to-machine app has no browser and filling in its
  callback field changes nothing), and the authorization step that hides — it
  lives on the API rather than the application, and it is a `Grant Access` button
  inside an `Edit` panel, not the toggle the table appears to offer.

  Also records what Auth0 gets right: it honours RFC 8707, so an MCP client sending
  `resource=<your mcp url>` receives a token audienced there with no vendor
  parameter and no mapper.

  Also answers the question that comes BEFORE any recipe and that the page never
  addressed: **will your provider work at all?** Three checks — does it issue
  RS256 JWTs rather than opaque tokens (the door verifies signatures itself and
  makes no introspection call), does it publish RFC 8414 or OIDC metadata so the
  keys can be discovered, and can it mint a token audienced at your identifier.
  A provider failing any one of them cannot be used, and today that is discovered
  several screens into a vendor console rather than in the first minute.

  The page was then read cold by someone who had never used any of the three
  providers, and their report is the rest of this change. It found the page
  answered neither of the two questions a deployer has first, and contradicted
  itself on a third:

  - **What does this protect?** Only the MCP door. The website is a separate
    surface and stays exactly as public as it was — now stated before anything
    else, along with the fact that this is one gate rather than per-user rules
    (the door reads no scopes; different readers seeing different documents is the
    record's `audiences:` model, a different mechanism).
  - **`KSOR_MCP_RESOURCE_URL` "never has to resolve"** was wrong. The authorization
    server never fetches it, but a client does — it is where `www-authenticate`
    points. An invented value boots green and breaks discovery silently.
  - **`KSOR_AUTH` appeared only as "delete any"**, undefined, inside one recipe, so
    readers of the other two never saw it — while a scaffold ships it SET. It is
    now defined once, up front, as the first thing to remove.
  - **`KSOR_SSO_URL` "is the issuer"** contradicted a later warning that the two
    are deliberately different strings. The general rule is now stated once: one
    is a base for path joining, the other is compared byte-exact.
  - **"Three variables"** introduced a four-row table, and three more were
    scattered across the page. Six now, in one table, with formats.
  - **Nothing verified against the door.** A new section decodes the token
    (`aud`/`iss` — the debugging step for this page's own stated failure mode) and
    checks both the refusal and the acceptance, in that order.
  - The Auth0 recipe dead-ended at "Save Changes" without saying what the client
    credentials were for, and its step 3 read as permission to skip step 5 — the
    step it calls "the one that hides".

- 8f8d7b5: `deploying.md` and `ingesting.md` were each read by someone who had never used
  the tool, told to find where the document stranded them. Both were, in the
  reviewer's phrase, "the second half of a guide whose first half doesn't exist" —
  prose by someone who had forgotten what it is like not to have the environment
  already working. This is that first half, plus the contradictions the read
  surfaced.

  **A prerequisites block on both pages.** `ingesting.md` used the word "provider"
  five times without ever naming Gemini, saying which variable holds the key, or
  where to get one — a hard blocker on line 1. Neither page said the database needs
  pgvector, where `knowledge/` lives, or which directory the commands run from.
  `deploying.md` now opens with the four things that must exist and the order they
  happen in, because its own text described skipping ingest as "the single most
  common 'it deployed but does not work'" while telling the reader publishing was
  "not on this page's critical path".

  **A wrong claim about `gc`, corrected.** `ingesting.md` said `gc` "reaps the ones
  nothing points at any more" directly after promising the previous generation as a
  rollback target — reading as though the routine `pnpm refresh` destroys the safety
  net it just created. It does not: `gc` never collects the active generation, the
  rollback generation, or any generation a live snapshot token could pin, and always
  leaves at least two standing.

  **A verification section on both.** Neither page showed how to tell a working
  record from a broken one — the failure `ingesting.md` opens by warning about had
  no instrument. `deploying.md` gained the same for auth.

  **Corrections found by the read:** the local `docker run` example could not work
  as written (a container binds `0.0.0.0`, so it needs `KSOR_AUTH=disabled-public`
  even on a laptop); the summary table sold the site as "upload a folder to any
  static host" while its build refuses without a DSN; `KSOR_AUTH` had no documented
  value for the SSO path (you unset it); `KSOR_ALLOWED_HOSTS`, `KSOR_ALLOWED_ORIGINS`
  and snapshot-key rotation had no formats; `KSOR_MCP_RESOURCE_URL` was ambiguous
  about the `/mcp` path; and an ordinary ingest needs a site rebuild too, which was
  stated only for takedowns.

  The pooler section — the longest technical passage in `ingesting.md`, about a
  classification the same section calls informational — is cut to four sentences.

  Adds a fourth recipe: **Better Auth**, an organization's own SSO — the case that
  matters most for "vendor-free is the ownership argument", because it is the one
  with no vendor in it. It is also the simplest shape on the page: a static public
  client with PKCE, **no client secret**, no dynamic client registration, and no
  authorize-this-client-for-that-resource step at all — the step that costs an
  afternoon elsewhere simply does not exist.

  Both it and Auth0 were connected to the same assistant against the same record,
  changing only environment variables. That is the neutrality claim in its testable
  form: **moving authorization servers is an environment change, not a code
  change**, and the two audience variables do not change at all because they
  describe the record rather than the provider.

  Also names the vendor behind the JWKS fallback (`/api/auth/jwks` is Better
  Auth's layout) — the cold read flagged it as "a vendor default and the vendor is
  never named", and it turns out to be the same stack the door was first written
  against.

- 48f2a3c: Search the record in the language it is written in.

  The scaffolded site pinned its search index to English tokenization. That is a
  per-language splitter regex, and English's is Latin-only — so an Urdu, Chinese,
  Japanese or Korean document indexed to **zero tokens** and could not be found,
  while its page still rendered, still appeared in the sidebar, and still appeared
  in `llms.txt`. Nothing went red. A record written in a non-Latin script was
  published complete and silently unsearchable, which broke ksor's own claim to
  hold "plain markdown, in any language you write in".

  The pin bought nothing in exchange. Since fumadocs-core 16.14.0 the engine is
  ZBSearch, which disables stemming and installs empty stopwords by default, so
  `english` and `multilingual` return identical results on English text —
  including the same miss (`recordings` does not find `recording`) under both.

  The option is removed, so the engine keeps its own `multilingual` default and
  segments every script. Existing English records are unaffected apart from a
  small index-size change: the multilingual segmenter splits hyphenated
  identifiers that the English splitter kept whole, which grows the exported index
  by roughly 2% on a technical corpus.

  Restoring stemming for any language remains available and is a separate,
  deliberate change — it needs a stemmer dependency and the same tokenizer handed
  to the browser, not a one-word option.

## 0.0.32

### Patch Changes

- 658c496: One instruction per tool, as tabs.

  A document that has to say the same thing two ways — one command for one agent,
  another for another — can now put each in its own fenced block and give the
  fence a `tab`:

  ````markdown
  ```bash tab="Claude Code" tab-group="agent"
  curl -fsSL https://claude.ai/install.sh | bash
  ```

  ```bash tab="OpenCode" tab-group="agent"
  curl -fsSL https://opencode.ai/install | bash
  ```
  ````

  Consecutive blocks declaring a `tab` become one tab group. **This is still
  CommonMark** — a fence's info string is free text, so any other markdown reader
  shows both blocks one after another, correct and readable, just without the
  picker. Nothing framework-shaped enters `knowledge/`.

  `tab-group` is the part worth knowing: blocks sharing a group name switch
  together across the whole page, and the choice is remembered for the reader's
  next visit. A document with ten tabbed sections is one decision rather than ten.

  A tool the site recognises takes its own colour and mark on its tab — Claude
  Code and OpenCode ship known. Anything else renders in the site's own accent,
  which is the right default for tabs that are `npm`/`pnpm` or `US`/`EU`. The list
  lives in `system/site/app/global.css` and is yours to extend or delete.

## 0.0.31

### Patch Changes

- c69232d: Adversarial coverage for the MCP door (issue #33), first slice: the governance
  leak sweep and cross-replica snapshot behaviour.

  **A withdrawn document must not appear in any field of any reachable response.**
  The existing takedown test proves each serving arm behaves at the arms someone
  thought of. This one plants an unguessable marker inside the withdrawn document
  — in its body _and its title_ — and asserts the marker appears nowhere in the
  serialized result, across eighteen request shapes: search by body, by marker, by
  title words, at several limits, keyword search, `topOneScore`, read by
  stable_id / slug / qualified path, and outline at every anchor and page. A leak
  into a field the test has never heard of still fails it.

  It carries a **positive control**, because every other assertion is a
  not-contains and a probe that could never see the marker would pass them all
  while proving nothing: each shape runs before the takedown and the ones that
  testify are required to have found it first.

  It also covers the subtlest case, which carries no content at all — `topOneScore`
  feeds the abstention gate, so a withdrawn document scoring there would let a
  record claim coverage on the strength of text it refuses to show.

  **Cross-replica snapshot tokens**, listed in #33 as "documented, untested" and
  since found on a real deployment: two processes with no `KSOR_SNAPSHOT_KEYS`
  produce tokens neither can verify from the other, and the verdict is `invalid`
  rather than `unknown_key` — the key _id_ matches and only the secret differs,
  which is why the failure is invisible until you read it. Also pins rotation
  (outstanding tokens survive while the old key is listed, and die when it is
  dropped) and cross-deployment refusal.

- d96b139: Presentations, as governed attachments of a document.

  A document in `knowledge/` may now carry `<doc>.slides.yaml`. It renders at the
  top of that document's page — before the prose, because a deck is the shape of
  the thing and gives the detail somewhere to land.

  **Ask your coding agent and it writes the deck.** `make slides for
knowledge/expenses/approvals.md` runs the new `make-slides` skill, which reads
  the document whole, writes the slides, checks every claim and every number back
  against it, and tells you what it left out because the document did not support
  it — which is usually how you find out a document has a gap. No browser, no
  third-party tool, no step where a person takes over.

  **The record owns the deck by default.** `deck:` carries the slides themselves
  and the site renders them, which is the only mode where a presentation is
  governed: reviewed in the same pull request as its document, versioned with it,
  withdrawn when it is withdrawn, and incapable of rotting into a dead link. Every
  slide ships in the server-rendered HTML, so a reader without JavaScript, a
  crawler and an agent parsing the page all get the whole deck. Presenter notes
  render outside the slide, so they are not projected in fullscreen.

  **A deck you keep elsewhere** can be embedded instead — `slides.url:`, with the
  embed url derived for Google Slides, Canva and SlideShare. Its frame is
  click-to-load: nothing is requested from the host until a reader asks for it, so
  a page still makes zero external requests and a reader who only wanted the
  policy never announces that to a slide host. Declaring both modes is refused
  (`ksor-slides-two-sources`) — two presentations with nothing to say which one
  governs is the disagreement a system of record exists to settle. `http` urls are
  refused too, since a browser blocks a mixed-content frame silently.

  Like every attachment, a deck has no URL, no sidebar row, no `llms.txt` line and
  no id an agent can cite, and it takes its `visibility:` and any takedown from its
  parent.

## 0.0.30

### Patch Changes

- fbf149b: Quizzes, as governed attachments of a document.

  A document in `knowledge/` may now carry `<doc>.quiz.yaml` beside its summary
  and its flashcard deck. It renders at the end of the document's page, under the
  deck: choose an option, see immediately whether you were right, and read the
  explanation before moving on. There is no pass mark — a quiz here checks
  understanding of the record, it does not certify anybody — and answers stay in
  the reader's own browser.

  A quiz is **part of its document, not a document**: no URL, no sidebar row, no
  `llms.txt` line, no markdown twin, no search entry, and no stable id. That last
  one settles a question worth being explicit about: because `ksor ingest` creates
  no node for a quiz, **the answer key cannot reach the MCP surface at all**.
  There is nothing for an agent to search and nothing for it to read — not by a
  filter that could be forgotten, but because the row does not exist. Governance
  inherits from the parent exactly as the summary and the deck already do.

  **`pnpm check` and `pnpm build` refuse a quiz a reader could pass without
  reading it**, naming the questions to fix:

  - `ksor-quiz-answer-bias` — more than 60% of answers at one option position
  - `ksor-quiz-length-bias` — picking the longest or shortest option usually wins
  - `ksor-quiz-answer-run` — four or more questions in a row share an answer
  - `ksor-quiz-contradiction` — an explanation calls the marked answer wrong
  - `ksor-quiz-duplicate-stem` — two questions open with the same 60 characters

  These are carried from the predecessor, where the same mistakes shipped and were
  found by readers rather than by the project — one quiz put every correct answer
  in the same position across 451 questions. There they lived in a script that was
  run once; here they are part of loading the file, so a quiz that fails them
  cannot be published. The ratio rules do not apply below five questions, where
  enforcing a spread would mean choosing an author's answers for them.

  `ksor init` ships a quiz on the seed document, so a first `pnpm dev` shows the
  shape. Its own first draft was refused for putting four of five answers at
  option B — the check catching exactly what it was carried for.

## 0.0.29

### Patch Changes

- f7e15cd: **Breaking:** `KSOR_AUTH_DISABLED` and `KSOR_ALLOW_PUBLIC_UNAUTHENTICATED` are
  replaced by one variable, `KSOR_AUTH`, whose value is the decision:

  ```sh
  KSOR_AUTH=disabled-local    # no auth, loopback only — a public bind REFUSES
  KSOR_AUTH=disabled-public   # no auth, served to anyone who can reach the port
  ```

  Two booleans that had to agree to express one decision produced a state neither
  name could tell you, and a fourth combination that meant nothing. `AUTH_DISABLED`
  sounds like it already means "auth is off", so being told you also need
  `ALLOW_PUBLIC_UNAUTHENTICATED` read as the tool asking you to say the same thing
  twice. The guarantee is unchanged and unweakened — a copied `.env` carrying
  `disabled-local` still refuses on a container, which is the leak that pair
  existed to catch. Setting either retired variable now refuses at boot and names
  its replacement.

  **The boot report no longer stays silent about ephemeral snapshot keys.** Unset
  `KSOR_SNAPSHOT_KEYS` mints a per-process signing key — honest for one process,
  and wrong for the container hosts we ship a Dockerfile for. A generation pin
  issued by one instance is then unverifiable by the next, so `read` silently drops
  to the active generation and reports `refreshed (invalid)`. It fails soft, so
  nothing errors and nothing logs; the only symptom is an agent reading a
  generation it did not search. Found on a real deployment by noticing one read in
  three come back unpinned. On a public bind the door now says so:

  ```
  snapshot EPHEMERAL key — generation pins will NOT survive a restart or a
           second instance; set KSOR_SNAPSHOT_KEYS to a value shared by every replica
  ```

  Not a refusal — a loopback dev run and a genuine single-instance deployment are
  both legitimate — but no longer silent where the assumption stops holding.

  `docs/deploying.md` splits its configuration table into three tiers: required to
  boot, set on any container host, and set once auth is on. Listing six variables
  as one table read as "set all of these or you are doing it wrong", and only the
  first tier was ever true.

## 0.0.28

### Patch Changes

- 24ec8c3: Each document page now says how long it takes to read.

  The figure is counted when the site is built, from the document's own markdown,
  so it is in the shipped HTML — a reader whose bundle failed, a crawler and an
  agent parsing the page all get it. Fenced code and frontmatter are left out of
  the count, so a short page carrying a long example is not reported as a
  twenty-minute read.

  Nothing to author: it is derived from the words already there. Where a document
  has a summary, both tabs carry their own figure, so a reader can see what the
  summary saves them before opening it.

- 6abcf1f: Summaries and flashcard decks, as governed attachments of a document.

  A document in `knowledge/` may now carry two companions named after it —
  `<doc>.summary.md` and `<doc>.flashcards.yaml`. The summary joins the record's
  own words as a second tab; the deck renders at the end of the page, with spaced
  review kept in the reader's browser and Shuffle / Guide / Download beneath it.
  `ksor init` ships one of each so a fresh project shows the shape rather than
  describing it.

  An attachment is **part of its document, not a document**. It gets no URL, no
  sidebar row, no `llms.txt` line, no markdown twin, no search entry — and no
  stable id, so an agent can never cite it as a source in its own right. It takes
  its `visibility:` and its takedown from its parent: restrict or withdraw the
  document and its summary and deck go with it. An attachment declaring
  frontmatter, or one whose document is missing, is refused by `pnpm check` and by
  `pnpm build`.

  **If your record already has `.summary.md` files and you serve over MCP, read
  this.** They were previously ingested as ordinary documents, each with its own
  id and its own governance defaults. They no longer are. After upgrading, run
  `pnpm refresh`; if a takedown names one of those ids, `ksor serve` will refuse
  to boot until the denial is pointed at the parent document or retired
  deliberately. That refusal is the fix working — those rows governed a node that
  should never have existed.

  Review scheduling is a two-grade SM-2 variant (`ksor-sm2-v1`). It is not FSRS
  and claims no retention target.

## 0.0.27

### Patch Changes

- 6bc9d8f: The emitted `Dockerfile` names the files it copies instead of `COPY . ./`.

  **A `.dockerignore` is not honoured by every build host.** Vercel's container
  builder ignores it, so `COPY . ./` swept in `node_modules` and the built site —
  about a gigabyte — and the deploy failed with the registry rejecting the push as
  `PAYLOAD_TOO_LARGE`. The error arrives from the host and says nothing about the
  file that caused it.

  Naming what enters the image is the only form portable across build hosts. The
  `.dockerignore` stays as defence in depth for builders that do respect it, but it
  is no longer what bounds the image.

  The risk of naming files is forgetting one — which is exactly how the registration
  file came to be missing from the image two releases ago. That is covered: the
  container acceptance job boots the built image and asserts it serves the tools the
  registration names, so a forgotten file fails there rather than at a deploy.

## 0.0.26

### Patch Changes

- b90de22: Bound the container image: `.dockerignore` now denies everything and allows only
  what the door needs.

  The previous shape listed what to exclude, which cannot bound an image — it can
  only exclude what someone thought of. A build output, a cache, a vendored
  dependency or a backup directory in the project root all rode in, and the failure
  arrived as a container registry rejecting the push (`PAYLOAD_TOO_LARGE`) rather
  than as anything about the file that was added.

  Now: `*`, then `!package.json`, `!instance.md`, and `system/gateways/` — this
  door's own MCP registration. Everything else stays out, including the corpus (the
  door serves from Postgres), the website (a separately hosted surface), and every
  `.env` (a DSN baked into a layer is published to anyone who can pull the image).

  The container acceptance job now reports the built image's size and fails past a
  ceiling, so an allow-list that stops bounding it goes red here rather than at
  someone's deploy.

## 0.0.25

### Patch Changes

- ed2dce0: Fix the container serving the DEFAULT tool surface while the repository said
  otherwise.

  `.dockerignore` excluded all of `system/` — correct when that directory held only
  the website, and wrong the moment the door's own registration moved into
  `system/gateways/`. The file never reached the image, so a record that had
  renamed its tools, dropped one, or written what it covers was deployed serving
  none of it. Nothing went red: the door booted, `/health` was green, searches
  returned cited hits, and only `tools/list` betrayed it.

  It now excludes `system/site/`, and the Dockerfile copies the project rather than
  naming files one at a time — which is how the door came to ship without the very
  file that shapes its tool surface.

  The container acceptance job now writes a customized registration before building
  the image and asserts the served tool is the one that file names. Found by
  deploying and looking at `tools/list`, which is the only thing that would have.

## 0.0.24

### Patch Changes

- cbdc4c2: The MCP tool surface is now adopter-owned code. `ksor init` emits
  `system/gateways/content.ts` — ordinary `registerTool` calls with ordinary zod —
  where a record sets what its tools are called, what it says it covers, what they
  accept, and which of them exist at all.

  Agents are the operator, and an agent pays for this surface out of its context
  window twice. Measured against a live 81-document record: the three tool
  definitions cost ~2,990 tokens and stay resident for the whole session, and one
  `search` at the default `k=10` costs ~3,541 tokens per call. Until now a record
  could change none of it. Deleting the two tools your agents never call gives back
  ~1,643 tokens a session — verified live at 5,337 bytes of definitions against the
  default's 11,960.

  Real code rather than a config API, because models are trained on the MCP SDK and
  on zod and not on our field names — and because `registerTool` lets a record add
  its own tools, which no config schema could have anticipated. One import
  (`@panaversity/ksor/gateway`, which re-exports `z` and `McpServer`), so a
  registration stays a file: no package, no build step, nothing new in your
  lockfile. It is **deletable** — without it the door serves the identical surface.

  The handlers, output schemas and framework description text stay in the package,
  because a hand-written handler returning fabricated hits with plausible
  `stable_id`s passes every shape check there is. Your prose composes ABOVE the
  framework text, never instead of it — and since that is now a template literal in
  a file you own, **the door inspects its own served surface at boot** and refuses
  to start when a guarantee is gone: `ksor-gateway-floor-missing`,
  `ksor-gateway-no-tools`, `ksor-gateway-unloadable`.

  Adds a public subpath export, `@panaversity/ksor/gateway`.

  New: `docs/tool-surface.md`.

## 0.0.23

### Patch Changes

- 6d306a2: Ship the deployment artifacts: `ksor init` now emits a `Dockerfile` and
  `.dockerignore`, and its `vercel.json` declares both surfaces — the static site
  and the MCP door — behind one domain.

  The served MCP rung is a core surface, not an optional extra, so a scaffolded
  project should be able to reach a host without anyone hand-writing a container
  recipe first. The emitted `Dockerfile` names no vendor: it installs the pinned
  `@panaversity/ksor`, honours `$PORT`, and runs `ksor serve`, so the same image
  runs on Cloud Run, Fly, Render, ECS, Kubernetes or a VPS. `vercel.json` points
  AT that file rather than replacing it, which is what keeps the host a choice —
  moving is a redeploy, not a rewrite. A test asserts that neutrality directly,
  and CI now builds the emitted image, boots it against real Postgres and asks it
  a question over MCP, with no hosting vendor involved.

  Verified live before shipping, and the verification paid for itself: a
  project-level `trailingSlash: true` — harmless while the config was static-only
  — 308-redirected every door route including `POST /mcp`. It is removed (the
  site's own Next config already sets it where it belongs); shipping it would have
  broken the MCP endpoint of every adopter who deployed.

  Two new documents: `docs/deploying.md` (both surfaces onto a host, the
  configuration each needs, and what a cold start costs — measured) and
  `docs/ingesting.md` (why serving does not publish, so a first deploy with no
  ingest serves an empty record; where ingest belongs, which is never inside the
  container; and how the abstention gate gets turned on).

  Also drops the scaffold's build-script denials for `@google/genai` and
  `protobufjs`. The embedding provider speaks the vendor's REST API directly now,
  so neither package is installed at all and the entries described a dependency
  that no longer exists.

## 0.0.22

### Patch Changes

- ef538fa: Stage the record under a lock, so a build that evaluates its config more than
  once cannot publish a short site.

  A site build evaluates `source.config.ts` in more than one process — seven of
  them staged the record in one measured build — and staging was destructive on
  every evaluation: delete the whole per-audience stage, refill it. Two of those
  overlapping deleted a tree the other was copying into. Six
  concurrent evaluations of a 150-document record failed 42 of 48 runs — `ENOENT`
  and `EINVAL` out of `copyFileSync`, `ENOTEMPTY` out of `rmSync` despite its
  retries, and, in 27 of the 48, no error at all: staging returned success and
  handed the build a stage a third of the record short. That last shape is the one
  that matters — a crash fails a build, a short stage publishes one, with
  documents missing from `/docs`, `llms.txt` and the search index and nothing
  saying so.

  Staging now takes a lock file (`system/site/.staged-knowledge.lock`, gitignored,
  stamped with the holder's pid so a killed build's lock is broken rather than
  waited on), and an evaluation that finds the stage already holding exactly its
  plan — byte for byte — leaves it alone instead of rebuilding it. Together those
  mean the destructive path runs once per build, alone. No behaviour changes for a
  build that was already succeeding.

## 0.0.21

### Patch Changes

- 2c67e18: The files AI agents read now carry the same governance the page shows.

  A scaffolded site warned a reader that a policy had been replaced — an
  unmissable notice above the title, naming its successor — and then handed an
  agent the same policy as ordinary prose. In `llms.txt` a withdrawn document and
  the one that replaced it were adjacent entries, told apart only by whatever a
  human happened to type into a title; in `llms-full.txt` the withdrawn body
  appeared with no status, no successor and no owner at all. An agent reading the
  record answered from a policy nobody follows any more, and had nothing in the
  bytes it was given to know that.

  `llms.txt` now marks a document whose status is a caveat — `DRAFT`, `REVIEW`,
  `SUPERSEDED` — and names the route that replaced a superseded one.
  `llms-full.txt` puts the record's own keys back as frontmatter above each
  document: status, owner, effective, the resolved successor, and every
  provenance entry.

  Two details are deliberate. A successor is named by the route a consumer can
  fetch, never the `./successor.md` pointer it has no file tree to resolve. And
  `site: governance: false` does not reach these files — that key decides what the
  published pages show, while the record keeps every key for the agent surface and
  the audit trail, so suppressing them here would recreate the defect on purpose.

  Nothing else changes: no new dependency, no new frontmatter key, the same static
  export. An approved document's index line stays clean, and a document that
  declares no governance still emits none — a placeholder would read as governed.

- 472ee30: An interrupted ingest no longer throws away the embeddings it already paid for

  A killed `ksor ingest` leaves its generation in state `building`. Carry-forward
  accepted only `ready`, `active` and `retired` sources, so the rerun found nothing
  to copy and embedded the entire corpus again — paying twice for work that was
  sitting in the database, correct and complete.

  Found while ingesting an 81-document book into a managed Postgres. The run was
  killed at 4,736 of 6,963 chunks; the rerun reported `carried 0, pending 6963`.

  ```
  before   structure: 82 nodes, 81 sources, 6963 chunks; carried 0,    pending 6963
  after    structure: 82 nodes, 81 sources, 6963 chunks; carried 4736, pending 2227
  ```

  The asymmetry is what made it expensive. Interrupt a RE-ingest and a complete
  generation still exists, so the rerun carries from it and costs almost nothing.
  Interrupt the FIRST ingest and there is no complete generation at all — and the
  first ingest of a large corpus is the longest, the least familiar, and the one an
  operator is most likely to interrupt.

  Nothing about an abandoned run makes its vectors wrong. An embedding is a pure
  function of its input and model, the match key already establishes identity, and
  carry only ever fills chunks still marked pending. So a run's state now decides
  the ORDER sources are tried in, not whether they may be used at all: the active
  generation first, so vetted vectors always win, then complete generations newest
  first, then abandoned ones.

- 59c4f7a: **The search dialog forgets the last search when you close it.** The query
  lives in component state and the dialog stays mounted after closing, so the
  next time a reader opened search it came up on the previous term and its
  results — they had to clear the field before they could look for anything
  else. Closing now resets it, and the shell's own `onOpenChange` still fires,
  so nothing else about the dialog changes.
- 2c67e18: **The scaffolded site moves to Fumadocs 16.14.5 / fumadocs-mdx 15.3.0**, from
  16.10.3 / 15.0.13.

  What the adopter gets, all of it landing at or below 16.14.5:

  - **Search is multilingual with no configuration.** 16.14.0 replaced the Orama
    engine with ZBSearch behind the same module paths. The scaffold now imports
    `staticClient` rather than the deprecated `oramaStaticClient` alias it kept
    for compatibility — the subpath and the options are unchanged, so the new
    name costs nothing today and does not have to be found again when the alias
    goes. It matters here because a KSoR's knowledge is written in whatever
    language its owner writes in.
  - **Two accessibility fixes**: the sidebar trigger exposes its state to
    assistive technology (16.11.5), and documentation pages carry a `main`
    landmark (16.14.5).
  - **A table-of-contents overscroll fix** (16.14.3), which this shell feels
    because it holds the TOC column on every page.
  - **Page Actions honour a base path** (16.10.7) — relevant because the scaffold
    ships `KSOR_BASE_PATH` for sub-path hosting.

  **Not 16.15.0 / 15.3.1, deliberately.** Those are the `latest` tags, but they
  were published 2026-08-21 18:05Z and the scaffold's own supply-chain policy
  quarantines a dependency for 48 hours (`minimumReleaseAge: 2880`). Pinning them
  today would emit a scaffold whose first `pnpm install` its own policy refuses.
  Every improvement listed above is at or below 16.14.5, so nothing is given up
  by waiting; the bump is a one-line change once they age out.

  Also worth recording: `fumadocs-core` and `fumadocs-ui` both have a `17.0.0` on
  npm, published 2026-02-01 — BEFORE the 16.x line. The `latest` tag is 16.x. A
  higher version number is not a later release here, and nothing should chase it.

  **The sidebar's status marker is the shell's plugin now, not our own walk.**
  `statusBadgesPlugin` reads `status` from a document's frontmatter while the
  loader builds the page tree, so the scaffold stops carrying a map of statuses
  by url and a second recursive walk that rewrote each row. What stays ours is
  the rule the shell has no opinion about: only a CAVEAT is drawn, so `approved`
  renders nothing and the marker stays rare enough to be noticed. The tree nodes
  also gain a real `status` field rather than only a decorated name.

  **Every document can be handed to an agent in one click.** Beside the link to a
  document's markdown twin there is now a `Copy` action that fetches that same
  twin — the bytes `/md/<path>.md` already serves, so there is no second
  rendering of the document to drift — and puts them on the clipboard. Opening
  the markdown and handing it to an agent are different acts, and a reader who
  wants the second should not have to perform the first.

  Fumadocs ships an `ai/page-actions` component that does this alongside "Open in
  ChatGPT" and "Open in Claude". Those two are deliberately not taken: this
  product's claim is that one corpus answers in ANY assistant because the agent
  surface is an open standard, and hardcoding two vendors into every adopter's
  page argues the opposite. What is taken is the shell's own `useCopyButton`
  hook, which owns the copied-state timing — the only part worth not rewriting —
  so the action costs no new dependency and no registry component.

  It fails honestly: `navigator.clipboard` exists only in a secure context, so a
  site served over plain http on a LAN address has no clipboard at all, and the
  button says "Copy failed" rather than reporting a success it did not have.

  **The table of contents marks where you are, not everything in view.** Fumadocs
  defaults its TOC to `single: false`, which marks EVERY heading currently on
  screen as active — and a governed record is full of short documents whose
  headings all fit on one screen, so the whole rail rendered in the accent at
  once (measured: four of five entries active on a five-heading document). An
  accent that marks everything marks nothing. The default is specifically wrong
  for this shape of content, so the scaffold sets `single: true`.

  The two document actions rest in muted grey with an icon each, and take the
  accent only when something has happened — the copy that succeeded. They wore
  the accent at rest, which said "link" about controls that were merely sitting
  there and added to a page already too blue to read.

  **"On this page" marks the section you are in, exactly.** The shell decides the
  active heading with an intersection observer set to `{ threshold: 0.9 }` and no
  `rootMargin` — a heading counts as active whenever 90% of it is visible
  ANYWHERE in the viewport — and then highlights whichever became active most
  recently. On a long page that reads fine. On a governed record it does not:
  these documents are short-sectioned, so several headings share the screen and
  the one arriving from the BOTTOM always won. The marker sat two to four
  headings ahead of the reader (measured: reading "owner" while the rail marked
  "description").

  Those observer options are not configurable and the observer is not exported,
  so the selection could not be corrected — only replaced. The scaffold now
  supplies the rail through `DocsPage`'s `slots.toc.main`, keeping the shell's
  provider and its small-screen popover exactly as they are. The rule is a
  reading line rather than visibility: the active heading is the last one whose
  top has passed it, which is what a person means by "the section I am in".
  Measured at eight scroll positions across a 7.8-screen document: exact at every
  one. The bar is the row's own border, so it cannot drift from what it marks.

- 1145ebb: When calibration does not separate, `ksor calibrate` names the probes that held it open

  A "NOT separable" verdict reads as _this corpus cannot be calibrated_, and the
  report had every number needed to show otherwise while printing none of them.
  Its only remedy was "widen the probe set" — when the fix is sometimes to narrow
  it.

  ```
  these out-of-corpus probes scored at or above your weakest in-corpus question:
    0.721  which vector database should I choose
    ^ look at these first. Either the record COVERS one — move it to the
      in-corpus side, because a probe the record answers is not out of corpus
      — or it genuinely does not separate, and the floor stays uncalibrated.
  ```

  That is a real measurement, on a real 81-document book. One probe — a question
  about vector databases, asked of a record containing a Postgres-and-AI chapter —
  held the whole calibration open at 0.721 against a weakest in-corpus question of
  0.680. It was not an out-of-corpus question at all; it was mislabelled. Moving it
  separated the record immediately (`max OOC 0.676 < min in-corpus 0.680`), and the
  resulting floor answered every in-corpus question and refused every genuine
  out-of-corpus one.

  Without that line, the conclusion drawn from the same numbers was that the record
  could not support abstention — the product's headline guarantee — at all.

  The advice deliberately names **both** readings, because either can be right: the
  probe may be mislabelled, or the corpus may genuinely fail to separate, in which
  case the floor stays uncalibrated and that is the correct outcome.

- 2c67e18: The scaffolded site now renders the governance each document declares.

  `knowledge/` documents carry `status`, `owner`, `provenance`, `effective` and
  `superseded_by`, and `pnpm check` enforces them — but the site rendered only
  title, description and body. The sharpest consequence was not cosmetic: a
  `status: superseded` document was served looking identical to an approved one,
  with the successor pointer the checker requires swallowed.

  Each document now shows its owner and effective date under the title, one entry
  per `provenance` source at the foot, and — above the title, where it cannot be
  missed — a supersession notice that names the successor and links to its page.

  The status appears only when it is a caveat: `draft`, `review` and `superseded`
  are shown, `approved` is not. A reader already assumes a document in a system of
  record is current, and a label that appears on every page saying the same thing
  trains people to skip it — including on the page where it mattered.

  Nothing is inferred. A key a document does not declare renders nothing at all:
  a placeholder would read as governed, which is worse than a visible gap. It is
  all server-rendered, so the governance survives printing, JavaScript off and a
  failed bundle.

  Whether the pages show it at all is the owner's call: `site: governance: false`
  in `instance.md` keeps them plain while the record still carries every key for
  the agent surface and the audit trail. It defaults to on, and it never hides
  the supersession notice — a reader handed a replaced document with no word of
  its successor has been misled regardless of the site's preferences.

  The record's checker was hardened alongside, because these keys now reach a
  published page: `superseded_by` is validated whatever shape it is written in
  (a pointer matching neither `./x` nor `*.md` previously skipped every rule,
  including the cross-audience one, and the page then published it verbatim); it
  must name a real markdown document, not a directory, and must pair with
  `status: superseded`; an `effective` carrying a time is refused, because a YAML
  timestamp reads back in a timezone and could render the day before the one
  written; and a grouped `instance.md` key written inline (`site: { … }`) is
  refused instead of being silently dropped, which also restores the closed-key-set
  guarantee for every nested group.

  A second adversarial pass hardened the rules again: the `effective` check now
  matches YAML's real timestamp grammar rather than a padded-date shape (so
  `2026-4-1 00:00:00 +05:00` is caught and `2026-04-01 for new customers` is left
  alone); a YAML comment on an `instance.md` group key and a capitalised `False`
  are accepted, both having been refused by a checker stricter than the parsers it
  protects; a supersession that points back at itself or forms a cycle is refused,
  because the notice was sending readers in a circle; and a long source URL now
  wraps instead of being clipped away on a phone.

- 2c67e18: The scaffolded site got a UI pass, driven by measuring the real page in a
  browser rather than reading the code.

  **Every document is now published as markdown too.** `/md/<path>.md` carries the
  document's body and its governance as frontmatter, and each page advertises its
  twin with a `rel="alternate"` link and a visible "This document as markdown"
  line. An agent handed a document URL no longer has to scrape a React app to
  reach text the record holds verbatim.

  **Governance shows up where a reader chooses, not only after the click.** The
  sidebar, the previous/next pager, search results, the home page and every folder
  index now carry a caveat status, so a withdrawn document and the one that replaced it stop
  looking identical at the moment you pick between them.

  **A folder page lists what the folder holds**, and the home page lists the
  record — it used to announce a document count and link to one of them.

  **The home page opens with the record's own words**: the first paragraph of
  `instance.md`, which is also what `ksor serve` gives the MCP server. The
  framework's marketing line is gone from the adopter's front page, which the
  project's own critical rule 1 never allowed. Scaffolded `instance.md` was
  reordered so the authority sentence comes first, where it belongs for the system
  prompt too.

  **Supersession runs both ways.** The withdrawn document names its successor; the
  successor now names what it replaced, derived from the record with no new
  frontmatter key.

  **The supersession notice reads as a caution and is reachable by landmark** —
  its own colour instead of the brand accent that also means "go here", and
  `role="region"` with `aria-labelledby` instead of `role="note"`.

  **A provenance entry that is a URL is now a link** — the whole entry only, and
  `http(s)` only, so an authored `javascript:` source can never become a
  clickable href.

  **The sidebar footer no longer renders an empty input-shaped box.** The theme
  switch shipped inside a bordered bar that stretched to the sidebar width around
  one 61px control; it now sits on the footer row beside the mark.

  **The left rail is flush with the window again.** The docs grid gives the
  sidebar panel the centring offset as well as its own column, so above 97rem the
  panel's surface ran to the window edge with the first nav item starting 103px
  inside it (measured at 1728px). The layout width is now `100%`: the offsets go
  to zero, the rail starts where the window does, and the prose does not move.

  **The site is a shadcn/ui project.** `components.json` and `lib/utils.ts` ship
  with the scaffold, so `pnpm dlx shadcn@latest add <name>` writes a component the
  adopter then owns, and Fumadocs reads the same palette through its `shadcn` CSS
  preset — one set of tokens for the shell and for anything added from the
  registry, with `--primary` carrying the brand. It also ends a real defect: the
  `neutral` preset painted the page and the sidebar it sits against 1.6% apart, so
  the reading surface never read as a page. The shadcn CLI itself is deliberately
  NOT a dependency (578 extra packages, measured); the four the site actually uses
  cost +2.

  **The previous/next neighbours sit at the foot of the page, not wherever the
  text stopped.** A governed record is full of short documents, and on those the
  pager landed mid-screen — 265px above the bottom edge on the policies index,
  measured — reading as more content rather than as the end of the page. It now
  takes the free space as margin above it, and stays exactly where it was on any
  document taller than the viewport.

  **The reading column stopped moving, and stopped being a slab.** The shell caps
  the article at 900px — 78 characters a line at the body's 16px — and centres it
  in whatever the table-of-contents column leaves, so the prose ALSO jumped 134px
  sideways between a document with headings and one without (measured: text at
  x=446 against x=580). The measure is now 46rem, about 66 characters, and the
  TOC column is held on every page, so sidebar and rail are the same width and the
  column lands in the same place on every document: x=464, 672px wide, on a
  document with a table of contents and on one without, verified in both.

  **The home page is the record's own front door.** It is a landing page that
  stands alone — no sidebar, no document chrome, `Open the record` as the way in,
  landing on the first document in governed order rather than a hardcoded path.
  Every word on it comes from `instance.md` or a document's frontmatter, because
  the site contains no authored content, and everything it says is in the
  server-rendered markup, so a crawler, a reader without JavaScript and an agent
  parsing the HTML all read the same page.

  **The site has a design, not a default theme.** Three voices, each marking who
  is speaking: the record's own words in a serif (its title, its documents'
  titles), the site's furniture in a sans, and everything machine-facing — the
  slug, addresses, owners, statuses, section labels — in mono. System stacks only,
  because a web font is fetched at build time and the scaffold's build must work
  offline and byte-identically. The palette moves from neutral grey to a cool ink
  (`oklch(0.17 0.012 255)`) that sits with the accent instead of beside it, with
  firmer hairlines, and the accent is spent only on actions, links and the active
  state.

  **The front door is the record's cover, and it is one screen.** The identity
  takes the whole window under the navbar over a faintly ruled ground: the
  record's name, the authority sentence it declares in `instance.md`, one way in,
  and the record itself standing beside it. The cover follows the theme
  rather than staying dark in both — pale stock in the light, and in the dark it
  rises one step above the page instead of turning white, because a cover is the
  surface that catches the light. Every machine address came off the page:
  `/llms.txt` sits where agents look for it and each document advertises its own
  markdown twin, so nothing became less discoverable by leaving the front door,
  and the page stopped printing URLs at a reader who will never fetch one.

  **The front door shows the record, not a drawing of one.** The right of the
  cover is the document `Open the record` opens — its own title, its own words,
  its owner and any caveat status — with the record's next entries standing
  behind it, and the count of everything the record holds beneath. Four abstract
  illustrations were drawn for that space first and all four were rejected; the
  reason is the useful part, and it is now written into the component: a stock
  drawing is the ONE thing on this page that can never be true of the adopter's
  corpus, so every KSoR would have shipped the same picture of nothing in
  particular. A record of one document and a record of two hundred now get
  visibly different front doors. Nothing on the page is authored — every string
  is a title, description, owner or status the record itself declares — and the
  depth is CSS, so it costs no image, needs no request, and follows the theme.

  **The cover's composition is centred and its type ramp closed.** The signature
  line at the foot took the section's free space as top margin, which cancelled
  the centring and left 197px of dead space below the content and none above it
  (measured at a 996px-tall window); the composition now sits in the middle of the
  space above the signature, 157px clear at the top and 158px at the bottom. The
  ramp ran 12px eyebrow to a 76px title to an 18px lead — a jump with nothing in
  the middle — and is now 12 / 64 / 20. The accent rule under the title was still
  pinned to the dark theme's blue from when the cover was dark in both themes,
  which left it all but invisible on the pale light cover; it takes the token
  again, so it inverts with everything else.

  **A document's section headings speak in the record's voice, and its
  governance strip has a hierarchy.** Only the title was styled; h2, h3 and h4
  fell through to the shell's prose defaults, which measured 24 / 20 / 16px in
  the SANS body face — so inside one document the title was the record speaking
  and every section heading was the site speaking, and h4 was the body size
  with only its weight to tell it apart. The ramp is now 38 / 28 / 22 / 18 in
  the display serif, scoped to the container the record's own markdown renders
  in so the site's own headings keep their voice.

  In the strip under the title, the label and its value were both mono a single
  pixel apart, so "Owner Product Effective 2026-08-22" read as one
  undifferentiated run. The label is now 10px and letterspaced against a 13px
  value that carries the weight. The "Markdown" link stopped wearing the
  bordered badge that means "a status the record declares": it is the one
  ACTION on a row of FACTS, so it takes the accent, which on this site means a
  link. The gap between facts matches the register's.

  **A withdrawn document no longer looks like a draft.** `draft` and `superseded`
  rendered as pixel-identical chips — same hairline border, same muted text —
  which put the two statuses that mean the most different things in the same
  clothes at exactly the moment a reader picks between a document and its
  successor. `--ksor-caution` already existed to mean "the record withdrew this",
  but it was declared inside the one class that first used it; it is now a token
  pair on the root, and a `superseded` chip wears it in all five places one
  renders: the sidebar, the section listing, the front door's stack, the
  document's own governance strip, and search results. The colour is additive and
  never the whole signal — the word "superseded" is beside it everywhere.

  **The ramp covers every level a document can write, and the top of a document
  stopped moving.** Three defects an audit of the shipped stylesheet turned up
  after the first pass: a body `# heading` was reached by neither rule — the page
  title's selector is a child combinator — so it rendered at 30px in the SANS
  face at weight 800, the loudest thing on the page, in the site's voice, for the
  record's own words; `h5` and `h6` were 16px/400 with no margins at all, which
  is a paragraph, because the prose plugin never defines them and preflight
  resets them; and the ramp's own margins beat the shell's "first block has no
  top margin" rule, which is written with `:where()` and therefore has no
  specificity, so a document whose body opened with a heading started 44px lower
  than one that opened with a sentence. All three fixed and measured.

  **A document reads like documentation, not a wall of black.** Under the
  headings almost everything was one weight of one ink: a link inside a paragraph
  rendered at the same colour and weight as the `<strong>` beside it, told apart
  only by an underline, so nothing on the page looked clickable. Links in running
  text now take the accent — in running text only, because a heading carries an
  anchor around its own words and colouring those turns every heading blue.
  Emphasis is heavier than the 500 the prose default gave it. A table's head
  speaks in the mono voice every other label on the site uses and its rows are
  separated by hairlines, where `tbody tr` previously had a 0px border and the
  cells simply floated. A quotation steps back in muted ink instead of shouting
  in italic. And a fenced code block finally looks like a block: Fumadocs paints
  its surface with `bg-fd-card`, which in this palette is under 2% away from the
  page colour, so it takes `--muted` — the token that actually means "a surface
  on the page", and a light/dark pair.

  **Inline code carries its own colour.** A frontmatter key or a path in running
  text was set in the same ink as the prose, leaving a grey chip to do the whole
  job of saying "this is machine vocabulary". It now has a token of its own — a
  deep teal, as a light/dark pair — chosen because the two colours already on
  this site are spoken for: the accent means link or action, so tinting code with
  it would make every key look clickable, and `--ksor-caution` means the record
  withdrew something.

  **A record's entries look clickable before you touch them.** The list a folder
  page shows was a hairline register whose rows were links and said so only on
  hover — so on a touch screen, where there is no hover, nothing ever indicated
  they could be opened. Each entry is a card now: a bordered surface, an icon
  that distinguishes a folder from a document, the title in the record's serif,
  its metadata in mono, and an arrow that says where pressing leads. The voice is
  unchanged, and so is the rule that `approved` shows no label.

- 2c67e18: **`ksor init` seeds a real starter record instead of one bare stub.**

  A fresh project used to arrive with a single document titled "Your first
  governed document" — enough to prove the directory was not empty, and nothing
  more. The first `pnpm dev` therefore showed a site with one page on it, which is
  the worst possible demonstration of a system whose whole subject is a governed
  body of knowledge: no folder, no owner, no provenance, no supersession, no
  second status, and a front door with one card on it.

  Five documents now ship in `knowledge/`, in a two-level shape:

  ```text
  knowledge/
  ├── what-is-a-ksor.md
  ├── governance-ladder.md
  └── surfaces/
      ├── index.md
      ├── for-people.md
      └── for-agents.md
  ```

  They are about KSoR itself, and they carry the governance keys they describe —
  owners, `provenance` naming real sources, effective dates, `order`, and one
  `draft` beside four `approved`. So the governance surfaces are visible working
  on the first run: a caveat status in the sidebar and on the front door, a
  folder that counts what it holds, provenance rendered at the foot of a page,
  and `llms.txt` carrying the same facts to an agent.

  `instance.md` leads with the matching authority sentence and its display title
  is `KSoR`, so the site has a coherent identity out of the box rather than a
  placeholder. Both the record and the identity are seed content the adopter
  replaces: `instance.md` says so in its own body, and the intake interview
  rewrites the identity as its first job.

  The record is still the adopter's outright (decision 4) — these are documents
  to delete as real knowledge arrives, not framework files to work around.

  The seeded documents are sectioned rather than flat — `##` down to `####`,
  never an `# h1`, because the frontmatter title is already the page heading.
  A record of headingless documents would leave both the document heading ramp
  and the "On this page" table of contents unexercised on exactly the pages an
  adopter reads first.

## 0.0.20

### Patch Changes

- f25e963: A token from another authorization server is refused, not reported as an outage

  An unknown key id raises the same error whether the cause is key-rotation lag or
  a token minted by an entirely different authorization server. Both were treated
  as transient, so a client presenting a credential that can never work got `503
service unavailable` — and retried it, forever, while the misconfiguration read
  as an outage in every dashboard.

  Reproduced across two real servers: a door configured for Ory Hydra, presented
  with a genuine Keycloak token, answered 503. It now answers 401, before it
  fetches a key at all.

  The check runs only when `KSOR_SSO_ISSUER` is set, because only then has the
  operator stated what the issuer should be. It reads the issuer from an unverified
  payload, which is sound for exactly one purpose — refusing. A token that passes
  it still has its signature verified in full, so a lie there buys nothing.

  Genuine rotation lag is still transient, still uncached, and a valid bearer is
  still re-admitted the instant the key set catches up.

  **New: `docs/authorization.md`**, shipped in the package — two worked recipes for
  putting a record behind an authorization server, both executed against real
  servers rather than written from their documentation, plus what an agent does to
  obtain a token and what each refusal means.

## 0.0.19

### Patch Changes

- aa4bdce: Record why the vector index is unused, and what fixing it would cost

  Diagnosis only — no serving behaviour changes. Answers are unaffected, and were
  already correct: the query plans a sequential scan, and a sequential scan is
  EXACT. What grows with the corpus is the work, not the error.

  The cause recorded until now — a window function, then joins and predicates
  Postgres cannot estimate — was incomplete. Testing each clause on its own shows
  a cost mispricing underneath: a full sequential pass over 20,000 chunks,
  including 20,000 1536-dimension distance computations, is priced at 1904 for
  work that takes ~130 ms, while the HNSW scan's startup cost alone is 2137.

  A restructured arm reaches 36 ms against 648 ms — but only with `ef_search` at
  pgvector's default, which is the setting where the index missed the true nearest
  neighbour for 1 query in 100 on a bed with real cluster structure, dropping the
  top-1 similarity by 0.99. Against this record's ~0.01 abstention separation,
  that flips an abstention: the corpus holds the answer and the door says it does
  not. The speed and the approximation cannot be separated, so taking them is an
  owner decision rather than a tuning change.

  Both the current plan and the fix path are now pinned by tests, so neither can
  drift unnoticed.

- b9f3d00: A citation pin no longer outlives a restriction

  A snapshot token pins a generation so a citation keeps resolving to the same
  bytes. It was also deciding the _audience_ question — evaluating `visibility` on
  the pinned row — so a document restricted after the token was issued kept reading
  in full for the token's life, to a caller the record had just closed it to.

  Three routes refused it and one served it, on the same surface, in the same
  second: `outline` omitted it, `search` filtered it, an unpinned `read` refused it,
  and `read` with a pre-flip token returned the whole document.

  The generation pointers are why the obvious guard missed it. A flip sets
  `rollback_generation` to the generation just superseded, so a pre-flip pin is
  exactly the rollback pointer — servable by design, and the check that narrows a
  pin to {active, rollback} passed it.

  **Governance is now read from the record as it stands.** A pin still decides
  which generation's content is served; it no longer decides whether the caller may
  have it. A document the record no longer contains cannot be resurrected by one
  either. Unpinned reads are unaffected — with nothing pinned, the two generations
  are the same one and the check is an identity.

  The cost is deliberate: a citation can stop resolving within the token's 30
  minutes when the record restricts what it points at. That is what "the record
  changed" should look like. The alternative is a window in which a withdrawal is
  not a withdrawal.

## 0.0.18

### Patch Changes

- ea049fd: A takedown can no longer stop applying without saying so

  Two ways a recorded withdrawal quietly stopped covering what it was recorded to
  cover. Both were found by attacking the door before exposing it publicly, and
  both were reproduced end to end against a real database.

  **A denial matched nothing after the document moved.** `takedown_denylist`
  records a `stable_id`, and the serving predicate matches those rows against the
  documents in the generation being served — so an id that no longer exists denies
  nothing. The default stable_id is derived from the file's path, which means an
  ordinary rename or move of a withdrawn document was enough: search, read,
  outline and the site all served it again, with no error anywhere. Adding an
  `index.md` beside a withdrawn section did the same, by changing the section's id.

  Serving now refuses in that state, and so does the ingest that would create it —
  the same check at both ends, so a generation where a withdrawal has stopped
  applying cannot be published _or_ served:

  ```
  2 takedown(s) match no document in generation 7: knowledge/legal/notice.md, …
    why: … an id that no longer exists denies NOTHING — so a withdrawn document
    that was renamed, moved, or had an index.md added beside it is served again
    fix: point the denial at where the document lives now, or retire it
    deliberately — never guess which one, because the tool cannot tell a rename
    from a deletion
  ```

  Refusing rather than re-pointing automatically is the whole point: a tool that
  guessed would eventually guess that a withdrawn document had been deleted when
  it had been renamed.

  **A withdrawn section did not cover its own directory.** When a section has no
  `index.md` and its documents all live one level further down, it had no file to
  name its own directory, so only the subdirectory was exported to the site. A
  document written directly under the withdrawn section published to `/docs` and
  `llms.txt` in the window before the next ingest. The section's directory is now
  derived from its own identity, which for an index-less section is its path.

## 0.0.17

### Patch Changes

- 44feada: Installing ksor no longer pulls 32 MB of vendor SDK

  `npx @panaversity/ksor init` installed 54 MB across 52 packages. 32 MB of that
  was `@google/genai` and its dependencies — carried by every adopter, including
  the ones who only ever run `init` and `dev` and never reach a served rung.

  It existed to make two HTTP calls, both already wrapped behind one
  structurally-typed client boundary. Those calls are now spoken directly:

  ```
  before   54 MB   52 packages
  after    22 MB   22 packages
  ```

  Nothing about the embedding changed, and that was checked first rather than
  assumed: the SDK and the REST endpoint return **byte-identical vectors** for the
  same text, model, dimensionality and task type — a maximum per-component
  difference of 0.000e+0 at 1536 dimensions. So stored embeddings stay valid and a
  calibrated `vector_floor` keeps its meaning. Had they differed by a rounding
  step, this would have quietly invalidated abstention on every existing record.

  The provider seam is unchanged: a deployment that prefers an SDK can still
  supply one through `clientFactory`. The single live call to the real vendor
  stays where it was, as the tripwire for API drift, and now meets Gemini with
  nothing in between.

## 0.0.16

### Patch Changes

- 144aba8: Ingest says when a document's ordering key is one this record does not read

  A record's reading order comes from the governed `order:` key alone. A corpus
  arriving from Docusaurus, Hugo or Jekyll carries its own — `sidebar_position`,
  `weight`, `nav_order` — and ksor ignored them in silence, falling back to file
  name. That is a WRONG order, not a missing one, and it is the order served to
  `llms.txt`, the rendered sidebar and the MCP `outline` alike.

  Found on a real 81-document book where 73 files declared `sidebar_position`. Its
  second chapter came out ninth; its preface came out eleventh. Nothing said why.

  ```
  plain-tree: 73 document(s) declare `sidebar_position`, which this record does not
  read — reading order fell back to file name (about.md, how-to-sell.md,
  thesis.md, and 70 more). Rename it to `order:` to keep the intended sequence.
  ```

  It reports on the same channel the adapter already uses for skipped files, where
  the principle was already written down: a skip is reported, never silent. A
  document that declares BOTH keys says nothing — `order:` wins, so nothing fell
  back, and a warning there would only teach the reader to ignore the channel.

- 2e9c987: Ingest says what the navigation rule now is, not what it used to be

  0.0.15 changed how a section is judged to be navigation — shape rather than
  length — and left every sentence describing it behind. So a fresh `ksor ingest`
  reported:

  ```
  not searchable: 1 of 5 chunk(s) (20%) are shorter than the navigation threshold
  ```

  There is no navigation threshold any more, and the page in question was not
  short: it was an index of links, which is exactly what the rule now catches. The
  remedy was wrong in the same way — "lengthen these sections" is no longer how a
  page becomes searchable, and padding a link list would not have made it one.

  ```
  not searchable: 1 of 5 chunk(s) (20%) read as navigation rather than content
  FOUND ONLY BY NAME: knowledge/index — no searchable chunk at all; a page of
  links reads as navigation; give it prose of its own, or reach it by slug
  ```

  Found by running the published artifact rather than by reading the diff. The
  same stale description was corrected in the three other places it had been
  copied to.

- 1e26c07: A YAML list in frontmatter no longer costs the document its title

  The frontmatter reader emptied a document's ENTIRE metadata whenever a top-level
  value opened with `[ { | > & * !`. One `authors: ["…"]` line beside the title,
  and the title went with it — along with `order:` and `sor_id:`.

  Found on a real 81-document book, where four chapters were served under names
  derived from their filenames:

  | served as                    | declared                                                        |
  | ---------------------------- | --------------------------------------------------------------- |
  | `Preface Agent Native`       | `Preface: The Right Side of the Line`                           |
  | `System Of Context`          | `The System of Context: Connecting the Records to Real Work`    |
  | `Designing The Vertical Sor` | `Designing the Vertical System of Record from First Principles` |

  Titles reach the site, `llms.txt` and the MCP `outline`, so this was wrong on
  every surface at once, and silently.

  The reader is documented as PyYAML-compatible and empties the map only where
  PyYAML raises. PyYAML does not raise on a flow sequence — it parses it. Two
  different things were being conflated:

  - **invalid** — an unquoted `a: b: c`, a trailing `:`. PyYAML raises; the map is
    still emptied, unchanged.
  - **valid but not modelled here** — a flow sequence or mapping, a block scalar,
    an anchor. PyYAML parses these. Only the KEY is beyond the reader now; the
    document survives.

  **One identity change to know about.** A document that declares `sor_id:`
  _alongside_ such a value previously had that override silently dropped, so its
  stable_id fell back to the path. The override now stands, on both surfaces
  together — so re-ingesting changes the stable_id of exactly those documents, and
  any takedown row keyed on the old path-derived id must be re-pointed. The site
  and the kernel change in step, which is the property `stable-id-conformance`
  exists to hold.

  One governance guard gets quieter and no weaker: ingest used to REFUSE a
  document declaring `visibility:` beside a flow list, because the map was emptied
  and the tier silently defaulted. The cause is gone, so it ingests with the right
  visibility; the refusal still stands for frontmatter PyYAML genuinely rejects.

- d4334c7: A quiz no longer swallows the explanation that precedes it

  The previous release moved navigation from a length test to a shape test, so a
  short fact stopped being mistaken for a link list. The rule that decides whether
  a whole section is _a widget_ — a quiz, a slide embed — was left on the old
  threshold: under 250 characters of teaching before the widget, and the entire
  section was labelled `assessment` or `embed`, neither of which any search
  returns.

  So a section carrying a complete 180-character explanation followed by a
  knowledge check lost the explanation too. Same defect as the last one, one path
  over.

  Both paths now ask the same question: is what comes BEFORE the widget actually
  navigation-shaped? A heading with only a quiz under it is still a quiz. A link
  list before a quiz is still a quiz. An explanation before a quiz is an
  explanation, and stays searchable.

  Found by ingesting a real 81-document curriculum corpus, where 610 chunks landed
  as `assessment` and 186 as `embed` — together 79% of everything unsearchable in
  that record.

  `CHUNK_POLICY` moves to v7 (persisted provenance; the labels it names changed),
  and `NAV_MAX_CHARS` is deleted — nothing reads it now. **Re-run `ksor ingest` to
  pick this up**; unchanged content is not re-embedded.

## 0.0.15

### Patch Changes

- 5b076e6: Short documents reach search again — navigation is a shape, not a length

  A record could be fully ingested, report "embedded 16, failed 0", and still be
  unable to answer questions it plainly contained. Sections were classified as
  navigation by LENGTH — anything under 250 characters — and navigation is
  excluded from every retrieval arm. On a handbook that inverts the intent,
  because a handbook's most valuable statements are its shortest.

  Walked on 0.0.14 with three ordinary policy statements — a refund window, an
  escalation path, a badge rule, 200-300 characters each. Three of four chunks
  were unsearchable, and:

  > **Q.** "how long does a buyer have to send something back"
  > **A.** the scaffold's placeholder page — against a record stating _thirty days_

  The answer was in the corpus, correctly ingested, readable by slug, and
  unreachable by search.

  Navigation is now decided by shape: a section is navigation when link lines are
  most of it, or when what remains after them is too short to answer anything —
  the same floor the serving predicate already applies. Length is no longer
  consulted, so a 180-character link list is navigation and a 51-character fact is
  not, which is the ordering length had backwards.

  Measured on an authored handbook gold set with real embeddings, paired: short
  substantive facts went **0/9 to 9/9 at rank 1**, the long-prose control held at
  **4/4**, and the link-list page was returned **0** times. That last number is the
  one that matters — admitting everything would have improved the first two and
  made the product worse.

  **To pick this up, re-run `ksor ingest`.** Chunks are re-classified on every
  build and unchanged content is not re-embedded, so the upgrade costs a build,
  not an embedding bill. `CHUNK_POLICY` moves to v6 because it is persisted
  provenance and the behaviour it labels has changed.

- 5763e8b: Internal: a pool test that raced Postgres, and a comment that had it backwards

  No adopter-visible behaviour changes.

  `idle.db.test.ts` sampled `pg_stat_activity` immediately after a previous test's
  `pool.end()`. Those are two different clocks — `end()` resolves when the client
  socket closes, while the row disappears only once the server-side backend
  actually exits — so the suite was order-coupled through the database and went
  red in CI on a branch that changed nothing but a document. Each test now waits
  for a quiet database before it starts, and states that it does.

  The comment added in the previous release explaining the `env.example` guard fix
  described the rename backwards: the TEMPLATE holds `env.example` and
  `materialize.ts` maps it to `.env.example` on emit, not the other way round.

## 0.0.14

### Patch Changes

- a0d98b0: Cut dead weight, and repair two guards that had quietly stopped guarding

  A sweep across every package, with each candidate handed to a second reviewer
  whose job was to prove it still alive. Net −154 lines. Nothing an adopter can
  observe changes; two things that were supposed to fail no longer stay silent.

  **The two repairs.** A guard asserting that no scaffolded document describes
  serving as publishing — a claim this repo has had to correct four times — ran
  `readFileSync` inside a `try` whose `catch` returned quietly, and one of its five
  filenames was `.env.example` while the scaffold emits `env.example`. So the row
  covering the file that actually carries the serving variables had never executed.
  The name is fixed and a missing file now fails instead of passing. Separately,
  two doc-blocks described a stdio transport in the present tense; there is no
  stdio door in the product, and the suite claiming to drive one drives HTTP.

  **The removals.** A 134-line live-walk script pinned to `@panaversity/ksor@0.0.4`
  that nothing referenced. `AuthConfig.jwksUrl`, computed and stored but never read
  — its live twin is `explicitJwksUrl`; the boot-time validation of
  `KSOR_JWKS_URL` stays exactly where it was. An `allowedAudiences.length > 0 &&`
  operand that no path can reach as false, and whose false side would have skipped
  the audience allowlist entirely. A `PoolTimeoutError` message parameter no caller
  passed, which was also the one input where two retry classifiers disagreed —
  removing it closes that. Two `instanceof X || instanceof Error` disjuncts where
  `X extends Error`, so the first could never decide anything. One unused icon
  export in the workbench shell.

  **Left alone deliberately.** `SearchScope.kinds` is genuinely dead, but removing
  it renumbers positional parameters across three SQL statements, two of which
  derive a shared CTE by string substitution, and the test that would catch a wrong
  renumber is gated on a database. That is a change to make on its own, with the
  gate watching — not alongside a release.

- ce1595b: Ingest names the real reason it could not record a commit

  Every first ingest of a freshly scaffolded project printed "knowledge/ is not in
  a git repository". That is false: `ksor init` runs `git init`, so the repository
  exists — it simply has no commit yet, and `rev-parse HEAD` fails with "unknown
  revision" rather than because nothing is there. The reader was sent to `git
init`, which they had already run, in the one message that decides whether an
  answer can be traced back to a reviewed commit.

  Three different states were collapsing into that one sentence, and each has a
  different next command:

  ```
  knowledge/ is in a git repository with no commits yet …
    fix: commit the record (git add knowledge && git commit) and re-run

  knowledge/ is not in a git repository …
    fix: git init, commit the record, and re-run

  git is not installed …
    fix: install git, or pass --source-commit <sha> if the record is versioned elsewhere
  ```

  Verified on a real scaffold: the fresh case prints the first, and committing the
  record turns the next ingest's `source:` line into an actual SHA.

- 474dedc: Internal: the env-contract drift test scans only the checkout's source

  No adopter-visible behaviour changes. The test that guarantees every
  adopter-settable environment variable is named in the scaffold's `env.example`
  walked `packages/` with a `statSync` per entry, and descended into the fake npm
  install another suite roots inside `packages/ksor`. That cost two ways: the
  copied template sources were scanned twice, and an entry deleted between the
  `readdir` and the `statSync` crashed the whole run — which is what took CI red
  on run 32526491721, on an `llms.txt` being cleaned up concurrently.

  The walk now takes each entry's type from the readdir snapshot itself, so a
  vanishing entry cannot crash it, and it skips transient install trees, so its
  input no longer depends on whether another suite is mid-run. The `REPO_ONLY`
  exemption list was deleted as dead: it named seven variables that no scanned
  file can contain, because the walk excludes test files in the first place. The
  honesty check that is supposed to catch stale exemptions now covers every
  exemption list, which is what its name always claimed.

## 0.0.13

### Patch Changes

- 8c5013b: A provider outage is never reported as "the record does not cover this"

  When the embedding provider is down, the vector arm does not run — so an empty
  result says nothing about coverage. It says we could not look. That distinction
  was fixed once for records with a calibrated floor, and the condition was the
  bug: it left the case out that matters most.

  An **uncalibrated** record is the default state of every fresh scaffold. There
  the emptiness came from the keyword arm, which abstains when it returns no rows
  — and it returns nothing for almost every natural-language question, because
  `websearch_to_tsquery` ANDs its terms (measured 12 of 12 on real questions). So
  during any outage an uncalibrated record answered every question with
  `abstained: true`, while the tool description instructs the agent to state that
  as fact and never fall back on its own knowledge.

  It reached this release because the existing test asked a question the keyword
  arm could answer, so the degraded path served real hits and looked correct. Ask
  the way a person asks and it did not. That case is now covered.

  Found live against the published 0.0.12 with an invalid key — the same state a
  rejected CI key had produced that morning, which is how likely this is.

  **`ksor calibrate` also stops blessing a floor on far-domain evidence alone.**
  The built-in out-of-corpus probes are all far-domain — dinner, taxes, boiling an
  egg — and a shipped set cannot be scope-adjacent, because adjacency depends on a
  corpus it has never seen. Far-domain probes score low against anything, so the
  margin comes out inflated. Measured on one record, changing only the probe set:
  built-ins reported "separable, margin 0.072" and recommended a floor; eight
  scope-adjacent near-misses reported "NOT separable, margin -0.030" — and that
  floor then answered six of the eight live, with citations. The tool already knew
  to say "widen the probe set", but said it only on the not-separable branch, which
  is when it is least needed. It now says it whenever the built-ins are used.

- 692d296: `ksor ingest` says how much of the record no search will return

  A chunk shorter than the navigation threshold is stored, embedded and readable —
  and excluded from every retrieval arm by the serving predicate. That rule exists
  for a good reason: a "See also: [a] [b] [c]" block should never be a search hit.
  But it decides by LENGTH ALONE, so a short _substantive_ paragraph is caught by
  it too — and a policy handbook is made of short substantive statements.

  Measured on a realistic five-document operations handbook with real embeddings:
  **10 of 16 chunks unsearchable, and one entire document that `outline` lists and
  `read` returns in full but `search` can never find.** A complete policy
  statement — "Probation: six months, with a written review at three and six" —
  is 191 characters, so the record treats it as navigation. The ingest line
  reported a cheerful `16 chunks; embedded 16` and said nothing.

  It says it now:

  ```
  ingest: generation 1 — 2 nodes, 4 chunks; embedded 4, carried 0, failed 0
    not searchable: 3 of 4 chunk(s) (75%) are shorter than the navigation
      threshold — stored and readable, but no search returns them
    FOUND ONLY BY NAME: knowledge/onboarding:prose — no searchable chunk at all
  ```

  This does **not** change the threshold, and nothing that was searchable stops
  being so. Where that line belongs needs a gold-set measurement, which is issue
  #55. What is fixed here is the silence — because the silence is what let a
  record ship most of itself unfindable, and told its owner everything was fine.

  The count is computed with the serving predicate's own admission test, and a db
  test compares it against what the SQL actually admits: a report the database
  disagrees with would be worse than none.

- c4976dd: Two defects introduced in 0.0.12, found by verifying the published package live

  **The discovery document became invalid exactly when a record became real.** The
  MCP registry schema caps `ServerDetail.description` at **100 characters**
  (2025-12-11). 0.0.12 started generating that description from the record's own
  prose — a real improvement over the hard-coded sentence it replaced — and capped
  it at 300. The unfilled placeholder is 88 characters and validates; a described
  record's title plus scope sentence is routinely 150-350 and does not. So
  `/.well-known/mcp/server.json` passed validation until the owner did the thing
  the scaffold asks for, then silently stopped, with nothing in the build to say
  so. It is now assembled inside the schema's budget and trimmed at a word
  boundary rather than mid-word.

  **The boot report reassured the operator in the one configuration that needs a
  warning.** `KSOR_ALLOW_PUBLIC_UNAUTHENTICATED=1` permits an unauthenticated
  public bind, and the auth line kept printing `DISABLED — 0.0.0.0 only, and a
public bind will refuse to boot` — false on both counts, at the moment the whole
  record is being served to anyone who can reach the port. It now says that,
  naming the variable responsible.

  Both shipped in 0.0.12 and both were mine; the aligned boot report and the
  self-describing discovery document are otherwise unchanged.

## 0.0.12

### Patch Changes

- 36e4a4c: The scaffold documents what a CLIENT has to do to reach a public MCP door

  `ksor serve` implements the OAuth Resource Server handshake — an
  unauthenticated request gets a 401 carrying
  `WWW-Authenticate: Bearer resource_metadata="…"`, and that document names the
  record's resource identifier and its authorization server, so a client discovers
  where to authenticate instead of being told. None of it was written down
  anywhere an adopter or their agent reads. The operator half was documented (the
  three environment variables); the half their agents actually execute was not.

  The scaffold's `AGENTS.md` now walks the three steps, and names the failure that
  goes wrong quietly: a token minted for a different audience is a perfectly valid
  token, and this door rejects it, so `aud` against `KSOR_JWT_ALLOWED_AUDIENCES` is
  the first thing to compare when a client authenticates fine and still gets 401.
  It also records the two behaviours a client author has to know and could not have
  guessed — RS256 only, no opaque-token introspection, and an unknown key id
  answering 503 rather than 401, because during a key rotation the token is
  probably good and retrying beats sending the user back through a login.

  This closes one of the three items named in issue #26; the worked provider
  recipes and the introspection/rotation policy remain open there.

- 125970c: Every 401 from the MCP door carries its `WWW-Authenticate` challenge, not just the first

  Only the missing-token branch emitted `WWW-Authenticate: Bearer
resource_metadata="…"`. A token that failed verification — expired, wrong
  audience, no subject, bad signature — came back as a bare 401. That is the most
  common 401 a real client will ever see, because tokens expire mid-conversation,
  and it left the client with no pointer back to the resource-metadata document:
  it could not re-discover the authorization server it had just been talking to.
  Only a caller that had never sent a token was told where to go.

  The MCP authorization spec requires `WWW-Authenticate` on a 401 without
  qualification. Every 401 now carries it, with RFC 6750's `error="invalid_token"`
  so a client refreshes rather than retrying the dead token.

  A **503** stays deliberately unchallenged: an unreachable key set is our outage,
  not the token's fault, and challenging there would send a user whose token is
  perfectly good back through a login over a key-fetch failure.

  Found by adversarially checking the release that documented this door. The
  adversarial auth suite missed it by asserting the STATUS of each rejection and
  never the header — it now sweeps every 401-producing token and asserts the
  challenge on each, with the 503 as the negative control.

- 0a94e31: A 503 refusal no longer puts the database host and user on the wire

  When the deferred boot checks fail, `/mcp` refuses with the thrown error's
  message in full under `data.detail`. For the three authored failures that is the
  point — a too-old schema, a governance violation and a text-search mismatch each
  carry a multi-line remedy the operator has to act on. But the catch treated every
  error alike, and `pg` writes the host, its resolved address, the port and the
  database user into its connection and authentication failures. Those went out
  verbatim to any caller who could reach the door.

  What may leave is now decided in one place and by TYPE, not by inspecting
  message text: a class we wrote is a class whose words we control. A driver error
  is refused with its class named and its text withheld, and the caller is told
  which kind of failure it is — infrastructure, not their request.

  The full text still reaches the operator, deliberately: the refusal says the
  reason is in the server's logs, and the deferred-boot line recorded only the
  error's NAME, so before this the real message existed nowhere. That is also why
  the boot checks are not sanitised at their source — reducing a driver error to a
  class name early would destroy the one copy anyone can act on.

  **The test that covered this was holding it in place.** It asserted that
  `http.ts` contains the literal string `data: { detail: message }` — so the leak
  was pinned by an assertion with reasoning attached. Grepping source is the right
  instrument for "does this check run before dispatch", because position is a
  property of source, and the wrong one for "what does the response contain".
  Response contents are now asserted against real bodies, including a `pg`-shaped
  connection failure whose host, address, port and user must all be absent.

  Verified live: a gateway pointed at an unreachable database answers
  `the content store is unavailable (Error)` with no host, port, user or database
  name anywhere in the body, while the server log carries
  `connect ECONNREFUSED 127.0.0.1:59999` in full.

- 1dd6211: The dimension ceiling says which shape it applies to, instead of blaming pgvector

  `ksor schema` refuses an embedding dimension above 2000 with
  "(pgvector vector + HNSW ceiling)". The refusal is right and the reason was
  wrong: pgvector indexes a `vector` to 2000, but a **`halfvec` to 4000**, via an
  expression index on the cast — verified live against a real database, where
  `hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)` plans an Index Scan.

  The old wording read as pgvector's own limit, so an adopter whose model emits
  more than 2000 dimensions could conclude it was unusable here, over a wall that
  is not one. The message now names the shape the ceiling belongs to — this schema
  declares `VECTOR(dim)` columns and indexes one directly — and the constant
  carries why raising it is a decision rather than an edit: every query site would
  have to use the same cast as the index or fall silently back to a sequential
  scan, and the halfvec arm's float16 rounding lands on the score the abstention
  gate reads.

  The same claim is corrected in the scaffold's `AGENTS.md`, which gains the reason
  `dim: 1536` is the shipped default: `gemini-embedding-001` emits 3072 and ksor
  asks it for 1536, which per Google's published MTEB table costs nothing
  measurable — 1536 scores 68.17 against 2048's 68.16.

  The 2000 refusal is unchanged. Issue #49 records the decision it now points at.

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
