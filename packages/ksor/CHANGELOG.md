# @panaversity/ksor

## 0.0.56

### Patch Changes

- bf35e2f: `add-sources` 2.0.0: a file or a person, one skill — with a check the agent
  runs instead of a rule it is asked to follow.

  Two issues asked for two paths into the record. #31: an owner with a folder of
  PDFs had no path — the skill stated the rules and converted nothing. #50: an
  owner whose knowledge is only in their head had no path — the interview scoped
  the record and stopped, leaving `knowledge/` full of samples about KSoR.

  **They are one skill, not two.** The record draws no line between the kinds:
  an interview attestation in `sources[].resource` passes `ksor build` today,
  the fidelity rules read the same for both, and a real owner has BOTH — the
  policy PDF and the exception everyone knows that the PDF never mentions. So
  the person step runs after every file: "what does this not cover?" is the
  question that finds the pages nobody wrote. A sibling skill would have made
  the agent choose before it knew, and #50's own three-way trigger collision
  vanishes.

  **The source is a file.** Extract first, into a scratch file outside
  `knowledge/` — the skill names the extractor per format (`pdftotext`,
  `pandoc`, macOS `textutil`, `markitdown`) and what to do with none on `PATH`:
  read the file directly and SAY the verification that follows is weaker. An
  empty extraction is a scanned image, and the skill stops and tells the owner
  rather than OCR and hope. Then decide the shape of the record, convert to
  CommonMark a person would have written, name the source precisely, and run
  the shipped check:

  ```
  node .agents/skills/add-sources/verify.mjs /tmp/in.txt knowledge/<path>.md
  ```

  `verify.mjs` — plain Node, no dependencies, the owner's to keep — lists every
  number, date, threshold, code and capitalised name in the document's body that
  does not appear in the extraction, case-folded and whitespace-collapsed.
  Frontmatter and footnote ids are exempt, because they are the agent's words by
  design. It is a floor, and says so: a value that passes was in the source; it
  cannot see a value that was dropped, and it cannot tell a paraphrase from an
  invention. Model-driven conversion is highest-fidelity for layout and
  lowest for exact values, and this is the mechanical half of "copy load-bearing
  values exactly".

  **The source is a person.** Ask one question at a time in their words — who
  triggers it, the steps, who approves and at what threshold, what goes wrong,
  the exception — until someone who was not in the room could act on it. Draft
  as the record, not a transcript; anything unconfirmed is an `Open question:`
  line, never prose. The attestation goes in `sources` (who, role, instant,
  conducted by) — there is no `provenance:` key, and no transcript is kept.
  Two people describing one process differently stay two cited statements.

  **Both end the same way, and the ending is new.** Read it back on `pnpm dev`,
  then ask the owner to approve and write down what they said. A draft reaches
  no machine surface, so a skill that stopped at the draft left every `llms.txt`
  and every door empty — found on the journey walk: `1 document(s), 0 admitted`.

  The rules that were restated here (placement, frontmatter, audience,
  deprecation) now point at the emitted AGENTS.md instead. The trigger test that
  asserted "no skill claims dictated knowledge" flips: add-sources claims it by
  name, and no other skill may. Eleven cases hold `verify.mjs` to what it does
  and, in three of them, to what it does not claim.

- 73530e6: Prune the scaffold's skills to the three that make a record, and fix the two
  seams every adopter hits on the way to one.

  **Removed: `make-slides` and `make-summary`.** They were 45% of all shipped
  skill text and 21.6% identical to each other — their own commit says
  "make-summary is make-slides' discipline applied to prose". A companion is
  downstream of a record existing and invisible to the agent surface (no route,
  no `llms.txt` line, no MCP node); no fixture and no tutorial ever fired either;
  and neither was ever shown to beat its absence, which is the bar AGENTS.md sets
  for keeping a skill at all. Their one real rule — a card may only say what its
  document says — already lives in the emitted AGENTS.md, and the site renders
  companions exactly as before. Verified: the emitted checker passes with both
  gone. `format-checker/SKILL.md` is cut to what AGENTS.md does not say; the
  program it names is unchanged.

  **Fixed: `intake-interview` was contradicting itself in its trigger.** The
  always-resident description promised "seven questions"; the body has asked
  three since 2026-08-26. The body handed off to "question 4" and "question 5",
  neither of which exists, and claimed `add-sources` writes `verified:` entries —
  nothing does. 1.6.0 says three, hands off to add-sources with whatever material
  the owner has, and drops the false claim.

  **Fixed: the recommended path turned a green record red.** Walked on the
  published package:

  - The README said run the interview, then "delete each starter as your own
    knowledge arrives". Delete the five first and the build refuses
    `ksor-record-empty` and writes nothing — a slug named by no document an
    adopter reads. The README now says to write and approve one document of
    your own before the last starter goes, and names the refusal.
  - The hello-world tutorial approves as `human:you`. The interview then retires
    `human:you` from the policy, and the tutorial's own document — still approved
    by an actor the policy no longer names — refuses `ksor-approver-unauthorised`.
    The interview now re-attributes every act recorded under the placeholder to
    the owner's handle in the same change: it is the same person.

  **Consolidated:** "the record says only what its source says — a gap is an
  open question, never filled from general knowledge" lived only inside
  `add-sources`; it is now stated once in the emitted AGENTS.md where every
  other writing rule is.

  Two deterministic gates hold all of this: a skill-consistency lint (a trigger's
  question count matches its body; every "question N" resolves; every refusal
  slug a document names is one the product raises; every skill a document names
  ships) and a journey walk against the built CLI (interview → one draft →
  approve → delete starters → retire the starter actor, plus the exact state
  each refusal fires on). Every lint assertion was mutation-tested.

  Found by four independent reviews of the plan to build a system of record,
  before building any of it.

