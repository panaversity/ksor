---
"@panaversity/ksor": patch
---

**The upgrade path from a pre-profile record now runs end to end.** Review of
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
