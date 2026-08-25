---
"@panaversity/ksor": patch
---

**`ksor migrate` no longer widens an audience, brick a record, or emit a tree
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