- ab6a3ed: The agent tier: a shipped skill, run by a real coding agent, with the skill
  and without it — the comparison AGENTS.md has always demanded and nothing had
  ever run (issue #30).

  `pnpm test:agent` scaffolds a fresh record, installs it, drops a real two-page
  PDF in `src/`, and hands `claude -p` the prompt tutorial 2 hands the reader.
  Once with `add-sources` present, once with it removed. What the agent leaves
  behind is graded, and the split is the Testing contract's own: deterministic
  behavioural graders GATE the with-skill arm — exactly one new document, under
  `finance/`; `.ksor/*` and `instance.md` untouched; the record builds; `status:
draft`, `sources` present, no `id:`/`name:`; page furniture gone; every
  number, date and name in the body found in the extraction by the shipped
  `verify.mjs`. Cost, turns, duration and the baseline arm are REPORTED, so the
  delta is visible and a skill that stops winning is seen.

  "Checker passes" is deliberately not a grader: while this was being designed a
  baseline run passed the checker by hand-authoring `index.md` and editing
  `.ksor/people.yaml` — the worse behaviour scoring better. Files touched is the
  discriminating assertion.

  It spends model tokens, so it is gated like the database tier: on
  `ANTHROPIC_API_KEY` in CI (a repository secret the owner has not yet added; the
  tier runs and reports itself skipped until then) or a logged-in `claude`
  locally, pins a mid-tier model by default (a one-word reply on the default
  model measured $0.25), and runs from `skill-evals.yml` on push to main and by
  hand — never per pull request.

  What it cannot measure is written in the suite rather than implied: a
  conversational skill needs a scripted owner, "reads as a finished page" needs
  a browser, and the adopter's own model is whatever they run.

  Decision 31 records the three choices this week made about the skill surface —
  pruned to three, one skill for a file and a person, and this harness shape
  over the Python trigger script that was proposed and measured wanting.

- c34cc3a: Tutorial 2, _Make it yours_: the walk from hello world's record to one that is
  only the owner's — every output run and pasted as it appeared.

  The intake interview and what it does to the placeholder approver; one policy
  brought in from a real PDF, with the shipped check catching the one number the
  conversion got wrong; one procedure that only ever lived in someone's head,
  written with the thing they were not sure of as an open question rather than
  prose; the read-back on the site and the approval act; then the samples go and
  the tool that approved them leaves the policy. Two refusals do work on the way,
  and the tutorial says exactly which state each fires on.

  The prompt-accounting test now covers both tutorials from one table, so a new
  prompt in either fails until someone names the skill that answers it. Only that
  test changes under `packages/`; nothing an adopter installs behaves differently.

- 87a3542: Correct a claim the tutorial made about `build_id`, and guard the general rule.

  `buildIdOf` hashes `ksor_version` along with the record — deliberately, because
  "what produced this" is part of what a publication is. So a captured `build_id`
  is correct for exactly one release, and the sentence 0.0.54's tutorial fix added
  — "Your timestamp will differ; the `build_id` will not" — was already false when
  0.0.55 published it. A reader on any later ksor sees a hash that does not match
  theirs and nothing saying why.

  Found by walking the published package rather than by reading the diff: the same
  practice that caught the tutorial being uncompletable caught the correction being
  wrong.

  The tutorial now says the id carries the toolchain, names the version its
  outputs were captured on, and points at the reproducibility a reader can
  actually check — run `ksor build` twice on one tree and the id is identical.
  Both captured blocks are re-taken from a 0.0.55 walk.

  A guard in `docs-truth.integration.test.ts` holds the general rule rather than
  the sentence: a document printing a concrete `build_id` must say what moves one,
  within 700 characters of the id. It is PROXIMITY rather than presence — the
  first version asked whether "toolchain" appeared anywhere in the file, the file
  already used the word once for an unrelated reason, and removing the caveat left
  it green. Caught by mutation, and the tightened version immediately found a
  second uncaveated id in the same document.

## 0.0.55

### Patch Changes

- 4ecf549: Test infrastructure only — nothing an adopter installs behaves differently.

  The behavioural evals scored a missing `top_cosine` as `-1`. When a provider
  rate-limits, the read plane degrades to keyword-only by design, so searches
  answer with no score — and the assertions then compared sentinels, reporting a
  vendor outage as "the abstention floor is broken". Four CI failures in a day
  read that way before anyone looked past the assertion. A missing score now
  refuses, naming the cause, and never invents the number that is absent.

- e476197: Fix the hello-world tutorial, which could not be completed as written.

  Three defects, all found by walking the published 0.0.54 rather than by reading:

  - Step 3's document declared `type: Policy`. `Policy` is a reserved type, so the
    record demands `sources` — `ksor build`, `npm run check` and the dev server all
    refused it, and steps 4 through 10 were unreachable. It is now `type: Document`,
    the type the profile promises never to reserve, with a note on why and on what
    an agent should do when it reaches for a reserved one.
  - Step 1 scaffolds with `npx`, which emits an **npm** project, and every command
    after it said `pnpm`. On that project `pnpm install && pnpm dev` fails with
    `sh: next: command not found`. All sixteen commands are npm's now, and the step
    that explains manager detection says which one the rest of the tutorial speaks.
  - The captured outputs had been trimmed after capture, in a document whose second
    paragraph promises they were "pasted as it appeared": `ksor serve`'s boot report
    was missing the `trust` line it has always printed, the build outputs were
    missing their timestamp, `source:` and `wrote` lines, and the port-conflict
    refusal was quoted offering `pnpm serve` where it says `ksor serve`.

  The walk also surfaced that `ksor init` leaves a repo with no commits, so every
  reader's first build prints `source: unspecified`. Rather than hide it, the
  tutorial now shows it and folds `git commit` into the approval step — which is
  where provenance belongs anyway, and which lets the second build print a real
  commit sha.

  The tutorial also said `.mcp.json`'s "first is Neon's" and named the second
  server nowhere, and said nothing about the Neon server acting on the whole Neon
  account. Both are fixed here for the tutorial; the emitted scaffold's copies of
  the same two defects are fixed separately.

  Only the tutorial and the test that pins its prompts changed; nothing an adopter
  installs behaves differently.

- ae49524: Stop a spent OpenAI balance from quarantining content and flipping a generation,
  and name the right variable when a provider key is missing.

  **The serious one.** `insufficient_quota` — OpenAI's answer to an exhausted
  balance, which arrives as 429 like an ordinary rate limit — was classified
  non-retryable, correctly, because no amount of waiting adds credit. But
  "non-retryable" is what the ingest drain reads as **poison chunk**: it
  binary-splits the batch down to singletons and marks each `failed`. A spent
  balance arrives on _every_ chunk, so a run walked the queue quarantining
  everything it touched; if the failed fraction stayed under
  `MAX_FAILED_FRACTION` (2%), `generationReady` admitted it and the generation
  **flipped** — publishing a record in which exactly the passages the owner had
  just edited were unsearchable, `ksor ingest` exit 0, the billing reason visible
  only in `chunks.embed_error`. The same event on Gemini aborts the run, so
  switching provider silently changed what a spent quota does.

  The drain now has three answers instead of two: retryable (abort, chunks stay
  pending), **fatal** (abort the same way, but without spending five backoffs
  first — the account is what is wrong, not the passage), and everything else
  (binary-split to the poison chunk). `isFatal` is optional on `EmbeddingProvider`,
  so a provider that cannot tell keeps the old two-kind behaviour and Gemini's
  path is unchanged.

  **The missing-key refusal names the variable.** `ksor serve` on an
  `embedding.provider: openai` record said `embedding provider "openai" needs an
API key and none was supplied` and stopped — while `ksor serve --help`,
  `env.example` and `docs/deploying.md` all named `GEMINI_API_KEY`, which that
  door does not read. The registry row already held `keyEnv`; it now reaches the
  operator (`— set OPENAI_API_KEY`), and all three documents describe the choice
  instead of one vendor.

  **`ksor calibrate`'s Gemini requirement is stated rather than papered over.**
  Question synthesis is Gemini-only today, so a record embedding with
  `OPENAI_API_KEY` is still refused for a Google key when calibrating through the
  synthesized door. That gap is now said plainly in the refusal and in
  `docs/ingesting.md`, which taught calibration without mentioning it. The
  `--queries-file` door avoids it entirely.

  **The OpenAI live test announces itself.** It is gated on `OPENAI_API_KEY`, no
  workflow supplied one, and a false `describe.runIf` contributes nothing to a run
  — so the suite its own header calls "the tripwire for vendor drift" was absent
  from CI and reported as absent by nobody. It now prints `skipped — set
OPENAI_API_KEY`, the way Gemini's does, and CI passes the secret so the tripwire
  arms the moment one is added.

  Found by an adversarial review of this week's commits.

- ff99eb5: Hash `.ksor/people.yaml` into `build_id`, so the two surfaces of one build
  cannot publish different provenance.

  The phone book added in 0.0.53 rewrites the actor printed on every Owner,
  Approved, Withdrawn and Trust row — `displayActor` replaces `human:contractor-a`
  with "Human: Jane Doe, VP Compliance", and the identifier does not appear on the
  page at all. It was hashed by nothing. `.ksor/governance.yaml` and
  `.ksor/takedowns.yaml` are both in `build_id`; this one was left out, on the
  stated reasoning that including it would refuse the next site build after a
  spelling correction.

  That is the trade critical rule 1 forbids, and the consequence was reachable
  without doing anything unusual: edit a name, `pnpm check` stays green,
  `ksor build` emits a byte-identical lock, and the deployed page publishes an
  approver the `/md/` twin stamped with that same `build_id` contradicts. An
  auditor reconciling the page against the lock finds nothing wrong, because the
  string they are auditing was never covered by it.

  Now: `people_sha256` joins `policy_sha256` and `ledger_sha256` in the lock and
  in `build_id`; `.ksor/people.yaml` joins the inputs that move `source_commit`;
  and the site's staleness gate compares it like the other three, so an edit the
  lock never saw refuses with `ksor-lock-stale` naming the file. Refusing until
  `ksor build` is re-run is the behaviour, not a regression — it is what every
  other published byte already does.

  Two things found alongside it, in the same file:

  - `people.ts` claimed "duplicate keys are refused by the parser rather than
    resolved by whichever came last". They were not. `uniqueKeys: true` makes the
    parser RECORD a duplicate; `toJS()` still resolves last-wins, and nothing read
    the errors — so two entries for one actor published the second person's name
    on the first person's approval, the precise collision the map replaced a name
    derivation to avoid. A duplicate now drops the whole book, and identifiers are
    published instead.
  - The rule lived behind a module that reads `instance.md` on import, so it could
    only be tested by building a record on disk — which is why it shipped asserted
    by a comment. It is now a leaf, `lib/people-rule.ts`, with the shipped
    function under test.

  **Upgrading:** a lock written before this refuses with `ksor-lock-invalid`
  naming `people_sha256`; run `ksor build` and commit the lock it writes.

  Found by an adversarial review of this week's commits.

- b45d477: Say what the scaffold's `.mcp.json` attaches to an adopter's coding agent, and
  stop the README telling them to destroy it.

  `ksor init` emits `.mcp.json` with two servers. The emitted README and AGENTS.md
  both said "the first is Neon" and named the second nowhere — so
  `agentfactory-system-of-record`, a Panaversity-operated endpoint, was wired into
  every adopter's coding agent with no emitted document mentioning it. `.mcp.json`
  attaches servers to the agent that OPERATES the record; a server nobody
  documented is a capability nobody reviewed.

  Both are now named, with what each is and that either may be deleted. The second
  is described as what it is: a read-only example record that is **not** the
  adopter's and that nothing in the project depends on.

  The Neon step also said only that the server exists. It acts on the Neon
  _account_ — an agent holding it can create and delete projects and branches — so
  the README and AGENTS.md now say that before handing over a prompt that runs
  against real infrastructure, and point at Neon's own documentation for the
  scopes rather than paraphrasing them.

  And the "Test the door with an actual agent" section told the adopter to _write_
  `.mcp.json` with a file containing only `test-record` — overwriting the Neon
  entry the same README depends on two sections earlier — and then closed with
  "Delete `.mcp.json`, or keep it". It now shows the entry to **add**, and says not
  to delete the file.

  A guard derived from `mcp.json` itself asserts every server key appears in both
  emitted documents, so adding a server and saying nothing fails on the server
  that was added. Mutation-tested: unnaming the second server turns both red.

  Found by an adversarial review of this week's commits. Whether the scaffold
  should ship a second, vendor-operated MCP record at all is an owner question and
  is untouched here.

- 5283084: Test infrastructure only — nothing an adopter installs behaves differently.

  A skill's `description` is its trigger and nothing measured it (#30). Every
  prompt the hello world tells a reader to say is now matched to a shipped skill
  or recorded as needing none, and each skill's trigger phrases are pinned — so
  narrowing one, the failure mode where a skill silently stops firing, goes red
  naming the phrase. The model-scored half of that issue is untouched.

## 0.0.54

### Patch Changes

- 3f55e91: `ksor calibrate` names the free-tier path when a quota refuses it, and the
  calibration text model moves to `gemini-3.7-flash`.

  Walked on a real free-tier key: embedding is free of charge and a first corpus
  embeds fine (23 chunks, 0 failed), but the DEFAULT calibration door writes one
  probe question per sampled passage with an LLM — and the free tier allows five
  generations a minute. So the documented way to turn on the product's headline
  feature failed, surfacing the vendor's sentence and nothing else.

  Two quotas reach that code and they need opposite answers: the generation cap is
  a wall no wait clears (the remedy is `--queries-file`, the zero-LLM door), and
  the embedding cap is a per-minute window (the remedy is to wait, and the usual
  cause is an ingest immediately before). Both are now named, with why. A 429 this
  does not recognise is re-thrown untouched — an invented remedy is worse than the
  vendor's own message.

  `docs/ingesting.md` documents the zero-LLM door where the reader meets the
  command, including how to choose the questions: the floor is set by the weakest
  one, so a vague question drags it down and a question the record cannot answer
  invalidates the measurement.

  The text model moves `gemini-2.5-flash` → `gemini-3.7-flash`. Cheap, unlike the
  embedding model: it only writes probe questions, so nothing stored is
  re-computed and no floor is invalidated — and the door is recorded beside every
  number, which is what stops two measurements being compared as one experiment.

  **And calibration now embeds on the patient retry.** It used the READ plane's
  door, which never retries a 429 — correct for a live search, which should
  degrade to keyword-only in under a second rather than stall a reader behind
  backoff, and wrong for a measurement nobody is waiting on. So a free-tier key
  that rate-limited mid-run refused the whole calibration. The intent stays
  `query` (a floor must be measured through the label the door searches with);
  only the retry policy moves, to the one `isRetryable`'s own comment describes
  for batch work. Calibration's text generation already took that path, so this
  was the two halves of one act disagreeing.

- dd6371b: Two things: a false claim removed from a shipped page, and the scaffold gains
  `.mcp.json`.

  **The false claim.** `docs/deploying.md` told adopters "The MCP surface already
  applies the audience scope **per request**", under the heading of the very
  requirement it does not meet. It does not: `content-gateway/src/compose.ts`
  reads `KSOR_AUDIENCE` from the environment once at boot into a per-process
  viewer, and the request path never touches it — `docs/authorization.md` says so
  plainly ("Any caller holding a valid token gets the whole record") and
  `specs/ksor/serve/spec.md` names per-request visibility filtering as out of
  scope. A reader who believed the page would point every caller at one door and
  serve them the restricted half. The page now says what the door does — one
  viewer per door, so one process per audience — and separates the audit it does
  give (a `retrieval_log` row naming the verified caller) from the authorization
  it does not. A docs-truth assertion now fails on the claim itself, not merely on
  a command that no longer exists.

  **`.mcp.json`.** The scaffold's closed root set gains one member: the MCP
  servers a coding agent may reach from the project. It ships with Neon's, which
  turns the step the tool could never do for an adopter — provision a Postgres,
  enable pgvector, produce a connection string — into four real tool calls
  (`create_project`, `run_sql`, `create_branch`, `get_connection_string`) and one
  sentence to the agent. The scaffold's README and AGENTS.md carry that sentence,
  and both now say plainly which step no agent can do at any price: the embedding
  API key, which no vendor mints over a protocol. Committed rather than ignored,
  because both entries authenticate interactively and the file carries no secret —
  stated, because pasting an API key into it would change that.

- eebd777: OpenAI joins Gemini behind the embedding seam, and the wiring stops naming one
  vendor (issue #25).

  The seam was already vendor-neutral in shape — `EmbeddingProvider`, the
  framework's normalization and degeneracy checks, and an embedding space
  identified by `modelId` + column width and never by the vendor. What was
  Gemini-bound was the WIRING: `GEMINI_API_KEY` was spelled into three composition
  roots, so a second provider could not obtain a key even though the registry
  would happily build it. Each registry row now names its own key variable, and
  the roots ask, exactly as `instance.md` names the DSN variable rather than
  hardcoding it.

  `provider: openai` with `model: text-embedding-3-small` and `dim: 1536` reads
  `OPENAI_API_KEY`. Over `fetch`, no SDK — the same call decision 12's 2026-08-22
  revision made for Gemini, and for the same reason.

  Two things a live call surfaced that a stub would not. Response items carry
  their own `index` and the vendor does not promise array order, so they are
  sorted before the framework pairs them positionally — a shuffled response is the
  same count, the same width and all finite, so every downstream check passes
  while every passage carries another's vector. And an exhausted balance arrives
  as **429**, the same status as a rate limit: it is now read from the vendor's
  `error.type` and never retried, because five exponential backoffs do not add
  credit.

  Switching provider is a re-embed of the whole corpus and a re-measured
  `vector_floor`. A different provider is a different embedding space, and the
  invariant against copying a calibrated constant applies across vendors with more
  force, not less.

  Verified live against the real API on a funded key: 1536-dimension vectors, a
  paraphrase at cosine 0.812 against an unrelated sentence at 0.058, and the two
  intents agreeing to 0.9997 — which is the symmetry that makes the empty task
  labels correct. Then through the whole plane: a real record ingested to Postgres
  under `embedding_model = text-embedding-3-small`, 23 chunks, 0 failed, stored at
  the declared width of 1536 and L2-normalized as the framework promises.

  One more defect the live call found: `buildShippedProvider` handed EVERY
  provider Gemini's task labels from global config, so an OpenAI run logged its
  space as `text-embedding-3-small/d1536/RETRIEVAL_DOCUMENT` — a label that vendor
  has no concept of and never received. The labels moved onto the registry row,
  where a vendor's shape belongs.

- eb54871: The npm page shows what the product does, on the first screen.

  It asserted the headline behaviour — a cited answer, an honest refusal — and
  demonstrated it nowhere. A reader had no way to tell a real mechanism from a
  prompt instruction, which is exactly the skepticism this product exists to
  answer. It now shows three things, all of them real output: the admitted count
  moving when a human approves a draft, the `provenance` and `governance` a search
  hit carries, and an abstention envelope. It also links the hello world.

  Nothing was added to the tarball; this is the README npm renders.

- 6e5ff3e: Repo documentation and a test only — nothing an adopter installs changes.

  `docs/status.md` named 0.0.42 while the published package was 0.0.53. Authority
  rule 3 makes that file the only authority on what is built, and it is the first
  thing an evaluator's coding agent reads. It is current now, and a docs-truth
  assertion holds it equal to `packages/ksor/package.json` so a Version PR cannot
  bump one without the other. It also records that the full kernel walk was re-run
  against 0.0.53 — it had last run against 0.0.18, thirty-five releases earlier.

- ed947c1: The deploy runbook stops ruling out the one step Vercel calls required.

  `docs/deploying.md` said the silent-404 failure "does not depend on the
  Application Preset". Vercel's own guide says the opposite: a project builds as
  services only when the preset is `Services` AND `vercel.json` carries a
  `services` key, and "if either is missing, Vercel falls back to its default
  framework detection and ignores your services configuration" — which is that
  failure exactly, and no file in the repository can set a project setting.

  One measurement of ours disagrees with that guide and is recorded rather than
  reconciled: two projects read back from the API, one `Services` and one `Other`,
  both built and served. Both facts are real; guessing between them is what
  produced the sentence that steered adopters away from the fix.

  The scaffold's runbook now sets the preset at step 2, and ends with the three
  curls that tell a live deployment from a Ready-and-404 one — `/mcp` answering
  405 is the door refusing a GET, which is how you know it is routed at all.

## 0.0.53

### Patch Changes

- f77ca55: The emitted README documents `.ksor/people.yaml`.

  Display names shipped documented in the scaffold's AGENTS.md and not in its
  README — so the coding agent knew about the feature and the owner did not, on
  the one feature whose entire input is a human typing their colleagues' names.
  The README now carries it beside the keys that publish a document: the map
  shape, that an actor with no entry renders exactly as stored, and that
  appearing in the file grants no authority at all.

## 0.0.52

### Patch Changes

- 1e60b9d: The site prints natural names for the actors a record cites, where the record
  declares them.

  A governed page led with a slug — "Owner · human:bashiraziz" — on every owner,
  trust, approval and withdrawal line. `.ksor/people.yaml` maps an actor to the
  name a page should print, and the site substitutes it at render time. An actor
  with no entry renders exactly as stored: no splitting, no camelCase guessing,
  no derivation. A display name is the one thing in a governance line that cannot
  be computed — `bashiraziz` is equally "Bashir Aziz" and "Bashira Ziz" — so the
  owner is its only source.

  A MAP keyed by the whole identifier, not a list of names a handle is derived
  from. The derivation could only ever match a handle that IS somebody's squashed
  full name, so `human:ciso`, `human:audit-lead` and `human:mjs` — most of the
  actors in a real record — had no expressible name at all; and it collided, since
  two different people can squash to one handle.

  Deliberately NOT part of `.ksor/governance.yaml`. That file is the root of
  authority: its key set is closed so nothing can sit there without being
  enforced, and its digest is hashed into `build.lock.json` — so a display name
  living there would mean correcting the spelling of somebody's name refused the
  next site build as `ksor-lock-stale`. Appearing in `people.yaml` confers no
  authority; it only changes what is printed, and nothing cross-checks the two
  lists, because a person who leaves the authority list is still the recorded
  approver of everything they approved.

- f23cddc: `ksor calibrate --check` reports whether a declared abstention floor is still
  holding, from the record's own traffic.

  A floor is measured once and the record then grows. As it does, questions that
  used to be out-of-corpus start scoring above a fixed number, so the record
  answers what it used to refuse — no error, nothing logged, and the same
  `gate: { floor: … }` in every envelope. AGENTS.md forbids copying a calibrated
  constant between corpora; the same reasoning applies across time within one
  corpus, and nothing enforced it (#182).

  It needs no telemetry and no new dependency: every search already leaves an
  audit row carrying the gate's own signal, on both sides of the gate, so this is
  one indexed query — no provider key, no embedding call, no LLM. It reports the
  abstain rate, the percentiles of answered top scores, and how many answers
  landed within 0.01 of the floor (the size of the decision in this project's own
  gold, not a threshold somebody picked).

  **It never fails a run**, and that is the design rather than a limitation. A
  stale floor wants re-measuring; failing a build for one would make the shortest
  way out deleting `vector_floor` — turning the abstention gate off entirely to
  clear the error, which is the escape `build/lifecycle-notice.ts` refuses to
  create for a passed review date. It is also a monitor and not a measurement: it
  can say a floor has gone permissive against real traffic, never that it is too
  strict for questions nobody asked, and it says so rather than reporting a
  healthy-looking nothing on a record no one queries.

- a403e19: the served envelope now discloses when a §7 audit row could not be written (issue #150)

## 0.0.51

### Patch Changes

- 6478ca4: Test infrastructure only — nothing an adopter installs behaves differently.

  Every database-tier suite now bootstraps its scratch database under a name
  unique to the run (`ksor_<slug>_<base36 ms>_<6 hex>`) instead of a fixed one.
  Fixed names meant two runs against one Postgres — a second `pnpm test:db`, a CI
  matrix job, an agent running the tier alongside a person — dropped each other's
  database `WITH (FORCE)` mid-test, which surfaced as a missing table or a short
  row count and read as flakiness. A new reaper (`scripts/db-reaper.ts`, the
  tier's globalSetup) drops what an interrupted run leaks, and guard rule 12 keeps
  the naming from drifting back.

- c466d4b: The scaffold moves to Fumadocs `16.15.4` (`fumadocs-core`, `fumadocs-ui`) and
  `fumadocs-mdx` `15.4.0`.

  Maintenance, not a fix — no advisory pushed it, and `npm audit` was already
  clean. It is taken now because the four behaviours the scaffold cites BY VERSION
  were re-verified against the new bytes rather than assumed, and each holds:
  `CalloutType` is still the same six values (`fumadocs-ui/dist/components/callout.d.ts`);
  `resolveHref` still resolves only the `./` and `../` forms and returns everything
  else untouched, which is why the record keeps its own resolver; `remark-code-tab`
  still honours `tab-group` on the `CodeBlockTabs` branch only, which is why the
  scaffold picks that branch; and the search engine is still ZBSearch, so the
  `language` option stays absent. Those citations now name `16.15.4`.

  `fumadocs-ui` pins `fumadocs-core` exactly, so the two always move together;
  `fumadocs-mdx@15.4.0` requires `fumadocs-core ^16.15.3`, which is what makes this
  one change rather than three. Nothing else moves with it — Fumadocs peers Next as
  a range (`16.x.x`). The committed pnpm lockfile is regenerated to match.

- 69d57f2: `ksor migrate --write-site` no longer deletes dependencies the adopter added to
  their site.

  Every file under `system/site` is offered as a whole-file replacement, which is
  right for the copied rule modules and wrong for `system/site/package.json` — a
  register ksor and the adopter both write in. Copying it whole removed anything
  they had added, inside the same hunk that carried a pin bump, so a project could
  stop building on the release meant to fix it. It is now merged per section: the
  entries ksor ships move to this release's versions, the adopter's own survive,
  and an entry ksor no longer ships is left alone rather than deleted (the tool
  cannot tell one it retired from one they added).

  Adds `docs/upgrading.md`, which ships in the tarball: the four-step path, the
  table of what migrate carries, the list of files it does not — so an adopter
  knows what to diff by hand — and the refusals to expect.

- 4b077aa: The scaffold pins Next `16.3.3`, clearing three high-severity advisories a
  fresh `npm install` reported (#207).

  `next@16.2.9` pulled `sharp@0.34.5` and `postcss@8.4.31`; the advisories are
  against those, not against anything the scaffold declares, so the bump that
  fixes them is Next's own. Measured on a fresh scaffold from the published CLI:
  `npm audit` goes from **3 high to 0**, the static build takes 41.8s and emits
  its 22 pages, and `llms.txt` carries its 5 entries unchanged. `16.3.3` is not
  semver-major and Fumadocs peers Next as a range (`16.x.x`), so nothing else
  moves with it. The committed pnpm lockfile is regenerated to match — the half
  that would otherwise break an adopter whose CI installs frozen.

  An existing project takes both across with
  `ksor migrate --write-site`, which offers every file of `system/site` this
  release emits — the pin and the config among them. It prints the diff and
  changes nothing without `--write`.

  The scaffold's `next.config.mjs` also sets `agentRules: false`. From Next 16.3,
  a `next dev` that detects a coding agent writes `AGENTS.md` and `CLAUDE.md` into
  the Next project root — which here is `system/site`, where the record's own
  hygiene rule refuses markdown (`ksor-site-holds-content`: the site renders the
  record, it never holds it). Left on, an adopter's `pnpm dev` turned their own
  `pnpm check` red without their touching anything.

## 0.0.50

### Patch Changes

- f27f947: The three embed tuning variables now take effect when set in `.env`.
  `KSOR_EMBED_TIMEOUT_S`, `KSOR_QUERY_EMBED_TIMEOUT_S` and `KSOR_EMBED_CACHE_MAX`
  were read once at module load — before the CLI applies `.env` in `main()` — so
  a value set there was silently ignored and the default stood. An adopter who
  set `KSOR_EMBED_CACHE_MAX` to fit a small runtime, for instance, still got the
  ~250 MB default cache and could OOM in production with nothing pointing at why.
  The reads now happen at use. Exported shell variables were unaffected and still
  are.

## 0.0.49

### Patch Changes

- 5701679: **Three places where the record described a system that was never built.**
  Nothing an adopter runs changes; what changes is whether the decision log can be
  trusted without re-checking it against the code (issues #151 and #180).

  Decision 13 said the door composes `secureHeaders` / `bodyLimit` middleware.
  `bodyLimit` is real — `content-gateway/src/http.ts:26,522` — but `secureHeaders`
  was never adopted: nothing imports it, and the door sets its own pair by hand
  (HSTS and `x-content-type-options: nosniff`, "nothing else"). The code is right
  and the entry was wrong, so the entry is corrected.

  The same decision, and guard rule 5's why-comment, said `hono` and
  `@hono/node-server` were "already the SDK's transitive deps, so zero new install
  bytes". True of the 1.x monolith, false since v2 — `@modelcontextprotocol/server`
  2.0.0 depends on `zod` and `@modelcontextprotocol/core` and nothing else. The
  reason that survives the upgrade is the one already recorded (the SDK's only HTTP
  shape is Web-standard and hono needs no bridge to it); the weight is a cost paid
  deliberately rather than an absence of cost.

  The README stated OpenTelemetry in the present tense — "tells us what happened",
  "records what the infrastructure did" — with no telemetry code in the tree. It is
  future tense now, with the constraint the row's own wording already implies:
  default auto-instrumentation captures `pg` statement text, and a trace backend is
  a different security boundary from the MCP response.

  SLSA/Sigstore, two rows above, needed the opposite correction. It is not future:
  `release.yml` sets `id-token: write`, so every release attests the published
  PACKAGE through npm provenance. What is unbuilt is signing a RECORD's own
  `build.lock.json`. Both rows now say which half runs.

  Also removed: a `publishConfig` block on `@panaversity/ksor-content-gateway`,
  which is `private: true` and is bundled rather than published, so the block could
  never apply.

- 7e72d35: **The embedding dimension ceiling is now held equal in both places it is
  declared.**

  `EMBED_DIM_MAX` is declared twice — in the instance parser, so a bad `dim:` is
  refused when `instance.md` is READ, and in the DDL renderer, so it is refused
  again before any schema is rendered. The split is deliberate and the comment
  beside one calls it a mirror of the other. Nothing held them equal: before this,
  the constant appeared in no test anywhere in the repository, so raising the
  ceiling in one place alone would have left the parser and the renderer refusing
  at different dimensions — one of the two would still have reddened an existing
  wording assertion, and an instance-only edit would have passed everything.

  The test asserts EQUALITY and never the number, so the ceiling can still move —
  which is the point, because the decision that records why it sits at 2000 prices
  raising it rather than forbidding it.

  Also in the same area: the emitted `AGENTS.md` carried the benchmark figures
  behind that default with no source and no date, shipped to every adopter. It
  states the constraint an adopter acts on and points at the decision that holds
  the numbers, so the measurement now lives beside the constant it constrains,
  with its provenance, in one place.

- b7a7c5b: **Two audit rows were missing the fact that makes them auditable.**

  `retrieval_log` exists so an operator can say what an act was allowed to see and
  what it answered from. Two rows could not answer that:

  - **`outline_served` recorded no generation.** Its two siblings,
    `similarity_searched` and `content_served`, both pin one — so the single act
    that hands an agent the SHAPE of the record was the one that could not be
    joined to the publication it described. The projection carried no generation
    to write, so this is a column rather than an extra query: `walk` already
    selects it, and `OUTLINE_COLUMNS` moves 9 → 10 under the same width guard that
    exists because a narrower fixture once hid a truncated projection.
  - **An ANSWERED search recorded no `top_cosine`.** The abstained row has always
    carried it, so the ledger held the deciding score only for queries the gate
    REFUSED — precisely the half that cannot show a floor drifting as a record
    grows. Both rows now record what the decision turned on, whichever way it
    went.

  An empty outline still records NULL, deliberately: it served no row from any
  generation, which is the same reason `search_abstained` records NULL when
  nothing matched.

  **And `cleanCut` is deleted.** It was exported and documented as the tool the
  search budget uses to trim an overflowing hit — in the present tense, for a
  caller that has never existed. It came from the predecessor's grain-expansion
  path, a feature ksor deliberately never carried, so it was a mechanism brought
  across without the purpose it existed for.

- 50abe52: **`pnpm preview` no longer dies on a URL it cannot parse or a file it cannot
  read.**

  Two crashes of one shape, both in the emitted preview server. `pipe()` attaches
  its error listener to the destination and never to the source, and
  `decodeURIComponent` throws on a malformed escape — so either failure reached a
  `node:http` request listener with nobody watching, which is an uncaught
  exception. The process exited and left the adopter a dead port and a stack trace
  instead of a page.

  - **`http://localhost:3000/%`** ended the session. So did `/%zz` and any
    truncated multi-byte escape — the first hostile URL a browser extension or a
    scanner sends.
  - **A file the export cannot read** did the same, with no attacker at all: a
    mode-000 file anywhere under `out/` is a one-request kill, and so is the
    ordinary loop of rebuilding in another pane while the preview runs, where the
    export is torn down and a page re-requests an asset that has gone.

  A request that cannot be parsed now resolves to nothing, which is what the 404
  path is for. And a file that fails to open answers **500 with a reason**, not a
  blank page: the response head is written on the read stream's `open` event
  rather than before it, so a file that never opens can still be answered
  honestly. (A file that vanished BEFORE the request was already a 404 — the
  resolver stats every candidate — so this is the file that is there and will not
  open.) Writing it first would have produced a complete, valid, EMPTY `200` —
  which a browser renders as a blank page and `fetch().text()` reports as `""` —
  and that is the same silent lie this change exists to stop telling, one layer
  down. A failure PART WAY through, where the head is already out and no status
  is left to send, destroys the connection instead of ending it cleanly, so the
  client sees a truncated response because that is what happened. Either way the
  reason goes to the console.

  **Two more failures now explain themselves** instead of arriving as stack
  traces: an occupied port names the collision — `dev` defaults to 3000 as well —
  and a `PORT` that is not a port number is refused. That covers more than the
  obvious case: `Number("")` and `Number(" ")` are `0`, so an unset `PORT=` in a
  shell or a compose file used to bind an arbitrary port and print
  `http://localhost:0`, exactly as `PORT=abc` printed `:NaN`.

  **And the server binds where it says it binds.** `listen(PORT)` with no host
  binds every interface while the log has always printed `localhost`, so the built
  export was reachable from the whole network. It is loopback now, with
  `KSOR_PREVIEW_HOST` as the way out for the cases where reaching it from
  elsewhere is the point — a container published with `-p`, a cloud dev box, or
  the built site on a phone. Set it on the command line: `preview` is plain `node`
  and does not read `.env`.

  Stated precisely, because a governance claim is the one thing to get exactly
  right in both directions. A DEFAULT build carries no drafts at all (record spec
  §2.5 admits them to no surface of a build), so what a default `out/` exposed is
  the published record. The case that mattered is the one this first missed:
  `KSOR_AUDIENCE=public,<audience> pnpm build`, whose output holds
  audience-restricted documents and which the scaffold's AGENTS.md says "belongs
  behind that audience's own access control, never on a public host" — that `out/`
  was network-reachable from a preview. `KSOR_DRAFTS=show` is the other. `pnpm dev`,
  where drafts live, is `next dev` and unchanged by this.

  Alongside this, the containment check moved from once-per-request to
  per-candidate. `resolve()` tries three filename shapes, and the third,
  `` `${target}.html` ``, names a sibling of the export root whenever the target
  IS the root. It is reachable only when the export has no `index.html`, so this
  is defence in depth rather than a fixed leak — and it is the case the test now
  builds an export without an index in order to reach, having previously asserted
  the rule against a fixture that could not.

- 33b6080: **`ksor schema --apply` no longer loses a ROLE when two run at once.**

  `schema.sql` creates three roles, and Postgres roles are CLUSTER-GLOBAL — so
  `IF NOT EXISTS ... THEN CREATE ROLE` is check-then-act across every database on
  the instance. Two concurrent applies both see the role absent and both create
  it. Measured on Postgres 17.7 against an empty cluster: **six concurrent applies,
  five failed.**

  The SQLSTATE that surfaces is `unique_violation` (23505) on
  `pg_authid_rolname_index`, **not** `duplicate_object` (42710) — catching only the
  latter is the obvious fix and does not work. Both are caught now.

  And each role is created in its **own** `DO` block. A `DO` block is a single
  statement, so an exception anywhere in it rolls the whole block back: three
  roles in one block meant a loser on the first never created the other two, and
  the apply then granted against roles that did not exist.

  The same check-then-act sat in the 2.2 → 2.3 migration, which `ksor schema
--apply` also reaches, and is fixed with it.

  This is not only a test-tier problem, which is why it lives in the DDL: two
  operators provisioning at once, or a deploy step racing a developer, hit it
  identically.

  **Scoped honestly:** what is fixed is role creation, which is the part that
  raced across SEPARATE databases — the shape two concurrent runs actually have.
  Two applies against the SAME database still race, on `CREATE EXTENSION` and then
  on table creation; `applySchema`'s contract is a fresh database and that is
  unchanged here.

- 988d749: **The emitted site builds with webpack, so a real record still deploys.**

  The scaffold's site build was `next build`, which under the pinned Next 16.2.9
  means Turbopack — and on Vercel's default build machine (4 cores, 8 GB) that
  does not survive a record big enough to prerender a few hundred routes.
  Measured on a real 205-document record, 435 routes: about seven minutes, then

  ```
  FATAL: An unexpected Turbopack error occurred:
  Failed to write app endpoint /icon.png/route
  - timeout while receiving message from process
  - deadline has elapsed
  ```

  Nothing in that points at the build command, and it names `/icon.png/route`,
  which is not the problem — the trace's own middle is the PostCSS step. The same
  record compiled in 86s with `next build --webpack`, which is Next 16's
  documented opt-out rather than a workaround: the v16 upgrade guide ships exactly
  this `package.json` line for a project that needs webpack.

  The scaffold now emits `next build --webpack`. `dev` is unchanged and still
  Turbopack — the failure is production-only, where every route is prerendered at
  once. An existing project takes the fix with `ksor migrate --write-site`, which
  already offers `system/site/package.json`.

  This also retires an intermittent CI failure: the conformance suites carried a
  retry for `TurbopackInternalError: Input image not found`, a flake in
  Turbopack's static-image metadata pipeline reading the scaffold's `app/icon.png`
  mark. That pipeline is no longer on the production path, so the retry is gone
  rather than left in place — a shim retrying quietly is what would stop the suite
  reporting a real regression.

- 988d749: **A Vercel deployment that reports Ready and 404s everywhere now has a written
  diagnosis, and the provenance hint stops blaming the reader.**

  A deployment can report **Ready**, take the production alias, and serve
  `404: NOT_FOUND` at every path, `llms.txt` included — after an install that ran,
  a `ksor build` that ran, and every route prerendering. The only signal anywhere
  is one build-log line, `WARNING! Build output contains no "functions" or
"static" directory`.

  **The cause is not established, and the docs now say so rather than guessing.**
  The Application Preset was the obvious suspect and is measured NOT to be it: two
  live Git-linked projects, one preset `Services` and one preset `Other`, both
  built the `services` block's `site` and `door` and both serve them (`/` 200,
  `llms.txt` 200, `/mcp` 405 from the door). Naming a wrong cause in the deploy
  guide would have sent every future reader to a field that is not the problem.

  `deploying.md` and the scaffold README now name that failure, quote the warning
  so it is searchable, and record two things verified live on a 205-document record
  (issue #197): patching the project's own `outputDirectory` / `buildCommand` /
  `installCommand` and taking a fresh Git-sourced deployment does **not** fix it —
  `vercel.json` is what Vercel reads — and replacing the `services` block with the
  classic top-level keys does. Two earlier sentences were corrected rather than
  extended: the docs said a wrong preset meant "`/mcp` never exists", which asserted a
  mechanism now measured false, and offered a site-only fallback as project
  settings, which cannot override `vercel.json`.

  **And `source: unspecified` now names both of its causes.** Only one is "you
  never made a repository"; the other is a record that IS committed and pushed, on
  a machine the `.git` directory never reached, because an upload-based deploy
  excludes it — Vercel's CLI does. `git init` is still offered first, because it is
  still right for the reader who has not made one; what is new is the second line,
  for the reader who has, and who was previously being told to redo work they had
  already done in the one message that governs provenance.

  **A remedy also stops naming a flag the verb refuses.** `--source-commit` is an
  `ingest` flag; `ksor build` rejects it as an unknown argument and exits 1. Two of
  the five provenance notices offered it regardless of which verb was printing —
  including the one this change is for, read by someone whose upload stripped
  `.git` on the deploy path, for whom it would have turned a provenance warning
  into a failed build. The flag is now offered only by the verb that accepts it,
  and the same correction is applied to the `(dirty)` notice's `ksor build
--strict`, which had the defect latently. Both are asserted across every gap,
  enumerated from the exported list rather than a copy of it.

  The emitted `vercel.json` is unchanged.

## 0.0.48

### Patch Changes

- 4883d2c: A document page gives its text 16px more room: the horizontal padding drops
  from 32px to 24px. The reading measure itself is unchanged — widening it was
  tried and reverted, because measuring what the column already is showed it is
  wider than the comment beside it claimed, not narrower.

## 0.0.47

### Patch Changes

- 00c99da: **The intake interview asks its three questions in the owner's words.** The
  previous wording was precise and unanswerable: question 1 asked the owner to
  finish "when someone here disagrees with this corpus, the corpus wins about
  ___", which is not a sentence unless you already know the ledger analogy the
  README uses, and then explained what the answer would be used for inside the
  question itself. An owner reported being unable to tell what it wanted at all.

  Now: "What is this knowledge base about?", "What is close to that, but not part
  of it?", and "Who signs off on a document, and who can take one down?" — each
  with one too-vague example and one specific enough, and nothing about
  `instance.md` or the MCP surface in the question. The reasoning that used to sit
  inside the questions moved below them, where it explains the design to whoever
  maintains the skill instead of blocking the person answering.

  Nothing about what gets written changed.

## 0.0.46

### Patch Changes

- a28fac9: **The Auth0 recipe now names the trap that costs the afternoon it warns about.**
  Walked end to end against a live Auth0 tenant and a deployed door for the first
  time (2026-08-26), and the recipe was right about what to type and silent about
  the two things that actually go wrong.

  The API **Identifier** must equal `KSOR_MCP_RESOURCE_URL` character for
  character, `/mcp` path included — and **Auth0 does not let you edit it after the
  API is created**, so a wrong one is fixed by making a new API, not by correcting
  the field. Neither fact was written down.

  Two Auth0 errors now have a table, because both arrive as a failed token request
  and they mean opposite things: `Service not enabled within domain` is no API
  with that Identifier, while `Client "…" is not authorized to access resource
server` means the Identifier is right and the grant from step 5 is missing.
  Moving from the first to the second is progress.

  And "Verify it" gains a step 0: ask the PROVIDER for a token before touching the
  door. Half of these failures never reach ksor, and one `curl` at the token
  endpoint separates the halves — which is how this diagnosis was actually made,
  after several rounds of reasoning about dashboard toggles that turned out not to
  be the cause.

  **And it now says you need more than one Application.** The recipe never
  mentioned the site's own sign-in control, never said its Application is a
  different TYPE from an assistant's, and never said the two cannot be the same
  registration — a public client with no secret and a confidential client that
  sends one are different things, and using one for both returns a bare `401` at
  the token endpoint that names nothing. A table at the top of the recipe now
  gives one row per caller: what type, what token-endpoint auth, what callback,
  and whether it needs the grant from step 5.

## 0.0.45

### Patch Changes

- 1875d06: **`pnpm preview` — somewhere for `pnpm build` to land.**

  The site is a static export, so there is no server to start; that is what makes
  the record hostable anywhere. But it also means the natural thing to try after a
  build — `pnpm start` — answers `ERR_PNPM_NO_SCRIPT_OR_SERVER`, which explains
  none of that. `pnpm preview` serves `system/site/out` on the same bytes a host
  would. It is `node:http` and nothing else: no dependency, no network fetch, works
  offline and behind a firewall, for the same reason the build downloads nothing.
  Run before a build, it says so and exits `3`.

  **And the Vercel dashboard import now says what actually goes wrong.** Vercel
  auto-detects a root directory by looking for a framework, finds the Next app, and
  fills the field with `system/site`. The build then reads
  `system/site/vercel.json`, which does not exist, and fails with
  `Project framework is set to "services", but no services are declared` — even
  though the import screen just listed both services, because that step reads the
  root file and the build step uses the Root Directory override. The fix is one
  field: set Root Directory to the repository root. `docs/deploying.md` now names
  the error, the cause and the fix, plus the site-only fallback.

  Found by an adopter, and it will recur on every dashboard import until Vercel's
  detection changes — the layout that triggers it is decision 8 and is not moving.

  **And the intake interview asks three questions, not seven.** Seven did not
  survive contact: an agent running the skill decided five were too many,
  defaulted them, and reported "answered: all seven" — including the one that
  decides who may approve a document, which it filled from a git handle. A
  process the tool executing it shortcuts is too long.

  Scope, Boundary and Authority are asked, because none can be defaulted: the
  first two give the abstention gate an edge to be outside of, and the third is
  a governance act, which never gets guessed (decision 21). The other four are
  STATED as defaults in one block — read by both, declines firmly, one `public`
  audience, no sources yet — written only if the owner does not object, and the
  write-back must name which were answered and which were defaulted. Reporting a
  default as an answer is now called out in the skill as the thing not to do.

  **The scaffold README no longer tells you to uncomment something that ships
  uncommented.** 0.0.42 filled in `instance.md`'s `database:` block; the README
  kept instructing the adopter to uncomment it, and named a refusal
  (`instance.md declares no database: block`) they could no longer reach. The
  emitted `AGENTS.md` had already been corrected and the README had not — two
  documents describing one file, and only one of them updated. Vercel is three
  steps ending in the Root Directory fix, `preview` sits beside `build`, and a
  "When something refuses you" table maps every refusal an adopter meets to what
  to do about it.

  **The scaffold README is restructured around what the record is FOR.** It now
  opens on the agent interface — an MCP door that answers with citations and
  declines what the record does not cover — rather than on an architecture
  diagram, because a reader classifies the project in the first fifteen seconds
  and "governed markdown plus a site" puts it in the wrong bucket.

  `ksor calibrate` moves into the main command path, between `refresh` and
  `serve`. It was a parenthetical and a remedy-after-the-fact, which meant the
  README's own three-question test failed at exactly the question it says
  matters. Verified on the five-document starter: calibrate needs an ingested
  corpus but NO running server, produces `vector_floor: 0.609`, and with it
  applied the test passes as written — the paraphrased in-corpus question is
  answered at 0.701 while an adjacent miss abstains at 0.550 and a far-outside
  one at 0.512. The "expect answers, not refusals" note moves from postscript to
  precondition, where it prevents the disappointment instead of explaining it.

  Also: Neon is named for hosted Postgres rather than leaving it abstract (it is
  already what this project's own docs are measured against, and pgvector is on
  its free tier), the deploy section ends at the Root Directory fix, and a
  "When something refuses you" table maps every refusal an adopter meets to the
  one thing to do about it.

## 0.0.44

### Patch Changes

- 2ece135: **A lighter starter, and `refresh` finally says what it does** (issues #173, #171).

  `ksor init` put five of `knowledge/`'s eleven files onto a single concept — 199
  lines of companions against a 40-line document — so the first thing an adopter
  opened was one document wearing four attachments. The flashcards, quiz and
  slides companions are gone; `what-is-a-ksor.summary.md` stays, because it is the
  only companion carrying a governance rule (exactly `type: Summary`, one key), so
  the profile marker is still demonstrated. `knowledge/` goes from 11 files to 8.

  What that costs, stated rather than glossed: the recall, quiz and slides tabs are
  no longer shown by the starter, and an adopter meets those features in the docs
  instead. Nothing about the companion mechanism changed — decision 24 is
  untouched, and the migrate fixture that proves a deck migrates byte-identically
  is frozen from an older tree, so it still covers the case.

  And `pnpm refresh` was a name the constitution never defined, sitting beside
  `pnpm ingest` and `ksor ingest` with nothing saying how the three relate. It has
  a vocabulary entry now, and `docs/ingesting.md` opens with the model: `ksor
build` makes the SITE correct with no database, `ksor ingest` makes the AGENT
  DOOR correct, and `pnpm refresh` runs both. The split between the scaffold's
  script and the underlying verb is deliberate, and now it is written down instead
  of inferred.

## 0.0.43

### Patch Changes

- 9ecfd78: **A document page that reads at a glance, and a dev server that sees new
  documents again.**

  The governance row is two tiers. It was one line carrying 79 characters, of
  which the approver was 32 (41%) and the three labels 19 (24%) — so a producer
  id was the longest thing on the page and the two facts a reader actually scans
  for, what state this is in and whether anyone has checked it, competed with it.
  Now the chips lead with Export beside them, and provenance sits beneath in
  muted weight. Nothing is hidden: decision 21 requires a governance act to name
  its actor and decision 27 requires a non-human approver to be disclosed, so the
  approver moved one line down, not one click away, and every byte of it is still
  in the server-rendered markup an agent parses.

  Export no longer lands in the middle of the row. It and the reading time each
  carried their own `ms-auto`, and on a row narrow enough to wrap they shared a
  line — where two auto margins SPLIT the free space rather than stacking. They
  are one right-hand cluster now.

  **And adding a document to `knowledge/` while `pnpm dev` runs shows it again.**
  This regressed in 0.0.41: `refreshStage` walked the STAGE and skipped anything
  the stage did not already hold, so an arrival — which has no file to walk onto
  — was never written, and the manifest naming what publishes never learned about
  it. Measured: `/docs/<new>/` 404 → 200, sidebar 0 → 1, `llms.txt` 0 → 1;
  0.0.40 served it at 200, so this is a repair rather than a feature. Removals
  still wait for a restart, deliberately — a deleted file leaves fumadocs'
  generated imports pointing at something gone.

  The comment explaining why arrivals were refused was also wrong, and is
  corrected: fumadocs-mdx 15.3.0 DOES regenerate on a write into the
  dot-prefixed stage. Our own function was the blocker.

  Finally, the starter's `knowledge/surfaces/overview.md` was titled `Surfaces`
  inside the Surfaces section, so its breadcrumb read `Surfaces › Surfaces`. It
  is `Overview` now.

- 9ecfd78: **Two fixes on the document page.**

  The governance row put **Export** in the middle of the row with nothing under
  it. Export and the reading time each carried their own `ms-auto`, and on a row
  narrow enough to wrap they landed on the same line — where two auto margins
  SPLIT the free space between them rather than stacking, so Export came to rest
  mid-row instead of at either end. They are now one right-hand cluster and
  travel together at every width.

  And the starter's `knowledge/surfaces/overview.md` was titled `Surfaces` inside
  a section already called Surfaces, so its breadcrumb read `Surfaces › Surfaces`
  and the sidebar showed a Surfaces inside Surfaces. It is titled `Overview` now,
  matching its filename, and the generated section index was regenerated with it.

## 0.0.42

### Patch Changes

- d55097c: **Document what a deploy actually does to your lock.** `vercel.json` builds the
  site with `pnpm build`, which runs `ksor build` first — so the host regenerates
  every `index.md` and `build.lock.json` before building. That has two
  consequences worth knowing, and neither was written down: you can deploy
  without ever running `ksor build` yourself, and the `build.lock.json` in your
  repository is not necessarily the one that shipped.

  Nothing changes in behaviour. The record checker still runs on the deploy, so a
  record that breaks the profile still fails there, and the `build_id` that did
  ship is stamped into the deployed `llms.txt`.

  `docs/deploying.md` now also shows the stricter posture for adopters who want
  the deployed build reviewed before it ships — `buildCommand: "pnpm -C
system/site build"`, which refuses `ksor-lock-missing` or `ksor-lock-stale`
  until someone runs `ksor build` and commits it. That is one line in your own
  `vercel.json`; ksor ships no flag for it.

- abef414: **Fix the release-note lookup, properly this time.** The previous release added
  `releaseNote()` so doc-truth assertions could survive a changeset being folded
  into the changelog. It resolved a consumed note to the NEWEST changelog
  section, which is only correct for the release that consumes it: a note
  consumed in 0.0.41 lives in the 0.0.41 section forever, so by 0.0.42 the lookup
  returned a different release entirely.

  Two failures came out of that, and the second was worse than the bug it
  replaced: presence assertions went red, and a fenced-block scan went VACUOUS —
  passing because the section handed to it contained no code blocks at all.

  `releaseNote()` now returns the whole changelog once a note is consumed, plus
  whether the note is still `pending`. Assertions about the PRESENCE of prose use
  the text (finding it anywhere in the changelog proves it shipped); assertions
  about STRUCTURE gate on `pending`, because "every fenced block must show
  `--approve-by`" is a rule about a note still under review, not one to apply to
  the whole published history.

  Verified in both states and mutation-tested against the released tree: removing
  `--approve-by` or changing the tool-size figure in the changelog turns the
  assertions red.

- bfcf900: **A new record already names its DSN variable.** `instance.md`'s
  `database.dsn_env` shipped commented out, so climbing to the served rung began
  with an edit whose only purpose was to delete two `#` characters — and the
  instruction to do it was repeated in four places, one of which (`.env.example`)
  sat right beside a `KSOR_DB_URL=` line that was NOT commented. A first-time
  reader had to notice that one file names the variable and another defines it,
  and that only one of the two needed uncommenting.

  It is filled in now. Naming an environment variable costs nothing and requires
  no database: `pnpm dev` and `pnpm build` never read it, and the value only has
  to exist when you run `provision`, `refresh` or `serve`. Verified on a real
  scaffold from the published package with the block live and `KSOR_DB_URL`
  unset — `check`, `ksor build` and a full static site build all succeed, and the
  record publishes.

  So the served rung is now: set `KSOR_DB_URL` in `.env`, then `provision`,
  `refresh`, `serve`. The step that was pure ceremony is gone, and `ksor init`'s
  own next-steps, the scaffold's `AGENTS.md`, `.env.example` and
  `docs/ingesting.md` all say the same thing.

## 0.0.41

### Patch Changes

- fe9a0af: Refuse a withdrawal a document attests for itself, and close three record-checker gaps

  - **`ksor-deprecator-unauthorised` no longer accepts `ksor.owner`.** The owner who
    may withdraw a document is the one an `ownership:` rule in
    `.ksor/governance.yaml` resolves — never the `ksor.owner` the document writes
    about itself, which is free text the profile does not even form-check. Before
    this, `ksor.owner: human:mallory` beside `ksor.deprecated.by: human:mallory`
    passed in any record whose policy declares no `ownership:` rule, which is the
    shape both `ksor init` and `ksor migrate` emit. That was asymmetric with
    approval, where a policy naming no matching rule refuses outright.

    **This is a behaviour change for existing records.** If your policy declares no
    `ownership:` rule, a `deprecated` document must now name a
    `takedown_authorities` actor in `ksor.deprecated.by`, or the build refuses.
    Either record the withdrawal by a takedown authority, or add an `ownership:`
    rule naming who owns that path.

  - **A dot-prefixed or backslash-bearing filename under `knowledge/` is refused**
    (`ksor-name-unportable`). `knowledge/.secret.md` used to pass with no refusal
    at all and became a full concept: the MCP door served it while the site's file
    walk, which does not match dot-prefixed names, had no route for it. A backslash
    is a legal character in one Linux filename and the path separator on Windows,
    where the checkout fails outright.

  - **`index.summary.md` is refused (`ksor-attachment-of-index`).** A generated
    index is not a document — no route, no node, no governance — so nothing can
    attach to it, and the orphan rule could not see the problem because the
    generated `index.md` IS committed. The file was accepted, stamped into
    `build.lock.json`'s `companions[]` and into `build_id`, and then published on
    no surface at all, silently. Decision 27 retires the `index.summary.md` row
    from the canonical attachment table with it.

  - **An `.mdx` summary is recognised as an attachment.** The checker kept its own
    list of companion suffixes and it had drifted from the canonical one, so
    `x.summary.mdx` got no orphan check, no `type: Summary` check and none of its
    parent's governance. Both copies are now derived from the one list.

- fe9a0af: A cold start against a sleeping database no longer crash-loops the door, and an unauthenticated public bind says what it is actually handing out.

  **`ksor serve` meant it when it said DEFERRED.** The door is built to come up when the content store is unreachable — it announces `boot checks DEFERRED … NOT READY`, refuses every request, and retries until the database answers, because a serverless Postgres waking from suspend is an ordinary deploy, not an exception. One read sat outside that guard: the viewer list is validated against the ingested policy's registry, which is a row, and reading it threw two statements after the DEFERRED line had already printed. The process exited 3, the platform restarted it, and it did the same thing again — a crash loop for a database that was merely asleep. That read is now one of the boot checks, so deferring defers it too, and until it passes the door holds the one viewer list that is legal for every record: `public`. Nothing is served through it, because an unverified instance refuses every request.

  **A refusal is no longer deferred as though it were an outage.** A stemming mismatch between `instance.md` and the stored `search_tsv`, and a `KSOR_AUDIENCE` naming an audience the policy does not register, are both decided by a row the database ANSWERED with. They were caught by the deferral branch, which reported `content store unreachable` about a store that had just replied and left the door retrying a verdict no retry can change. Both now refuse at boot, where they can be fixed.

  **`KSOR_AUTH=disabled-public` now states what it reaches.** The boot report carried two facts and never their product: one line said the door was unauthenticated, another said `audience public,internal`, and a door serving the internal half of the record to anonymous callers read exactly like one serving only the public half. The auth line now names the restricted tiers by name — and stops saying "the whole record" when only the public audience is being served, so the loud sentence means something when it is true.

- e23e07d: The door's refusals now say the right thing, to the right audience — and a governance refusal no longer names the documents it withdrew.

  **A 503 stopped enumerating withdrawn documents.** Two governance refusals interpolated the `stable_id`s of documents somebody had TAKEN DOWN into the message a caller receives. Under `KSOR_AUTH=disabled-public` that reaches anyone who can reach the port: the strongest governance act in the product, listing what it had removed, to an unauthenticated agent. `GovernanceGateError` now takes those identifiers through a parameter of their own and appends them to the OPERATOR's copy alone — the one that goes to the server's logs, where the fix happens. The 503 keeps the slug, the count and the remedy, which is what a caller could act on anyway. The split is structural rather than a matter of care: there is no route from the identifier parameter to the text that goes on the wire.

  **A refusal stopped misdiagnosing itself as a database outage.** Which errors are the door's own verdicts was written out in two places — the boot path that refuses them and the layer that decides what a caller may read — and the two lists disagreed. So a one-character typo in `KSOR_AUDIENCE`, on a container whose database happened to be asleep when it started, answered every request with `the content store is unavailable (AudienceError)`: a refusal blaming a database that had just replied, while the text naming the typo and the fix reached nobody. It is now one table, with each entry saying which half of its message is public and why, so the two cannot drift apart again. A record's registered audience names are treated like the withdrawn document paths above — the operator's logs get them, a caller does not.

  **`/ready` stopped blaming the network for a refusal.** It collapsed every failure to `false` and answered `content store unreachable` — so a governance violation, about a database that had just replied and that no retry can fix, was reported forever as a network fault, while `POST /mcp` returned the real remedy. One door telling two stories. The probe now names the class of refusal and points at the logs. It deliberately says LESS than the 503 does: `/ready` is unauthenticated on every posture, including the bearer-gated one, so it is the wrong place to repeat a record's governance state.

  **The embedding-space guard is retried instead of switched off.** It is fail-closed on a warm boot, but a cold start caught it, reduced it to a note on `/health`, and never ran it again — so a door that started against a sleeping database and recovered reported itself ready and then compared vectors across two embedding spaces, with the abstention floor calibrated in a space the record no longer used. It now sits with the other boot checks: deferred together, retried together, and a proven mismatch refuses.

  **`/health` says when the boot checks have not passed**, instead of reporting a normal-looking posture while every request is being refused.

  **The abstention line stopped claiming an armed gate on a door that refuses every search.** A `vector_floor` with no digest was measured against a retrieval predicate that has since changed, so the gate treats it as uncalibrated and refuses everything — and the boot report and `/health` both announced `floor 0.631 — below it, this record abstains`. The operator was told the record was abstaining at a measured threshold while it was in fact answering nothing at all, which is this product's own "honest absence, never silent weakness" rule inverted, and it is the first state an adopter meets after upgrading. Both surfaces now take the decision from one function, and say to run `ksor calibrate`.

  **A Host or Origin allowlist is matched the way HTTP compares those values.** `KSOR_ALLOWED_HOSTS=MCP.Acme.com` used to reject every client that resolved it — a total outage from a valid setting, refused with a message that named neither the value nor the variable. Both sides are case-folded now, and both refusals carry their remedy, as does the 413 that used to say only that a body was too large.

- fa49d37: Make the emitted scaffold docs survive being followed literally

  A first-hour walkthrough obeyed the emitted README word for word and hit four
  dead-ends. Each is now fixed where the reader meets it, not only in the deep
  doc that already got it right.

  - **The publish recipe was incomplete and refused.** "`status: stable` with a
    `ksor.approval`" is two thirds of it — `ksor-stable-ungenerated` also demands
    `generated: { by, at }`, which appeared nowhere in the README. It now shows
    the whole frontmatter shape, says which half is provenance (any producer) and
    which is authority (an actor `.ksor/governance.yaml` lists), and names the
    ordering rule between the two `at`s.
  - **"The ordered path is:" was not the order.** The command block ran before
    the instruction to uncomment `database:` in `instance.md`, which sat thirteen
    lines below it, so step two died with `instance.md declares no database:
block`. The emitted `AGENTS.md` had the right order all along; the README now
    matches it — config, environment, then commands.
  - **The Docker smoke test refused with the `.env` the README told you to
    write.** A container sets `$PORT`, so the door binds `0.0.0.0` and
    `KSOR_AUTH=disabled-local` correctly refuses. The refusal is right and stays;
    the printed command now carries `-e KSOR_AUTH=disabled-public` and says why,
    on the command rather than in `.env` so an ordinary `ksor serve` keeps its
    loopback posture. Fixed in the README, `AGENTS.md`, the `Dockerfile` header,
    `.env.example` and `docs/deploying.md`, which now all print one recipe.
  - **`ksor` reads `.env`, but a refusal says "export that variable".** Both are
    true and a newcomer met both; the README now says so in one sentence.

  Two smaller truths: `pnpm refresh` builds before it ingests, and both places
  that describe it said otherwise; and `instance.md`'s own description of the
  starter claimed "types, statuses, audiences, a folder and a companion summary"
  where the starter is in fact five approved documents, all one type, one status
  and one audience, three of them in a folder, with one carrying all four study
  attachments.

  New: a short **note on `audit`**. A fresh `npm install` ends with high-severity
  advisories against the pinned `next` and an invitation to `npm audit fix
--force`, which would break the pin — and nothing said not to. The note says
  don't let an audit tool raise the pin, explains the one structural reason the
  report reads worse than it is (the site is a static export, so no framework
  server, middleware, server actions, rewrites or image optimizer ever run), and
  names what that argument does NOT cover: the build toolchain, and any served
  route added later.

- 8a384be: Four places where the product was wrong about itself.

  **A governance key one level from where the profile reads it is refused by
  name** (`ksor-key-misplaced`). `effective_from:` at a concept's top level is
  spelled correctly, so no near-miss net could see it and OKF §11 preserved it —
  a document embargoed to 2099 built clean, exited 0 and published the same day.
  The mirror, `ksor.stale_after`, was refused as a key of a closed block and told
  the author to "remove `stale_after:`"; following that remedy on a document
  already past that instant flipped it from withheld to published. Both
  directions are now named, and no remedy in the profile deletes a governance
  value — an unrecognised key under `ksor:` is moved to the top level, where §11
  preserves it.

  **Every surface now says whose claim the trust tier is.** `verified[].by` is
  checked for its actor form and nothing else: the Governance Policy has no
  verification family, so any well-formed `human:` actor promotes a document to
  `human-reviewed` — while `ksor.approval.by` is refused outright when no rule
  matches it. That asymmetry is deliberate (record spec §2.3) and unchanged; what
  changed is that the `search` and `read` tool descriptions, the emitted
  `.env.example` and the emitted `AGENTS.md` said or implied otherwise. At
  `KSOR_MIN_TRUST_TIER=human-reviewed` the only document a record served was the
  one asserting its own review. The tool definitions grow 520 chars for it
  (16,214 → 16,734 as transmitted, ~4,054 → ~4,184 always-resident tokens);
  `packages/ksor/docs/tool-surface.md` has the re-measured table.

  **`ksor build` says what its own snapshot will stop being true.** Machine-surface
  admission is decided once, at the build's `as_of`, and written into files that
  cannot re-decide themselves — so a document whose `stale_after` passes after a
  build keeps appearing in `llms.txt` and its markdown twin while `ksor serve`
  already refuses it. The build now names the documents it held back and why, and
  the next instant at which this goes out of date. It is a notice and not a
  refusal: a document past its review date is a governed state, and a build that
  refused it would make deleting the `stale_after` the fastest way to green. The
  emitted `AGENTS.md` stated the exclusion unconditionally and now states the
  rebuild obligation instead; the emitted `README.md` carries it too.

  **Three `ksor takedown` remedies name `--actor`.** Decision 21 requires it on
  every mode that writes the ledger, so the printed fix lines exited 1 on
  `ksor-takedown-unattributed` when pasted.

- fe9a0af: Ingest now checks the whole lock, refuses an unaccountable takedown before it spends anything, and never serves a tier nobody asked for

  **`ksor ingest` reads every digest `ksor build` records, not just the document
  hashes.** The lock covers the instance, the governance policy, the takedown
  ledger, the companions, the assets and the generated indexes — and ingest was
  comparing only `documents[]`. So a governance file edited _after_ the build that
  checked it went straight into a published generation: delete a denial's four
  lines from `.ksor/takedowns.yaml`, ingest, and the MCP door published a document
  the website still withdrew. Editing any of them without rebuilding now refuses
  `ksor-lock-stale` and names the file. Re-run `ksor build`, commit both, ingest.

  **A denial nothing in the repository accounts for now stops ingest where it
  happens.** A record upgraded from schema 2.4 carries denylist rows with no
  ledger entry, and `ksor serve` refuses to boot on exactly that. Ingest used to
  say nothing, build and embed a whole generation, and only then refuse — leaving
  an un-activated generation behind. It now refuses at the ledger step, before a
  generation is allocated, with the same `ksor-takedown-unledgered` slug and the
  remedy that resolves it (`ksor migrate --write`, commit, ingest).

  **A read that names no audience is served nothing.** The kernel's read path bound
  "the whole record" as its default viewer, which meant the SQL rule that denies an
  unstated viewer could never fire. The default is gone: callers entitled to the
  whole record say so, and everything else fails closed. An audience identifier
  containing the list separator, or spelled `*`, is refused
  (`ksor-audience-identifier-invalid`) rather than silently read as a different set
  of audiences.

  **A withdrawn-then-deleted document no longer bricks the record.** Deleting a
  document after withdrawing it is the sequence the record spec sanctions, and
  `ksor migrate --write` produces it on its own for any denial whose document is
  already gone. The denylist row carried no record of that, so the boot check read
  "no document with this id" as an orphaned denial and refused `ksor ingest` and
  `ksor serve` permanently — while `ksor build` and the website stayed green. The
  remedy it printed could not clear it: `ksor takedown --removed` records what
  happened to the FILE and moves no row, so the only escape was to un-withdraw the
  document. The row now carries `expected`, and a document the record itself
  documents as removed is no longer read as an orphan. It stays withdrawn: the
  serving predicate never reads that column.

  **A migrated database is now the same database as a fresh one.** Nothing compared
  the two; a schema-parity check across columns, constraints, indexes, policies,
  privileges and triggers found the profile's two CHECK constraints carrying
  different names on each side, and `schema.sql` now names them as the migration
  does.

  Also: an empty `sources:` list is the same value as no `sources:` list
  everywhere, so it no longer changes a generation's provenance digest depending
  on which side of a round trip it is read from.

  **A malformed argument no longer reports itself as an outage.** A value Postgres
  cannot represent — a NUL byte in a slug or a query is the reachable case — made
  every read fail with "content store temporarily unavailable". The condition is
  deterministic and harmless to the connection, but the tool guidance this door
  hands every agent says `unavailable` means retry later and never conclude the
  thing is absent, so a caller with one bad argument was told to retry forever
  while the store answered everyone else. SQLSTATE class 22 is now reported as
  what it is: the request was rejected as written, the store is healthy, and
  retrying it unchanged will not help. Connection failures are unchanged.

- 0a0b048: Three governance rules that judged the wrong thing.

  **A takedown ledger no longer breaks on a personnel change.** Every entry was checked against the takedown authorities named in `.ksor/governance.yaml` _today_, so removing someone who had left the organisation refused every entry they had ever written — the record stopped building for a personnel change, not a governance one — and the obvious remedy, deleting those entries, is `ksor-ledger-shrank`. The only escape was to go on naming a departed person as an authority, which is a lie the policy would then carry. Authority is now checked where the act happens: an entry this record has not yet accepted. The committed `build.lock.json` is the only evidence of acceptance, because it is written by a build that got past this very check; git history proves only that a line was committed, which anyone with write access can do, so a hand-appended entry in a pull request is still refused exactly as before. Acceptance is of TEXT, so an entry retargeted under an accepted id is judged again.

  **A Governance Policy path that can never match is refused instead of silently ignored.** Scope paths are bundle-relative directory prefixes, and a concept's id carries neither its `.md` nor the `knowledge/` prefix — so `paths: ["hr/handbook.md"]` and `paths: ["knowledge/hr/"]`, the two forms a hand reaches for first, matched nothing at all. The tightly scoped rule simply never applied and approval or ownership resolution fell through to whatever broader rule was left, with nothing red on any surface. Both are now `ksor-policy-invalid`, naming the path and the one it would have to be. A bare `/` still means the whole record.

  **A legal hold over the whole record is refused instead of half-performed.** A ledger entry naming the record root (`stable_id: knowledge/#section`, `scope: subtree`) was accepted, and only one of the two surfaces could carry it out. The site reads the empty prefix as everything, so the website went dark; the serving side walks `parent_id` from the node the denylist row names, and no node exists for the record root — top-level sections have no parent — so its seed was empty and the MCP door went on serving every document. Measured on a live 187-document record: the website dark, the door answering in full. The website going dark then reads as confirmation that a hold is in place over a door that never stopped. It is now `ksor-takedown-dangling`, naming the form that works — one subtree entry per top-level section — and it is raised on the in-force set rather than at parse time, so the entry stays readable and `ksor takedown --revoke` remains the way out.

- fe9a0af: **The link checker no longer goes blind on two ordinary markdown shapes.** Every link rule — `ksor-link-widens`, `ksor-link-dead`, `ksor-link-escapes` — and the footnote rule read the document with its code stripped out, so a shape the stripper mistook for code took its links out of reach of all four at once, with nothing red. A public document could point at a restricted one and `ksor build` exit 0.

  **A list item's continuation paragraph is prose, not code.** CommonMark requires four spaces of indent there, and the stripper read any four-space line as an indented code block — so the link in

  ```
  - A bullet.

      See [the plan](/secret/plan.md) for detail.
  ```

  was invisible to the checker while the site published it as a live link. Indentation is now measured from the container's content column, the way CommonMark measures it: code inside an item starts four columns past the ITEM, and a fenced sample inside an item is still a fence. A sub-bullet at the same indent was always seen, which is why this hid.

  **A fence that never closes now hides only itself.** The fence state survived to end of input, so one stray ` ``` ` in prose silenced every link and footnote after it — half a document unjudged, with no signal. An unclosed fence is a stray backtick run, not a block, and the rest of the document is judged again.

  Both directions were checked: no document in the shipped starter or the example corpus changes shape under the new stripper, and everything that was really code — indented blocks, fenced blocks inside list items, code spans, thematic breaks — is still stripped.

- 4d67703: Make six CLI messages answer the question the reader is actually holding

  Every one of these came out of a first-hour walkthrough that followed the
  printed output literally.

  - **`ksor calibrate`'s paste block is now a block you can paste.** It ended with
    "Paste into instance.md:" and then `vector_floor:` / `floor_digest:` at the
    top level — where neither key lives. Pasted verbatim, the file was refused
    (`ksor-instance-format`), so nothing shipped, but the one instruction the
    report gives was wrong. It now prints the `retrieval:` block those keys belong
    in, at column 0, because two spaces of terminal indentation lands inside a
    frontmatter as a nested mapping and `yaml` refuses it outright. The
    non-separable verdict's fail-closed block moved to the end of the report for
    the same reason, and both are asserted by pasting them into a real instance.md
    and parsing it.

  - **A misplaced instance key now NAMES the block it belongs to.** The refusal
    said "nest it under the block it belongs to" without ever saying which block
    — and the file already holds the map that answers it. `vector_floor` and
    `floor_digest` are told they are keys of `retrieval:`, and the remedy prints
    the block with the values the file already carries, so the fix moves the
    setting rather than dropping it.

  - **A port already held now names its remedy.** `ksor serve` printed its boot
    lines and then a bare Node errno — `error: listen EADDRINUSE` and the address,
    with no `fix:` and no mention of `KSOR_MCP_PORT`. It now says what is wrong,
    why, how to find the process holding the port, and how to serve on another
    one; `EACCES` and `EADDRNOTAVAIL` get their own remedies, because the next
    command differs. The exit code is unchanged: a bind failure
    is the environment (3), never a refusal.

  - **`ksor serve --help` and `ksor init --help` have pages.** Both fell through to
    the generic verb list while every other verb answered for itself. `serve`'s
    page names its one flag and the environment variables a first run needs —
    including the one a busy port sends you looking for.

  - **Every write-plane refusal opens with `error: <slug>`.** `ksor build` printed
    a machine-readable slug alone on the first stderr line and `ksor schema` printed
    none at all, for the same malformed file — so an agent reading `stderr` got a
    different shape per verb. `schema`, `ingest`, `calibrate`, `grant`, `takedown`
    and `gc` now keep the contract the docs already stated, naming the RECORD's own
    slug where a record file is what refused. A bad `--dim` is `bad-args` rather
    than a slug about an instance it never read.

  - **A refusal states its reason once.** `ksor serve`, `ingest`, `schema`,
    `calibrate`, `gc` and `grant` printed the same sentence twice — inline on the
    `error:` line and again under `why:`.

  - **`ksor build` says what it could not record about provenance.** On a record
    with no commit it said only `(dirty)` — a word no shipped document defines —
    and wrote `"source_commit": null` in silence, while `ksor ingest` explained the
    identical state in full. Build now prints the same sentences ingest does, from
    one shared module: the commit it published from when there is one, and what is
    missing and how to fix it when there is not. It still does not refuse — a
    provenance-less build is legitimate, and `--strict` is there for anyone who
    wants it refused.

- 8a384be: **`ksor migrate` no longer widens an audience, brick a record, or emit a tree
  it then refuses.** Three defects found by walking the upgrade path end to end
  against a real database and a real door.

  - **A re-run republished an internal record as public.** Migrate writes
    `instance.md` first and deletes the `audiences:` model from it, so a record
    that reached a second run with pre-profile documents still on it had nothing
    to expand them against — and the fallback for "no model" is `[public]`. The
    route needed no crash: `ksor migrate --write`, `git restore knowledge/`,
    `ksor migrate --write --approve-by human:x` left a `default_visibility:
internal` document readable by every unauthenticated caller, at exit 0 with a
    clean diff. Losing the model now REFUSES, naming the document and both ways
    out; and `instance.md` is written LAST, so an interrupted run leaves the
    model readable and is simply re-runnable.
  - **A record that had ever withdrawn a section could not be published after
    upgrading.** A denial anchored on `<dir>/index.md` follows the prose migrate
    moves to `<dir>/overview.md`, and the `takedown_denylist` row it came from
    still named the old path — accounted for by nothing, so `ksor ingest` refused
    `ksor-takedown-unledgered` and `ksor serve` refused to boot. The remedy they
    both print, `ksor migrate --write`, answered "nothing to migrate": the
    transcription ran only into a record with no ledger at all. The stock
    scaffold ships `knowledge/surfaces/index.md`, so the trigger was in every
    adopter's tree. Migrate now records the row as it stands alongside the
    repointed hold, and APPENDS to an existing ledger any row nothing accounts
    for — which rescues a record already in that state. An existing entry is
    still never rewritten, and an existing ledger is never regenerated.
  - **Migrate wrote a supersession pointer `ksor build` refuses.** A
    `superseded_by:` resolving to no concept — commonly a bare name resolved
    against the document's own folder — was written out, followed by "Run
    `ksor build`", which refused it as `ksor-supersession-strands`. It is now
    refused up front, naming what was written, what it resolved to, and the
    concept that is actually there under that name.

- 9e50b4b: `ksor build` runs (`specs/ksor/build/spec.md`): it generates every `knowledge/**/index.md` in memory, runs the record checker, and on green writes the indexes whose bytes changed plus `build.lock.json` — `build_id` over everything a projection reads, `source_commit` from the last commit touching an input, `dirty`, `as_of` (`--as-of` pins it), the canonical viewers and each document's admitted set. A refusal exits 1 with the slug first and writes nothing; `--strict` refuses an uncommitted input; the takedown ledger is checked for deleted entries against every version git has seen and the committed lock, and a shallow clone is refused unless `--allow-unverifiable-ledger`. The scaffold's `check.mjs` is now GENERATED from the record module at package-build time — one rule set with `ksor build`, bundled with its YAML parser (ISC notice in the banner), read-only, refusing a stale index — and the hygiene rules the hand-written checker carried (portable names, file types, PNG integrity, dead and escaping links, the instance's closed key set) live in the record module with stable slugs. The starter is rewritten in the KSoR Profile: `instance.md` format 2, `.ksor/governance.yaml`, `type: Document` concepts, generated indexes; every manager's `build` script is `ksor build` followed by the site build, and `export-denylist` is removed. A `ksor.superseded_by` pointer on a concept that is not `deprecated` is refused (`ksor-supersession-strands`), as the hand-written checker did.
- b3f1db6: The MCP door now says what the record knows about a passage, and lets a caller ask for better.

  `search` accepts `min_trust_tier` — `unverified`, `machine-confirmed` or `human-reviewed` — so an agent can ask to be answered only from documents someone has reviewed. `KSOR_MIN_TRUST_TIER` sets the deployment's own floor, and the two compose by one rule: the higher of the pair. Configuration TIGHTENS and a request never loosens, so a door configured for `human-reviewed` cannot be talked down by an argument. The floor is bound into the retrieval arms, never applied to the hits afterwards — a floor enforced after ranking has already let a lower-tier passage decide what the answer was.

  The default and the enforcement live in the handler, not in `system/gateways/content.ts`. A registration scaffolded before this release keeps working exactly as it did; the door NOTICES the missing parameter at boot, names the tool by the name you gave it and prints the line to paste, and then opens. Nothing is weakened by its absence — only the capability is gone.

  **Every hit now carries `governance`**: the document's `status`, its `trust_tier`, the latest `verified` act (or null when nobody has reviewed it — an honest state of a governed record, not a defect), `effective_from`, `stale_after`, and `approval` with `checked: "policy"`. That last word is deliberate and is the whole point of the key: the approver was checked against your Governance Policy's authority list and NOT against change control, which lands in phase B. An envelope that said only "approval" would let an agent report more verification than happened.

  **`read` carries the same `governance` block**, from the same stored columns, taken from the record's live row rather than a pinned one — a snapshot keeps a citation resolving to the same bytes, it does not freeze what the record has since decided about them. It sits beside the frontmatter on purpose: the frontmatter is what the author DECLARED and is untrusted corpus text, `governance` is what the record checked and stored, and the tool description says which is which.

  **`read` returns the concept's frontmatter**, byte-exact as its author wrote it — comments and keys ksor has never heard of included. Not a re-serialisation: the profile preserves unknown keys, so a re-rendered block would be a different document wearing the record's name. Schema 2.5 gains `sources.frontmatter` for it, additively; existing records pick it up at their next `ksor ingest`.

  **Every serving act's audit row records its scope** — the viewer list, the trust floor that applied, whether it abstained, how many results came back, and the generation. Never the passages and never the query: a trail that accumulated content would be a second copy of your record with no audience predicate over it and no takedown seam bound to it.

  The frontmatter is a second untrusted channel, so the in-band injection advisory now reads BOTH: a `paste this into your agent` line in a frontmatter value raises `content_advisory` exactly as the same line in the prose does. It did not before, and a programmatic consumer re-reads the payload each turn and never the tool description.

  A `min_trust_tier` your record cannot recognise is now REFUSED (`ksor-trust-floor-unknown`) instead of being read as "no floor". It used to resolve to -1 and serve the whole record — the opposite of what the same rule does for `KSOR_MIN_TRUST_TIER`, which has always refused a value it does not know rather than falling back.

  Costs, recorded rather than argued away: the served `tools` array is now 16,734 characters — ~4,184 always-resident tokens, against the ~2,990 decision 23 recorded, with `search` growing 5,383 → 7,932 and `read` 3,396 → 5,466. The three definitions' own JSON sums to 16,730 of that; the array adds the brackets and the separators. Each `search` hit — and each `read` reply — carries 262 characters more where the document has a verification and an approval, 133 where a level-0 record has neither. `packages/ksor/docs/tool-surface.md` has the re-measured table and says which of its numbers are exact and which are derived.

- d1bc2a2: Wire the kernel onto the record module: `ksor ingest` reads every document through the ONE profile reader instead of its own frontmatter scanner, and schema 2.5 stores what it finds. `content_nodes.visibility` becomes `audience TEXT[]` (GIN-indexed, ranked tiers mapped to a one-element list and then dropped); the authored status is mapped and CHECKed onto `draft | stable | deprecated`; `sources`, `verified`, `generated`, `approval` and `deprecated` land as JSONB beside `effective_from`, `stale_after` and a derived `trust_tier`; each ingestion run records the `build_id` it published, the Governance Policy as a row with its digest, and the takedown ledger's id set; and `takedown_denylist` gains the ledger entry that wrote each row and the one that revoked it. Existing databases walk `2.4 -> 2.5` through `schema/migrations/`. A generation built before 2.5 refuses to serve until it is re-ingested, because the migration can only narrow a ranked tier and answering a viewer from a half-mapped row is not a thing a system of record may do.

  `ksor ingest` now refuses the whole record before it writes anything: the record checker, then `build.lock.json` (`ksor-lock-missing` / `ksor-lock-stale` when the tree has moved since the build), then the ledger — and it applies ledger entries in file order, so a takedown reaches the database even when no document byte changed. `instance.md` is `format: 2`: `audiences:` and `default_visibility:` move to `.ksor/governance.yaml` and are refused with the migration hint, `title`, `description` and `toolchain` arrive. Two live defects go with it — a `CHUNK_POLICY` bump no longer reports "unchanged" against a generation chunked under the old policy, and a revoked denial no longer keeps denying.

  `ksor takedown` is rewritten ledger-first (`specs/ksor/record/spec.md` §5): the act is appended to the committed, append-only `.ksor/takedowns.yaml` and only then written as the denylist row, so a record with no database gets takedown for the first time and the site reads denials from the repository. `--revoke <entry id>` lifts a denial by adding an entry rather than deleting a line, `--removed` records that a denied document was deleted, `--file-only` writes the entry alone, and `--apply` writes every unapplied entry's row under its own recorded actor. The verb refuses an actor `takedown_authorities` does not name before any DSN is resolved. **Breaking:** `ksor takedown --export`, `.ksor-denylist.json` and the scaffold's `export-denylist` step are removed.

- 38ac704: `ksor migrate` rewrites a record written before the KSoR Profile into it, and
  prints a unified diff before it writes anything. `visibility` expands UPWARD
  through the old ordered audience model (`internal` under
  `[public, internal, board]` becomes `[internal, board]` — a one-element list
  would silently drop the document from the board build); `provenance` strings
  become `sources` with the string as the scope descriptor; `effective` widens to
  midnight UTC; `review` becomes `draft` and `superseded` becomes `deprecated`
  with an attributed `ksor.deprecated` and a `ksor.superseded_by` resolved to a
  concept id; `approved` becomes `draft` unless `--approve-by` names the human
  performing the approval; the instance becomes format 2 with its authority moved
  into a written `.ksor/governance.yaml`; a reserved `index.md`/`README.md`
  carrying prose moves to `overview.md`; every summary companion gains
  `type: Summary`; and every denylist row in the database becomes a committed
  ledger entry. It never authors knowledge: a title, a description, a
  `generated.at` or a takedown actor it cannot derive is refused by name
  (`ksor-migrate-underivable`). `--write-site` offers the site's byte-copied rule
  modules in the same diff. The adopter's frontmatter comments survive — the
  commented-out `database:` block in `instance.md` is their runbook.

  A top-level `superseded_by:` is now refused as a pre-profile key rather than
  preserved as an unknown one: the profile reads `ksor.superseded_by`, so a
  top-level one announced a successor no surface showed.

  The scaffold's skills are rewritten for the profile — the intake interview
  gains a seventh question (who may approve, who may withdraw) and writes
  `.ksor/governance.yaml`; `add-sources` emits profile frontmatter with `sources`
  and footnote citations and never records an approval; `make-summary` emits
  `type: Summary`. `.env.example` documents `KSOR_AUDIENCE` as the comma list of
  audiences it is, always including `public`.

- 466d573: **The record is an OKF bundle now.** `knowledge/` is Markdown in the KSoR
  Profile of the Open Knowledge Format — the shape the README has described for
  weeks and the code did not hold. One rule set reads it: the CLI, the site and
  the MCP door all check the same frontmatter through the same module, so a
  document that publishes on one surface can no longer be refused on another.

  It stays a `patch` — the record format is still finding its shape and the
  0.0.x band says so — but it changes surfaces adopters depend on, so read the
  upgrade path below before taking it. In one place, what moves:

  - **A document's frontmatter.** `type`, `title`, `description`, `status`
    (`draft | stable | deprecated`) and `ksor.audience` (a list) are required;
    `stable` additionally carries `generated` and an `ksor.approval` by an actor
    the Governance Policy authorises. `visibility`, `owner`, `provenance`,
    `effective`, `superseded` and `sor_id` are refused **by name**, with the
    migration named in the refusal.
  - **Two files beside the bundle.** `.ksor/governance.yaml` says who may
    approve and who may take down; `.ksor/takedowns.yaml` is the committed,
    append-only takedown ledger, and it appears the first time something is
    withdrawn — no file is the honest way to say nothing ever has been. Both
    are tracked, not scratch: `.gitignore` ignores `.ksor/*` and un-ignores
    these two by name.
  - **`instance.md` is `format: 2`** — `audiences:` and `default_visibility:`
    move into the policy; `title`, `description` and `toolchain:` arrive.
  - **Two new verbs.** `ksor build` (database-free: generate the indexes, check
    the record, write `build.lock.json`) and `ksor migrate` (rewrite a
    pre-profile record, printing a diff before it writes anything).
  - **Removed:** `ksor takedown --export`, `.ksor-denylist.json` and the
    scaffold's `export-denylist` step. The site reads denials from the ledger,
    so a record with no database has takedown for the first time.

  **To upgrade an existing record**, in order:

  ```sh
  pnpm add -D @panaversity/ksor@latest
  ksor migrate --actor human:<you>  # prints the diff, writes nothing
  ksor migrate --write --actor human:<you> --approve-by human:<you>
  ksor build
  # a served record, after committing the migration:
  ksor schema --instance instance.md --apply   # 2.4 -> 2.5
  ksor ingest --instance instance.md --flip
  ```

  `ksor migrate` never authors knowledge: a document whose `description` it
  cannot derive is refused by name rather than filled in, and an `approved`
  document becomes a `draft` unless `--approve-by` names the human doing the
  approving. Both are the same rule — a governance act names the actor who
  performed it, and the tool does not guess one.

  **That is why `--approve-by` is in the block above, and what happens without
  it.** Every `approved` document becomes a `draft`, and a draft reaches no
  machine surface at all: the next `ksor build` reports `0 admitted to a machine
surface`, and `llms.txt`, the `/md/` twins and the MCP door publish nothing
  until a human approves. Where one document supersedes another it does not even
  get that far — `ksor build` refuses with `ksor-supersession-strands`, because
  the successor migrate just demoted is a draft and a reader sent to it would be
  stranded. Pass `--approve-by human:<you>` when you are the person
  `.ksor/governance.yaml` authorises to approve; otherwise expect to approve the
  record document by document before it publishes again.

  **Two things will refuse until you act, deliberately.** A generation ingested
  before schema 2.5 will not serve until it is re-ingested, because the
  migration can only narrow a ranked tier and half a governance row is not
  something a system of record answers from. And a calibrated
  `retrieval.vector_floor` measured before this release carries no
  `floor_digest`, so the door REFUSES every `search`, `read` and `outline`
  (`ksor-uncalibrated`; the search envelope's `gate` reads `"uncalibrated"`
  rather than `"off"`) until `ksor calibrate` re-measures it through the
  predicate that now applies. It refuses rather than abstains, deliberately: an
  abstention would tell the caller this record does not cover the question, when
  what is true is that the gate cannot be trusted to decide. A threshold carried
  across a predicate change stays plausible and stops meaning what it said.

- b14a82c: Land the record module (`packages/content/src/record/`) that the OKF-native record (`specs/ksor/record/spec.md`) will be checked and built by: a frontmatter splitter that reads real YAML and refuses anything else as `ksor-frontmatter-invalid`; the concept profile as a zod schema with one refusal slug per rule; the Governance Policy reader with KSP 4.2.5 scope resolution; the takedown ledger reader (unauthorised actor, dangling, re-added, shrank); the OKF §8 index generator; footnote and link reading in both OKF link forms; the overlap, widening and lifecycle rules with their decision tables; and `checkRecord`, one rule set over an in-memory tree. The CLI now carries `yaml` (2.9.0, ISC, zero transitive dependencies; decision 26) as a runtime dependency, because a profile-shaped document's `ksor:` block and the `.ksor/*.yaml` control files are real YAML that no line scanner can read. Everything else in this release reads the record through this one module — `ksor build`, `ksor ingest`, the MCP door, the site's staging and the emitted `pnpm check` — which is what makes one rule set one rule set.
- d4061a5: A second review pass over the OKF-native record, and two of its findings were holes in the fixes themselves.

  **An asset is judged by every directory above it, not only the one it sits in.** A public document linking `/secret/chart.svg` was refused; the same document linking `/secret/img/chart.svg` was not, because `secret/img/` holds no concept of its own and the rule read that as a shared `images/` folder. `ksor build` exited 0 and the public site carried the restricted directory's name and the asset's bytes. The check now climbs to the nearest ancestor that holds a concept, which leaves genuine shared folders alone and closes the nesting.

  **A `.DS_Store` no longer makes the site unbuildable.** The stage walked `knowledge/` itself to decide what an asset is, while `build.lock.json` was written from the record loader — which skips OS junk and never reads a symlink as bytes. So the first time Finder touched `knowledge/`, every local `pnpm build` refused `ksor-lock-stale` naming a file `ksor build` cannot put in the lock, and the remedy that refusal prescribes wrote the identical lock. A symlinked asset hit the same disagreement and was reported as a stale lock rather than as the symlink it is. The stage now takes its assets from the record it already loaded, so there is one answer to what an asset is.

  **The site checks the takedown ledger against git history, like the shipped checker does.** The lock is hand-editable and travels in the same change as the ledger, so on its own it cannot see an entry deleted: recomputing `ledger_sha256` and emptying `ledger_entries` made the two agree about a denial that was gone, and the denied document was published again. Outside a repository, or on a shallow clone, the build says so and falls back to the lock rather than refusing every shallow checkout.

  **The all-draft build is tested by something that runs Next.** The fix for the route that used to throw when a build publishes no page was covered only by a staging test that never reaches the route module. The scaffold end-to-end suite now builds the starter exactly as `ksor init` emits it, before touching its policy, and asserts that not one draft reaches a page or `llms.txt`.

- d39e7c6: Close the review findings raised against the OKF-native record before it ships, most of them fail-open reads that no test would have caught.

  **Governance objects are closed, not stripped.** The Governance Policy is the root of authority, and zod's default is to drop an unknown key — so `scope: { path: [...] }`, one letter wrong, left an empty scope that matches every concept and made a drafts-only rule the record's approval fallback. Every object in `.ksor/governance.yaml` now refuses an unknown key by name, with the nearest allowed one. The `ksor:` block is ksor's own namespace, not OKF's, and is closed the same way: `ksor.effective-from` (one hyphen) published an embargoed policy four weeks early with nothing red. A top-level key one edit from a profile key is refused too — a mistyped `stale_after` serves an expired document forever — while the concept's own top level stays open, as OKF §11 requires. And the keys the build writes into a document's twin (`trust_tier`, `build_id`, `source_commit`, `ksor_version`, `dirty`) are now refused on a concept: declaring one published it twice and made the build stamp forgeable.

  **The site's lock covers the files that hold the governance.** Freshness was checked against documents and companions only, so deleting a denial's four lines from the ledger republished the denied document, and editing `instance.md` published a title nothing checked — exit 0, no slug. The three control files are hashed now, the lock's ledger entry digests are passed to the checker (so an entry retargeted in place refuses at the site build too), and assets join the lock, because the site publishes their bytes and a tampered diagram passed unnoticed. Three more fail-open reads in the same schema: an `as_of` that does not parse made every lifecycle comparison false and published a policy effective in 2030 as current; a `ksor_version` the site cannot compare slipped past the outdated gate and was stamped verbatim into every machine artefact; and a lock built with drafts SHOWN published every draft on a plain build.

  **Refusals where the tool used to guess.** `ksor migrate` refuses `sor_id` (dropping it changes a document's stable id and breaks every takedown keyed on the old one), an escaping or stranded `superseded_by` (it used to write `ksor.superseded_by: null`, frontmatter the checker then rejects), a denylist row whose `scope` it cannot read, and a subtree row naming a document rather than a container. It deletes `id:` and `name:`, which only restated the path — leaving them made migrate an infinite loop that re-minted an approval instant on every run. A link from a public concept to an asset inside a restricted directory is `ksor-link-widens`: it used to stage that directory's name and bytes into the public build.

  **The shipped gate can see a deleted takedown.** The emitted checker's only baseline was the committed lock, which travels in the same pull request: emptying both together printed "ok". It reads git history itself now, keeps the lock as a second baseline, and refuses a lock it cannot parse instead of silently holding nothing.

  **A build that admits nothing still builds.** The docs route threw "the record has no documents" whenever a build published no page — the state a record of drafts reaches, which `ksor migrate` produces on its own whenever `--approve-by` is not passed. It renders the record it has instead of failing the build. The scaffold's own documentation is corrected in the same change: `ksor takedown --export` and `.ksor-denylist.json` are gone, the site honours a takedown from the committed ledger with no database access, and the dead denylist reader no longer ships in every adopter's repo.

- 48929da: **Review fixes across the record, the deny seam and the site's machine
  surfaces.** Ten defects found by an independent review of the OKF-native work,
  each reproduced before it was fixed.

  Governance:

  - A takedown ledger holding TWO denials of one document, with only the newer
    revoked, disagreed with itself: the site kept the document withdrawn and the
    MCP door served it. The denylist projection now takes its live set from the
    same function the site reads, and `ksor takedown --list` no longer reports a
    revoked row as denied.
  - `ksor-link-widens` judged only links that resolved to a concept or an asset.
    A public document could link a restricted document's `.summary.md`, a
    restricted directory, or that directory's generated index — publishing the
    restricted id and the directory name into the public page, its `/md/` twin
    and `llms-full.txt`. Every target kind is judged now.
  - A section whose every document had been taken down stayed in the door's
    `outline` with `child_count: 0`, while the site pruned the folder entirely.
    Denial binds inside the admission walk, so both surfaces refuse it. **This
    moves the serving predicate's digest**, so a record with a calibrated
    `vector_floor` refuses every `search`, `read` and `outline` with
    `ksor-uncalibrated` until `ksor calibrate` is re-run. The door still boots,
    and its report says so; the candidate set search sees is unchanged, but the
    tripwire cannot know that.

  Reading order — the site and the door disagreed three ways, and now share one
  rule asserted row by row: folders interleave with documents instead of
  following them, a folder sorts where its first document sorts however deep that
  document is, and ties break on the file name on both surfaces. The starter's
  `surfaces/` documents are renumbered so a fresh `ksor init` publishes exactly
  the order it did before.

  The site's machine surfaces:

  - `![chart](/chart.png)` — the bundle-absolute image form the record checker
    accepts — broke `pnpm build` with "Module not found" against a `public/`
    directory the scaffold does not have. Images resolve against the stage now,
    like every other bundle-absolute link.
  - The `/md/` twin and `llms-full.txt` were built from fumadocs' processed
    markdown, so an image reached them as `<img src="__img0" />` while the door
    returned the record's own bytes. Both now republish the staged source.
  - An image referenced only from a document's `.summary.md` was validated by the
    checker, hashed into `build_id`, and never copied into the stage — killing
    the export.

  Operator surface: `ksor takedown --list` and `--ledger` work on a record with
  no database, which is the rung `ksor init` emits — `--revoke` takes an id only
  `--ledger` prints, so that workflow could not be completed at all. One bad
  document no longer produces a cascade of `ksor-index-stale` refusals whose
  prescribed fix cannot be run. And the takedown ledger's header no longer names
  `pnpm` in npm and bun scaffolds.

- da1e5b6: Serving now reads the whole governance row, not just its audience half. Schema 2.5 stores the profile's lifecycle and trust on every node and, until now, only `audience` was consulted — so the MCP door answered from drafts, from documents before their `effective_from`, from documents past their `stale_after` and from deprecated ones, all four of which record spec §2.5 says a machine surface never publishes and all four of which the site's own build already refused. `lib/lifecycle.ts` and `lib/trust.ts` join the audience overlap in ONE admitted set that search's two arms, `read`, `outline` and the calibration sampler bind beside the takedown denial. A caller may name a minimum trust tier and it is enforced as an arm predicate, never after ranking. A SECTION carries no governance of its own and is admitted only when a descendant is visible, resolved by a recursive walk — so a folder whose every document is a draft, expired or below the floor stops advertising an empty shelf.

  A calibrated `retrieval.vector_floor` now travels with `retrieval.floor_digest`, the digest of the retrieval predicate it was measured through, which `ksor calibrate` prints beside the number. A floor is a threshold inside one candidate set; carried across a predicate change it stays plausible and stops meaning what it said. A declared floor whose digest is not this door's — **including a floor calibrated before this release, which has none** — enters the existing declared-but-uncalibrated refusal, and the search envelope reports `gate: "uncalibrated"` rather than `"off"`. Re-run `ksor calibrate` and paste both lines. The snapshot token now binds the viewer list too, so a token minted for one audience cannot re-serve its pinned generation to another.

- 3d0de9f: Stage the scaffolded site on the OKF-native record (`specs/ksor/build/spec.md` §3). Staging now runs for EVERY build — the level-0 fast path that served `knowledge/` unstaged is gone, because no record is now safe to serve raw. The site reads the record with the SAME rules `ksor build` runs, through byte-copies of the record module (decision 18), so frontmatter is real YAML rather than a line scanner. `KSOR_AUDIENCE` is a comma list validated against the lock's registry (`ksor-viewer-unregistered`) and required to include `public` (`ksor-viewer-omits-public`); unset means `[public]`. Lifecycle is decided once, at the lock's `as_of`, by the record spec §2.5 table: drafts appear only under `pnpm dev` or `KSOR_DRAFTS=show`, and a deprecated, not-yet-effective or stale concept renders with a badge on the human surfaces and is absent from `llms.txt`, `llms-full.txt`, the markdown twins and `server.json`. Denials come from `.ksor/takedowns.yaml` in ledger order; the `.ksor-denylist.json` reader and its `ksor-denylist-missing` refusal are gone. Every directory's `index.md` is REGENERATED from the staged tree — never the committed one copied — so a folder page lists exactly what this viewer may see, and a directory with no admitted concept gets no bullet in its parent. `llms.txt`, `llms-full.txt`, every twin and `/.well-known/mcp/server.json` carry the build's `build_id`, `source_commit` and `ksor_version`. The site build refuses `ksor-lock-missing` / `ksor-lock-stale` without a fresh `build.lock.json` outside development, and `ksor-site-outdated` when the lock was written by a newer `ksor` than the site's rule modules carry. `pnpm dev` keeps the staging path with drafts admitted and machine routes stamped `build_id: null`, `unstamped: true`. Links between concepts now resolve in both the forms OKF §6.1 allows — bundle-absolute and relative, `.md` optional — which the shell's own resolver never read, so they reached the page they name rather than 404ing.
- 561750f: Show the whole trust signal on a governed page, and serve the markdown twin's frontmatter intact (`specs/ksor/record/spec.md` §2, `specs/ksor/build/spec.md` §3). A document's page now carries a **status chip on every page** — `draft`, `stable` or `deprecated`, `stable` included, because a reader who cannot see it cannot tell a governed record from a site that never said — the **trust tier** OKF names (`unverified` / `machine-confirmed` / `human-reviewed`) beside the verification that set it, the **approver and date** that make a stable document stable, and, on a withdrawn one, **who withdrew it and when**. Where the calendar keeps an otherwise current document off the machine surfaces, a second chip carries record spec §2.5's own words with the date the spec's ellipsis stands for: `effective from 2030-01-01`, `past its review date`. `unverified` is printed rather than hidden — it is the honest state of a stable, approved concept nobody has reviewed.

  The `/md/` twins and `llms-full.txt` now serve each concept's **own frontmatter, verbatim**, under the derived `trust_tier` and the build's `build_id` / `source_commit` / `ksor_version`. The projection they replaced flattened `ksor.owner` into a top-level `owner:` and `ksor.effective_from` into `effective_from:` — both keys record spec §2.7 refuses BY NAME as pre-profile leftovers, so every twin published a frontmatter the record's own checker would have rejected, and every unknown key §2.7 preserves was dropped on the way out. An OKF consumer now parses the profile's grammar rather than this shell's summary of it.

  Fixed: a withdrawn document's **search result** wore the ordinary grey chip, because the CSS that tints it still selected the pre-profile status word `superseded`. Search is where a reader chooses between two documents and where the snippet quotes the withdrawn figure.

- adf42df: The shipped docs and the scaffold's own contract now describe the OKF-native
  record rather than the one before it.

  Every document `ksor init` emits, and every page in the package's `docs/`, had
  sentences that stopped being true when the record became an OKF bundle. The
  ones an adopter would have acted on:

  - **`ksor takedown` was documented as needing a database**, with examples that
    omit the required `--actor`, pass `--subtree` (not a flag; the verb takes
    `--scope subtree`) and pass a stable id to `--revoke` (which takes a ledger
    entry id). None of the three commands ran. A takedown is ledger-first, so a
    record with no database can withdraw a document, and the actor must be a
    well-formed `human:`/`process:` id that `takedown_authorities` names.
  - **`KSOR_AUDIENCE=<tier>` was documented in two places** and is refused: the
    value is a comma list that must include `public`, and admission is list
    overlap rather than a tier ordering.
  - **The display title was documented as `instance.md`'s body `# H1`**, which
    no longer exists; it is the `title:` key.
  - **A summary companion was documented as carrying no frontmatter**, which is
    now the one thing that refuses it: it carries exactly `type: Summary`.
  - **`pnpm check` was credited with the quiz and slides audits.** Those run in
    the site build; `pnpm check` never ran them.
  - The tool-surface numbers in the scaffold's AGENTS.md were the 2026-08-23
    measurement, taken before the trust floor and the per-hit governance block;
    they are the re-measured ones, each with its date, and `min_trust_tier` is
    now shown in the registration example it belongs to.
  - The scaffold README's file table never named `.ksor/governance.yaml`,
    `.ksor/takedowns.yaml` or `build.lock.json`, which are committed record
    files an adopter has to understand.

  `ingesting.md` also gains the remedy for a stale lock, which it never carried:
  `ksor ingest` refuses `ksor-lock-stale` / `ksor-lock-missing`, the fix is always
  `ksor build` and never an edit to the lock, and freshness covers seven sets —
  the instance, the policy, the ledger, the concepts, the companions, the assets
  and the generated indexes — so a refusal can name a file an adopter does not
  think of as content.

  No behaviour changed.

- 1d18eef: **The upgrade path from a pre-profile record now runs end to end.** Review of
  the OKF-native release found `ksor migrate` rewriting the record and nothing
  else, so an adopter who followed the runbook ended with a record they could
  neither build nor check. What changed:

  - **A record that declares a database can be migrated at all.** Reading its
    takedown denylist went through a reader that accepts the profile's instance
    only, so every record that had ever climbed to the served rung — exactly the
    population with denials to transcribe — was refused before a single query
    ran, blaming the database and telling you to run the command that had just
    refused.
  - **`ksor migrate` with no `--write` prints the diff again.** The documented
    first step exited `1` on every pre-profile record, because the `--actor`
    requirement did not distinguish showing a migration from applying one. The
    dry run names `human:<you>` in the diff and says what to re-run with.
  - **The commonest pre-profile shape no longer ends red.** A withdrawn document
    pointing at an approved successor had that successor demoted to `draft`, and
    `ksor build` then refused the tree. Migrate refuses that up front and names
    `--approve-by`.
  - **The files the migration invalidates are offered with it.** The emitted
    format checker in both skill trees (a stale one refused the record migrate
    had just written, in your editor and in your CI); the root `build` script,
    which called a `ksor takedown` flag this release removed; `.gitignore`, whose
    `.ksor/` line silently un-tracked the new Governance Policy and takedown
    ledger; and, under `--write-site`, the WHOLE of `system/site` rather than
    three rule modules.
  - **`ksor build` refuses `ksor-governance-ignored`** when a policy or ledger it
    can see is one git will never commit — the state that used to build green
    locally and fail in a clone with a refusal that never named the cause.
  - **`ksor build --strict` counts the build's own writes.** Regenerating a
    committed-but-stale index made the tree dirty AFTER `dirty` was read, so a
    strict build could stamp `dirty: false` and a commit that does not contain
    what it published.

- 0a0b048: Two ways a concept could leave the index while its page stayed published.

  **A `title` or `description` written across two lines is refused rather than rendered.** Both are written into ONE §8 index bullet, so a line break there does not render badly — it makes the bullet unreadable, and the concept disappears from the index, the sidebar and the reading order while it keeps its route and the MCP door keeps serving it. Nothing went red: the index generator and the index parser are two halves of one format and agreed on the broken output, so `ksor-index-stale` stayed green over it. A trailing break is the same defect wearing a YAML scalar style — `>` folds onto one line and keeps the newline, which emptied the description in the bullet and nowhere else. `ksor-one-line-form` now refuses both at the one place every surface reads, and `ksor migrate` folds a block or folded scalar onto one line rather than handing back a tree its own checker rejects.

  **A `%` in a filename is refused, and the site no longer dies decoding one.** `knowledge/50%-off.md` passed the checker and then killed `next build` with a bare `URIError: URI malformed` naming no file at all. A path is also a URL, where `%` opens an escape sequence: `50%-off.md` is a malformed one and `50%20off.md` decodes to a different name, so the character gives one document two identities — which is what `ksor-name-unportable` exists to refuse. The site's decode is guarded as well, the way the record's own link resolver already guards the identical call, so a bundle from another OKF producer renders the listing it can instead of taking the build down.

- fe9a0af: Three findings from the third review pass, each one a guarantee that held only by accident.

  **A governed document can no longer leave the record in silence.** A floor key that was PRESENT but unusable — `title: 42` from a title that lost its quotes, an empty `description:`, `status: 5` — pushed no refusal and had its schema complaint discarded as the duplicate of a refusal nobody had made. `parseConcept` returned "refused" with an empty list, so `ksor build` and `pnpm check` dropped the document — no page, no MCP node, no lock entry — printed nothing at all, and exited 0. Thirty-nine such values across the four floor keys did this; a whitespace-only title was accepted outright. Each is now refused by name, and a refusal with nothing to print is structurally impossible rather than merely absent.

  **`order` must be a finite number.** YAML resolves `.inf`, `-.inf`, `.nan` and an overflowing `1e400` to real numbers, and the refusal an author got for one read "Invalid input: expected number, received number". It now says what an order is and what to write instead.

  **A record that lives below its git repository root has a takedown ledger again.** `git show <rev>:<path>` reads a path relative to the repository root, while a `git log -- <pathspec>` is relative to the working directory — which is already the record root. Prefixing both asked git for `docs-sor/docs-sor/.ksor/takedowns.yaml`, and a pathspec that matches nothing is not an error: git exits 0 and prints nothing, so the baseline came back empty AND verified. Deleting a denial and the lock together then rebuilt clean and republished the withdrawn document. Now green on a record one and three directories down.

  **The takedown ledger's history baseline is complete, or it says it is not.** Three ways a version could go missing while the answer still read "verified": git's default history simplification pruned a merged branch whose net effect on the file was nil, so a denial recorded and quietly withdrawn inside one pull request never entered the baseline and its deletion could never be caught — the one deletion the committed lock cannot catch either, because the lock travels in that same pull request. A ledger version larger than one megabyte was silently skipped, as was any version whose bytes failed to read, because a failed read looked exactly like the commit that deleted the file. All three are closed: the walk reads full history in ancestry order, a version that is in the tree but unreadable makes the whole baseline report itself unverified, and the size ceiling is 64 MB.

  **`build.lock.json` records the generated indexes.** The `index.md` files a build writes are published — they are the surface an external reader parses to find anything at all — and they appeared in no section of the lock. They now have their own, hashed over the bytes the build wrote, and they move `build_id` like any other published bytes. Existing locks are regenerated by `ksor build`, which says so.

- 520f1ed: **`pnpm refresh` now builds before it ingests.** The emitted README gives one
  ordered path to the agent surface — `pnpm provision`, `pnpm refresh`,
  `pnpm serve` — and on a brand new record the second step failed:
  `ingest` publishes only a tree `ksor build` has checked, and refused
  `ksor-lock-missing` on a recipe that never mentions `ksor build`.

  The refusal named the fix, so nobody was stranded — but the documented path did
  not work, which is the thing a first run is for. `refresh` is
  `ksor build && pnpm ingest && pnpm gc` now: publishing stays a deliberate act,
  separate from serving, and the check that makes it publishable is part of it.

  All three managers emit it: npm and bun REPLACE the manager-owned scripts
  rather than extending the template's, so fixing the template alone left both of
  them broken. Walked end to end under pnpm, npm and bun — install, provision,
  refresh, serve, then a live MCP call returning cited hits.

  **An existing record gets the same fix from `ksor migrate`.** The sentence
  here used to say existing records needed no change, which was exactly backwards:
  `ksor ingest` gained a lock gate in this release, so a `refresh` that does not
  build first refuses `ksor-lock-stale` the first time the record is edited
  (`ksor-lock-missing` if `ksor build` has never run). `migrate` rewrites the
  script — matched by the ingest script it calls, so it works whichever manager
  scaffolded the project, and the `ingest` script itself is left alone.

  If you upgraded before this release and hand-edited your manifest, check that
  `refresh` begins with `ksor build &&`.

- 4c95a7a: **Fix a release gate that broke on the act of releasing.** Four doc-truth
  assertions read `.changeset/<slug>.md` directly. A changeset is a transient
  file — `changeset version` folds it into `CHANGELOG.md` and deletes it — so
  those assertions passed on every feature PR and threw `ENOENT` in the Version
  PR, the one run whose failure costs a red release instead of a red PR. It would
  have done so on every future release, not just this one.

  The assertions were right; only the place they looked was wrong. A new
  `releaseNote()` resolves a note to the pending changeset when it is still
  pending, and otherwise to the newest section of the changelog it was folded
  into — scoped to the newest section deliberately, so a rule adopted in this
  release is never asserted against prose written several releases ago.

- dc079c5: `ksor ingest --knowledge` is retired. The record root — the directory holding
  `instance.md` — supplies `knowledge/`, `.ksor/` and `build.lock.json` alike
  (record spec §1), so the flag could only ever name the one directory it was
  already going to read. It survived this release as a tolerated argument that
  `--help` did not list, which is the shape of a trap: it worked, so nobody
  noticed it meant nothing.

  Passing it now refuses like any other unknown flag, and `ksor migrate` strips
  it from the `ingest` script the pre-profile scaffold shipped, in the same diff
  that drops `export-denylist`.

- aec9ddd: **The emitted scaffold now says what a fresh record publishes, and what its
  tooling actually does.** Six sentences an adopter acts on were false about the
  project `ksor init` hands them.

  - **The record now says what a fresh build publishes.** The emitted README
    and AGENTS.md said nothing about the starter's publication state at all, and
    the `intake-interview` skill never raised it. All three now do, and the
    skill's turn is offered rather than performed on the owner's behalf, never
    beside an invented `verified` entry. (Which state they describe moved in the
    same release — see "A freshly scaffolded record now publishes on its first
    build".)
  - **`ksor takedown --list` and `--ledger`** were documented as needing
    "nothing". They need no ACTOR; the sentence now says that, and says they
    read the committed `.ksor/takedowns.yaml` on a record with no database.
    Both AGENTS.md and `docs/ingesting.md` also presented `--ledger` as the only
    route to the entry id `--revoke` takes — the denial prints it and the ledger
    file holds it, and neither needs a database.
  - **The format-checker skill** claimed "a ksor upgrade replaces it" of a
    `check.mjs` that no verb refreshed, in a skill that tells the agent to obey
    a printed fix literally. It now names the upgrade path and the rule for
    when checker and record disagree: upgrade, never undo the migration.
  - **`.env.example`** told npm and bun adopters to set three variables "before
    `pnpm build`". It is the one emitted file copied byte-for-byte rather than
    prose-translated, so it now names no manager at all.
  - **The `## Skills` list** had lost a sentence to an inserted bullet:
    `make-slides` ended mid-sentence and `make-summary` read "attach it and
    attach it".
  - **The actor convention** is documented as far as it is enforced.
    `ksor.owner` is free text that nothing parses — every other actor slot is
    form-checked — so the profile documentation says so instead of describing a
    check that does not run.

  The upgrade runbook's preview step now names `--actor human:<you>`. Bare
  `ksor migrate` does print the diff — it writes nothing, so it needs nobody's
  name — but the `.ksor/governance.yaml` in that diff carries a `human:<you>`
  placeholder where your handle will go, and passing your own shows the file you
  will actually get. `--write` is the step that refuses without `--actor`,
  because that is the step that performs the act.

- 71309c2: **Cuts and corrections from the final simplification pass.** Nothing here
  changes what the tool does; it removes code that had stopped being reachable
  and corrects three comments that had stopped being true — plus one hand copy
  of a rule that was actively wrong.

  - **`page-order.ts` is gone**, both copies. It sorted the site's page tree
    until this release replaced that path with the generated indexes, after which
    its only remaining callers were the drift tests asserting the two copies
    matched — a guard on dead code. The tie-break reasoning it recorded (a
    folder's descendant url compares against a sibling in the wrong order,
    because `/` sorts after `-`) moves onto the live `routeAt`, which performs
    the defence and did not say why.
  - **The attachment suffix list had a fifth hand copy**, in the site's staging
    step, and it was wrong: it claimed byte-identity with a checker that had
    moved to the canonical rule, and it was missing `.summary.mdx`, so the stage
    and the lock writer disagreed about which files are attachments. Both
    divergences were masked by earlier refusals, so nothing was observable — the
    shape decision 18 exists to catch. It now calls the canonical rule, as does a
    sixth copy found in a test fixture, where a fixture classifying attachments
    by its own rule could not detect the code under test classifying them
    differently.
  - **The guard that should have caught those two** scanned one directory and
    skipped test files. A copy was sitting in each blind spot. It now covers the
    emitted scaffold and tests as well.
  - **`splitFrontmatter` in the ingest module is gone.** Decision 26 made
    `record/frontmatter.ts` the one reader and every caller moved; what was left
    behind was an unused copy whose test asserted three behaviours the product
    had deliberately abandoned.
  - Also removed: three exported helpers in the site's attachment module that
    never had a caller, a predicate parameter no caller ever passed, and a
    test that asserted `true`.

  **Two guarantees gained an assertion**, both found while looking for
  redundancy rather than for holes:

  - **The trust tier now has a conformance table.** It had two implementations —
    the kernel's and the site's, which cannot import the kernel — and nothing
    asserting they agree, while the tier is stamped into every `/md/` twin and
    stored as the column the MCP door's `min_trust_tier` floor compares against.
    Both halves now run the same rows, including one the previous hand-written
    expectations did not cover: an actor whose producer merely contains the word
    `human` is a machine.
  - **`GATE_PREDICATE_DIGEST` is pinned by value, not by shape.** It was asserted
    only to be twelve hex characters. Every `ksor calibrate` writes it into the
    adopter's `instance.md` and the door compares it at boot, so a whitespace-only
    reflow of the serving predicate would have invalidated every calibrated floor
    in the field with nothing going red.

- 0a0b048: Teach the record checker about carried pages, so a document may ship the sim it frames.

  A record can carry an interactive page beside its document — `<name>.sim.html`, framed click-to-load where the prose puts it, served from the record's own path so it works offline and no third party learns who is reading. The checker had never been told: it refused every one of them `ksor-file-type` ("unexpected file type `.html`"), so `ksor build` exited 1 on any record that used the feature and no adopter could publish a sim at all.

  `<name>.sim.html` is now admitted, by that SUFFIX and nothing wider — a bare `.html` or `.htm` is still refused, and now says what shape a carried page has to take instead of only that this one is wrong. The rule that decides it is one file (`lib/sim-rule.ts`), read by the checker, the site's staging and the emitted `pnpm check` alike, and pinned to the site's embed rule by a test, because a marker that drifts between "what the record admits" and "what the site frames" fails silently in both directions.

  A sim stays an ASSET, not a study attachment: named freely, many per document, no route, no stable id, no MCP node, no `llms.txt` line and no markdown twin of its own — asserted now rather than assumed. Its governance is inherited by position, through the link in a document that survived every filter: an internal document's sim reaches no public build, a taken-down document's sim is denied with it under node and subtree denials alike, and a sim no document links is never published, so it never becomes a url.

- ac1c477: **A restricted document's sim no longer survives into a public build.** The
  site published carried sims by copying them into `system/site/public/sims/`
  and never removing what an earlier build had left there. Because static export
  ships `public/` verbatim and that directory is gitignored, the accumulation was
  invisible and served: build once with `KSOR_AUDIENCE=public,internal`, build
  again with the default, and the internal document's sim was still at
  `/sims/<path>.html` — the same for a document taken down between builds.

  The staged tree was correct in both builds, which is why nothing was red; the
  leak was entirely in the publish step that mirrors it. That step now prunes
  whatever the current build did not publish, so `public/sims/` holds exactly the
  sims this audience is allowed to see. Adopters get it on the next build; no
  record change is needed.

- cd21ec3: A code fence in a language the highlighter does not carry renders as plain
  text instead of failing the build. A record is not a code project: an author
  writing ` ```promql `, ` ```logql ` or ` ```gotemplate ` is describing their own
  stack, and shiki throws on a language it has no grammar for — so one fence
  anywhere in the record took the whole site down with a stack trace naming a
  file in `node_modules`. Found on a real 187-document handbook where three such
  languages appeared across some 3,000 fences.
- fe9a0af: Seven site fixes from the 2026-08-25 review.

  **The stage stopped re-writing itself, and a companion stopped escaping its parent.** A staged path is now emitted once, whatever asks for it. A document linking its own deck (`[Cards](./x.flashcards.yaml)`) had it copied twice — once as its parent's companion and once as a link target found on disk — and the freshness check that decides whether a stage may be left alone compares a count before it compares bytes, so it answered false forever in that record: every evaluation of every build wiped and refilled a stage that was already correct, which is exactly the check that stands between a build and a half-written stage. The same filesystem probe was a second way into the stage for a file that is meant to have only one: a public document linking a TAKEN-DOWN document's deck staged the deck, because the link rules judge a companion by its parent's audience and a takedown is not an audience. A companion now reaches the stage with its parent or not at all.

  **`site.governance: false` no longer swallows a lifecycle caveat.** A `stable` document with a future `ksor.effective_from`, or one past its `stale_after`, showed its chip in the sidebar, in folder listings and in search — and then opened as a current, in-force policy with nothing on the page, while the MCP door declined it outright. The key hides ATTRIBUTION (owner, approver, verifier, sources); it never hid the deprecation notice, and it now never hides the badge either. `deprecated` stays off the page's chip row, because the notice above the title already says it.

  **A file the record may not hold is diagnosed by the rule it breaks.** An `.mdx` dropped into `knowledge/` was reported as `ksor-lock-stale` — "run `ksor build` again", which is the command that refuses the file — instead of `ksor-file-type`. The lock's file-by-file comparison now runs after the record's own checker, so the tree is judged a record before the lock is asked whether it describes that tree. Same for bytes that are not a valid image, now `ksor-asset-corrupt`.

  **A link's scheme is read the way a browser reads it.** `\tjavascript:…` fell through the site's scheme test, which then treated it as a link into the record. Defence in depth — the record checker refuses such a link before the page exists — but the guard now strips the leading control characters a URL parser strips, so it means what it says.

  **The record watcher stopped holding the process open.** `pnpm dev` watches `knowledge/` and unref'd the watcher so it could never be the reason a process refuses to exit. On macOS and Windows that works — a recursive watch is native there. Everywhere else, Node substitutes a JS implementation that opens one watcher per directory and whose `unref()` walks a map of `Stats` objects unrefing anything that is `instanceof StatWatcher` — nothing in that map ever is, so it is a silent no-op and every watcher, created persistent by default, holds the event loop open forever. The watcher is now declared `persistent: false`, which is what makes the promise true on every platform; it still delivers every event while the dev server holds the process open, which is the only time it runs.

  **The stage lock stops waiting.** A holder killed mid-stage — Ctrl-C on `pnpm dev`, a cancelled job, an OOM — never runs the code that removes its lock, and the waiter broke a lock only when the recorded pid was GONE. A recycled pid reads as alive, so the wait was unbounded in practice as well as in code: `pnpm dev` repeating "waiting on .staged-knowledge.lock" on every request, with no build running, until the file was deleted by hand. After two minutes the build now refuses `ksor-stage-locked`, naming the file, the recorded pid, and what a signal-0 probe actually established — including that EPERM means "exists and is not ours", which a recycled pid produces too. It does NOT break the lock: the stage is removed and refilled in place, so breaking one a live holder still holds would publish a half-written record.

  **The site's lock reader covers the indexes.** `build.lock.json` records the bytes of every `index.md` the build generated, and `ksor ingest` has always compared them; the site's reader declared three lists and compared three. The indexes are the one thing under `knowledge/` the build writes rather than reads, and the one thing the site never copies — it regenerates a per-viewer set — so a committed index left at another branch's bytes by a merge, with no re-run of `ksor build`, was invisible to `pnpm build` and `ksor-lock-stale` to the door: one surface publishing what the other refused. The comparison is against the COMMITTED bytes, never the staged ones, because the lock records the whole record's indexes and a restricted viewer's index is legitimately shorter.

- 35e2cdf: **A freshly scaffolded record now publishes on its first build.** `ksor init`
  then `ksor build` reports **5 admitted to a machine surface**. It reported
  **0**: the five starter documents shipped `status: draft`, and a draft reaches
  no surface of a build — so a brand-new project came up with an empty
  `## Documents` in `llms.txt`, empty `/md/` twins, no document route, and an MCP
  door that answered nothing. That was deliberate, and it cost more than it was
  worth on the one build that is meant to be simple to get started.

  **What changed.** The five samples ship `status: stable` with
  `ksor.approval: { by: "ksor-starter/<the CLI version that scaffolded you>" }`,
  and the emitted `.ksor/governance.yaml` authorises that actor beside
  `human:you`.

  **The approver is a producer, not a person.** `ksor-starter/0.0.x` is the same
  form `generated.by` already uses, so it can never be read as a human who
  reviewed something — which is exactly what the rule against a tool recording an
  approval exists to prevent. The trust tier on every one of those pages stays
  `unverified`, and no `verified` entry is written. Your record does not claim
  anybody checked this, because nobody did.

  **Two things to do with the samples.** They describe KSoR, not your
  organisation, so replacing them is the first real act on the record — and when
  the last one is gone, delete `ksor-starter/...` from `approval_authorities` in
  `.ksor/governance.yaml`. Nothing of yours should be approved by a tool. The
  emitted README, `AGENTS.md`, the policy file's own comment and the
  `intake-interview` skill all say so.

  **Nothing changes for what you write.** A new document is `status: draft` and
  reaches no machine surface — no page, no sidebar row, no `llms.txt` entry —
  until a human approves it with `status: stable` plus a
  `ksor.approval: { by, at }` naming an actor your policy authorises.

  **Existing records are untouched.** This is the `ksor init` template only; no
  verb, refusal or lock field changed, and `ksor migrate` still demotes
  `approved` to `draft` unless `--approve-by` names the human approving.

- 959c8c5: **A subtree takedown now reads `expected`, so one ordinary command no longer wedges the record.** `ksor takedown --scope subtree knowledge/<dir>` on a directory that does not exist yet is a sanctioned act — a denial may precede what it names — and the verb recorded it correctly, printing `expected: removed` and exiting 0. The checker then refused it: its subtree branch judged presence alone and never consulted `expected`, so the very next `ksor build` exited 1 with `ksor-takedown-dangling`, on a ledger entry that is append-only and cannot be deleted. The only escape it named was `--revoke`, which records a lift that never happened and drops the hold if the path ever returns; "restore the directory" does not survive a clone, because git cannot commit an empty one. The identical act at node scope built green. The sanctioned withdraw-then-delete sequence wedged the same way, and `ksor migrate --write` could produce a ledger whose first build refused, because it hardcoded `expected: present` for every subtree denial it transcribed.

  The mirror gap was the same defect facing the other way: `expected: removed` at subtree scope had no re-added arm, so a directory the record said was deleted could come back with nothing red — while the serving half had read `expected` scope-blind all along, meaning the two surfaces disagreed about which records are publishable. One rule now decides both scopes, in both directions: a `present` entry whose target is gone is `ksor-takedown-dangling` and a `removed` entry whose target is back is `ksor-takedown-readded`, whether the target is a document or a directory. `ksor migrate` derives `expected` from the post-migration tree with the same function the checker judges it with, and the dangling refusal names `--removed` — the exit that records what actually happened — rather than a revocation. The record ROOT (`knowledge/#section`) is still refused whatever `expected` says: that form is unhonourable by the serving half, not merely out of step with the tree.

- 8a384be: Two ways `ksor takedown` answered wrongly about arguments an adopter types.

  **`ksor takedown --instance .` reads the record you are standing in.** It was the last verb taking `--instance` verbatim, so it resolved the record root as `dirname()` of the path given — the record's PARENT when the path is a directory. The verb then reported `ksor-policy-missing` about a record whose `.ksor/governance.yaml` was right there, and the fix it printed would have had the adopter overwrite their real `approval_authorities` and `takedown_authorities`: a false report about the record, with a remedy that destroys governance. `--list` and `--ledger` hit the same cause down a different path — reading a directory throws `EISDIR` rather than "declares no database", so the level-0 branch was never taken and a record with no database was told to stand up Postgres. Every verb now shares the one `--instance` rule the usage has always documented: an `instance.md`, or a directory at or below the record root.

  **A stable_id is recorded as the record spells it, not as the shell completed it.** A trailing slash is never part of a concept id, and a shell puts one on every directory it completes. `ksor takedown knowledge/policies/x/` matched no concept, so both surfaces denied nothing — and it recorded `expected: removed`, which agrees with "no such concept", so the checker stayed green and nothing ever said the hold was fake: a governance act reported as done, with no red anywhere. `--scope subtree knowledge/policies/#section` recorded the directory `policies//`, which every later `ksor build` refuses in an append-only ledger. The slash is now normalized away on both sides of the `#section` anchor before anything reads the id.

  **A denial naming the whole record is refused as an act, not left in the ledger.** `ksor takedown --scope subtree knowledge/` crashed with a raw `TypeError` under exit `3` — the ENVIRONMENT code, for a bad argument — and `knowledge/#section` was worse: it exited `0` and wrote an entry that every later `ksor build` refuses, in a ledger that is append-only. At the default scope the same id matched no concept, so both surfaces denied nothing while the verb reported a denial. All four spellings are now `ksor-takedown-record-root` at either scope, before anything is written, carrying the same reasoning and the same remedy as the checker's refusal of the recorded form — one subtree entry per top-level section — from one shared text.

- 8a384be: **`ksor takedown` no longer destroys another operator's withdrawal, and no longer reports one it did not record.**

  The verb read `.ksor/takedowns.yaml`, decided what the act was, and wrote the WHOLE file back. Nothing serialised those three steps, so a second run that read before the first one wrote rewrote the file from its own stale text — and every entry appended in between was gone. Each run printed ``recorded as `<id>`​`` and exited `0` all the same, because its own write had succeeded; what it deleted was somebody else's act. Reproduced on a stock `ksor init` scaffold with no database at all: five concurrent runs, five claims of success, three entries on disk, and two documents still published with nothing anywhere in the record saying anyone had ever asked for them to be withdrawn. `ksor build` was green over it, because a ledger that never held the entry is indistinguishable from one whose author never wrote it.

  The same line had a worse reading. `writeFileSync` opens with `O_TRUNC`, so the ledger is ZERO BYTES for the width of the write, and that window is reachable by any concurrent reader — 3.3% of reads under sustained contention on a real 7 KB ledger, and once in 5,177 reads sampled while ordinary `ksor takedown` processes ran. An empty file parsed as a valid EMPTY LEDGER, so the verb handed that state believed the record had withdrawn nothing and wrote a one-entry ledger over forty, exit 0. There is no restore verb, and the entry a revocation would have to name is one of the ones that was deleted, so every remedy the resulting refusals print dead-ends.

  Two mechanisms now, because they answer different failures. The read, the decision and the write happen inside an exclusive lock (`.ksor/takedowns.yaml.lock`, created with `wx` and stamped with the holder's pid; a lock whose holder is gone is broken, and one still held after 30s refuses `ksor-ledger-locked` under exit `3` having written nothing and claimed nothing) — that is what makes N concurrent acts produce N entries. And the write is an `O_APPEND` of the new entry ALONE, which is what makes the loss impossible rather than merely unlikely: a lock is a convention, and an append survives a writer that ignores one. The file now has no state in which it is shorter than it was.

  **A ledger file that exists and is empty is refused (`ksor-ledger-empty`) instead of read as "this record has withdrawn nothing".** No writer produces one — the verb writes the header and the first entry in the same call — so an empty ledger is not a record without denials, it is a record whose denials were lost, and the refusal is the one moment at which they can still be restored from version control. Absence of the FILE is still the honest way to say nothing has ever been withdrawn, and a fresh `ksor init` scaffold ships exactly that.

## 0.0.40

### Patch Changes

- cd42f81: Three readability changes to a document's page.

  A long line in a code block can be **unwrapped by the reader**, with a button
  that appears only on a block that actually overflows. The record's commands run
  to hundreds of characters, and in a docs column that was a scrollbar with the
  left edge of every line going out of view. Wrapping is not the default, because
  it is worse for the blocks that do not need it.

  A table's rows **alternate**, faintly, so a row holds together across three
  columns of wrapped prose.

  A callout carries a **rule down its left edge**, in its kind's colour — the
  same device a verbatim block uses, so "this passage is set apart" looks the
  same everywhere it happens.

- e19f226: A passage a reader must not miss can now be a callout. Write GitHub's alert
  syntax — a blockquote whose first line is `[!WARNING]` — and the site renders a
  styled panel tinted with that kind's own colour:

  ```markdown
  > [!TIP]
  > Climb one rung at a time, and only when something has gone wrong without it.
  ```

  It stays a plain blockquote everywhere else the record is read, carrying a
  visible label, and `/md/` and `llms-full.txt` keep the author's blockquote
  rather than this site's component.

  Not `:::warning`: a dialect renders as literal punctuation everywhere outside
  this site.

- 704e949: A document can now show something running, where the prose puts it. Give a link
  the title `embed` and the site renders it as a click-to-load frame:

  ```markdown
  [Play run-until-done](goal-loop.sim.html "embed")
  ```

  It stays an ordinary CommonMark link everywhere else — GitHub, a plain editor,
  `/md/`, `llms-full.txt` — so nothing was added to `knowledge/`.

  Prefer carrying the page in. A `<name>.sim.html` beside its document, exactly
  like a figure, is published by the build and served from your own site: it
  works offline, tells nobody outside what someone is reading, and is versioned
  with the document. An `https:` link works too, but many hosts send
  `X-Frame-Options: SAMEORIGIN` and a browser will refuse to frame them.

  Nothing is requested until a reader clicks, so a built page still makes zero
  external requests. A carried page is measured, so the frame is exactly as tall
  as what it holds — you never write a height into a document.

- a55e93e: A numbered list now counts in the record's accent, and the term a list item
  defines takes it too — `**Heartbeat:** a schedule that…` puts the term in
  accent and leaves the sentence in ink. The markers were grey at regular weight,
  lighter than the text they counted, so a list of six steps read as six
  paragraphs that happened to start with digits.
- a59a7af: The documented way to run `ksor init` pins a version, so a stale runner cache
  can no longer decide which ksor an adopter meets.

  `npx @panaversity/ksor init my-sor` is spec `*`, and any cached version
  satisfies it — so npx runs whatever that machine already has without consulting
  the registry. Found live on a Windows box following the README: it replayed
  `0.0.0`, the name-reservation stub published on the first day of the project,
  whose whole implementation prints "the name is reserved; this is not a release"
  and exits 2. Thirty-nine releases later, the first command in the README
  produced a placeholder, and nothing in that output points at the cause.

  Both READMEs now say `@panaversity/ksor@latest`. The three "Start here" forms
  change together — `pnpm dlx` reuses its cache for 24 hours by default and
  `bunx` resolves from the install cache before the registry, so pinning only npx
  would have left two of the three supported managers in the trap. `npm install
-g` is unchanged: an install resolves the `latest` dist-tag by definition.

  If you have run ksor before, your own cache is still warm. Run the `@latest`
  form once and it resolves the current release.

- 9e92e9e: A document with no summary no longer carries an empty view strip. The reading
  time moved into the governance row, beside the owner and the effective date,
  so the commonest document — one with no summary — gets one bar of facts rather
  than a second bar holding a single number at the far end of a rule.
- d723487: A table's head now reads as a head: the record's accent as a wash behind it,
  the column labels in that accent's ink, and an accent rule under the band. They
  were grey on near-white, so on a three-column table the eye had to work out
  which row was the label.
- 8ec1a10: A fenced block with no language is set as a passage to reproduce rather than as
  code: prose leading, and the record's accent down its left edge. Prompts,
  commands to say and messages to paste were arriving as walls of tight
  monospace, set for scanning columns of code when what is in them is sentences.

  Nothing to author — the highlighter's own output is the signal, so a block that
  was never highlighted is the one that changes.

## 0.0.39

### Patch Changes

- b6a3853: A malformed `KSOR_SNAPSHOT_KEYS` entry no longer has its text echoed into the
  refusal message. The likeliest operator mistake — pasting a bare secret without
  its `kid=` prefix — put that secret verbatim into an error that lands in
  whatever collects logs. The refusal now names the entry's position and length
  only, and keeps the remedy line.

## 0.0.38

### Patch Changes

- ba15879: The scaffolded site says where a document sits on **every** page, and the trail
  names the document itself.

  The shell's breadcrumb renders the folders above a page and nothing else, so it
  appeared on `/docs/surfaces/for-agents` and was absent on `/docs/installing` —
  the block above the title came and went as a reader moved through the record,
  and it was missing on exactly the documents at the top of it. A page now reads
  `⌂ › Surfaces › The agent surface`: a home link, the folders, and the document
  itself.

  The home link goes to the record's front door at `/`. The record's name became
  the page tree's root, replacing fumadocs' "Docs" default, so a screen reader
  hears it as the home link's label.

- 7eeb74d: New skill: **`make-summary`**. Ask your coding agent to summarise a document
  and it writes `<doc>.summary.md` from the document, which the site renders as a
  Summary tab beside the document's own words.

  It is `make-slides`' discipline applied to prose: read the document whole,
  write the summary, check every claim and every number back against it, and
  report what it left out because the document did not support it.

  With one rule of its own — **every `##` section must be represented**. A
  summary that covers the opening and trails off is worse than none: a reader who
  used it believes they have the whole document. It also declines to summarise a
  document too short to compress, and says so, rather than writing a Summary tab
  that restates the page.

  Slides had a generator; summaries did not, which is why records tend to have
  one summary and forty documents.

- cb263d5: The eyebrow that names a region of a page — Teaching aid, In this section,
  Sources — is one class now, and carries the record's accent.

  It was the same string of utility classes typed out in three components, which
  is how "Teaching aid" ended up accent-coloured and the other two grey: nothing
  tied them together, so they drifted apart one edit at a time.

- b8de20a: The scaffolded site no longer logs a React key warning on every page in
  `pnpm dev`.

  The shell renders the sidebar footer as one child of an array, so the element
  needs a `key`. Without it React logged "Each child in a list should have a
  unique key prop" naming `RecordShell`, on every route. A production build
  strips the warning, which is why it survived — it only appears in the dev
  server, which is where an adopter meets the site first.

- 0f17283: A document's teaching aid now renders **after its introduction**, not above it.

  The deck used to sit between the governance row and the first word of prose,
  which reads as a slot in the page's furniture rather than as part of the
  document — and on a long lesson it put a fourteen-slide deck in front of the
  paragraph that says what the lesson is.

  The placement comes from the document's own shape: the introduction is
  everything before the first `##` section, so the aid goes immediately before
  that heading, and a document with no sections gets it after its prose. No
  marker in the record and no frontmatter key — the headings the author already
  wrote are the structure.

  The recall aids (flashcards, quiz) are unchanged and stay at the end, because
  those are used after reading.

  The aid is placed in documents only — a `<doc>.summary.md` goes through the
  same pipeline and is rendered without one.

## 0.0.37

### Patch Changes

- 3eafb25: The package README states the KSoR architecture: one governed record — Markdown in the KSoR Profile of the Open Knowledge Format (OKF) — behind one governance boundary, projected through open standards.

## 0.0.36

### Patch Changes

- 617dc46: The scaffold meets your package manager

  `ksor init` now emits the scaffold for the manager that ran it: `npx
@panaversity/ksor init` produces an npm project, `bunx` a bun one, `pnpm dlx`
  (or anything unrecognized) the pnpm shape every scaffold got before. Node stays
  the one prerequisite — nobody installs a second package manager to open their
  own knowledge base (issue #28).

  The whole scaffold speaks the detected manager: scripts, README, AGENTS.md, the
  agent kit, the CLI's own handoff text. npm and bun scaffolds declare
  `workspaces` in the manifest and ship no lockfile — the pinned CLI version
  cannot be pre-resolved into one, so the first install writes it and the README
  says to commit it. The install-script denial carries over (`.npmrc` with
  `ignore-scripts=true` for npm; bun refuses dependency lifecycle scripts by
  default). What npm and bun cannot offer is pnpm's 48-hour quarantine on newly
  published dependency versions — the emitted scaffold discloses that instead of
  staying silent about it.

  Each manager's shape was proven end to end before shipping — install, `ksor`
  bin resolution, format checker, full static site build — and CI now walks npm
  and bun scaffolds on every change.

## 0.0.35

### Patch Changes

- 0fc6bce: Name the reader on the website

  The scaffolded site can now sign a reader in and show who they are in the
  navbar. It is off until three variables are set — the control does not render at
  all without them, which stays the default.

  The flow is OAuth 2.0 Authorization Code with PKCE against a public client, with
  no secret anywhere in a build that ships to browsers. Endpoints are discovered
  (RFC 8414, then OIDC), so no vendor is named in the code or in configuration;
  verified end to end against Auth0 and against a Better Auth deployment. The
  session lives in `sessionStorage` for the tab, and no refresh token is requested
  or stored — a token that unlocks nothing on this site should not outlive the
  visit.

  What it does NOT do is restrict reading, and the documentation leads with that.
  The site is a static export: every published document is a file the host serves
  to whoever asks, so keeping people out is still the origin gate or a per-audience
  build, both unchanged. This names an already-authenticated reader; it is not a
  step toward access control, and treating it as one would be the mistake the
  "Keeping people out of the site" section exists to prevent.

  Also fixes a real gap it exposed: the site build never read the repository-root
  `.env`, so following the scaffold's own instructions would have set variables
  that silently never reached the bundle.

- 4b431b2: Trim the shell-retirement revision in AGENTS.md from 222 words to 129, keeping
  what an agent must act on and moving the reasoning to the commit that carried
  it.

  Working rule 6 requires a reversed decision to keep its entry and gain a
  revision note, so removing it is not available — and it is not irrelevant
  either: without it an agent looks for a deleted directory with no explanation,
  or restores two-shell assertions thinking they were lost by accident, or reads
  decision 9, sees no obstacle, and treats dropping `output: "export"` as
  unblocked. That last one is the reason it stays.

  But coding principle 1 applies to this file too — context is liability, and
  AGENTS.md loads every session. The narrative half was 90 words explaining why
  the proof had been valuable, which the commit already records.

  Also documents the thing that was missing entirely: **how to keep people out of
  the site.** The door's auth had four recipes; the site had nothing, and the
  most common requirement — "everyone signs in before reading anything" — is also
  the easiest, needs no ksor change, and was written down nowhere.

  Three shapes, separated because they had been muddled: a host-level gate in
  front of the origin (protects every byte, holds against `curl`, and makes a
  site sign-in button redundant rather than complementary); per-audience builds
  for a restricted subset (enforcement by absence, already built); and the
  per-request case, which a static export cannot express and which issue #130
  records rather than implements. Plus what does not work — hiding rendered
  content behind a browser check, which presents rather than protects.

  The per-request case gets three answers rather than a deferral: **read through
  the door** (already applies audience scope per request and logs an actor per
  read — per-person governance with an audit trail a static site cannot have),
  **split the record** (content needing per-person confidentiality inside one tier
  usually belongs in its own record), or **fork the site**, which an adopter owns
  outright under decision 4.

  The fork is offered with what it costs stated: ksor's guarantee is enforcement
  by ABSENCE, asserted against a positive control; a request-time filter is a
  different guarantee and becomes the adopter's to test. A filter that is bypassed
  serves the document; an absent file cannot be.

## 0.0.34

### Patch Changes

- e18ea08: The second site shell is retired (decision 9 revision, owner). Nothing an
  adopter runs changes: `ksor init` has always emitted Fumadocs and never offered
  a selector.

  The proof did its job. It was built to answer whether the shell is really a slot
  or whether the surface contract was just a description of what Fumadocs happens
  to do, and it kept that contract honest through the visibility model,
  attachments and the staging lock. What it costs now exceeds that: every surface
  the record grows — quizzes, decks, slides, code tabs — has to be built twice or
  the conformance suite goes red, and the second build is one nobody ships.
  Maintaining a shell no adopter runs, to prove a property no adopter exercises,
  is the "code is liability" test failing.

  The five-clause surface contract survives unchanged and is still asserted,
  against one implementation. The other clauses decision 9 always leaned on —
  adopter ownership of `system/site`, registry-distributed shells later — are what
  carry replaceability now. The swap recipe lives in git history; an adopter
  actually swapping a shell restores the property as something live rather than
  hypothetical.

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
