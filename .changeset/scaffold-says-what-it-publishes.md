---
"@panaversity/ksor": patch
---

**The emitted scaffold now says what a fresh record publishes, and what its
tooling actually does.** Six sentences an adopter acts on were false about the
project `ksor init` hands them.

- **Day one publishes nothing, and now the record says so.** All five starter
  documents ship `status: draft`, and a build admits a draft to no surface at
  all — no page, no sidebar row, no `llms.txt` entry. That is decision 27
  working as designed, but the emitted README contained the word "draft"
  nowhere and told the adopter to verify a deploy by loading "one document
  page", which a fresh record does not have. The README and AGENTS.md now
  state it where the reader meets it, and the `intake-interview` skill gains
  the approval turn that resolves it in one conversation — offered, never
  performed on the owner's behalf, and never beside an invented `verified`
  entry.
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

The upgrade runbook's preview step is now `ksor migrate --actor human:<you>`:
bare `ksor migrate` exits `1` on a pre-profile record, because it must write
`.ksor/governance.yaml` and will not guess who is performing that act.
