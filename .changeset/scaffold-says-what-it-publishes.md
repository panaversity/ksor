---
"@panaversity/ksor": patch
---

**The emitted scaffold now says what a fresh record publishes, and what its
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
