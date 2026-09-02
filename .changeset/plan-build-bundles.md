---
"@panaversity/ksor": patch
---

`ksor build --bundles` is implemented (issue #158). It used to parse the flag
and exit `2`; it now runs an ordinary build and additionally writes one OKF
bundle per viewer under `.ksor/out/bundles/<viewer>/` — `public`, and
`[public, X]` for each audience X your `.ksor/governance.yaml` registers. A
bundle holds exactly what that viewer's machine surfaces publish: the admitted
concepts (stable, effective, unexpired, not taken down, audience overlapping),
their companions, the assets their bodies reference, and every `index.md`
regenerated for that filtered tree with `okf_version` at the root. No byte of a
concept excluded for AUDIENCE reaches it — not a title, a path, a description
or an asset — because the record checker refuses a link that widens audience
before a bundle is planned. A document excluded for a lifecycle or ledger
reason is different, and deliberately: bodies are copied verbatim, never
rewritten, so a link to a draft or a taken-down document keeps that path and
the build reports the dangling link instead of editing your prose. Any OKF
consumer reads a bundle with no ksor in the loop. The directory is replaced on
every run, a copy of `build.lock.json` is written beside the bundles, and the
scaffold's `.ksor/*` rule already gitignores it.

`build.lock.json` gains `bundles[]` — one `{ viewer, sha256, files }` per
viewer, recorded on EVERY build whether or not the flag was passed, so a
bundle directory can be matched to the publication that produced it. The
digest is sha256 over the JSON of the bundle's sorted `[path, sha256]` pairs.
`build_id` is unchanged: the bundles are a function of what it already
hashes.

**Upgrading:** a lock written by an earlier ksor lacks the key, so `ksor build`
refuses it as `ksor-lock-invalid` and says to delete it. It does NOT regenerate
one it cannot read — the lock is also a takedown baseline, and a baseline
nothing can parse is one that quietly holds nothing. So the first `pnpm build`
after upgrading (`ksor build && <site build>`, which is the deploy command too)
is red until the stale `build.lock.json` is gone. `ksor migrate` now offers that
deletion like any other change it carries, so the four steps in
`docs/upgrading.md` cover it; deleting the file by hand and rebuilding does the
same thing.

Two new refusals, both raised on EVERY build — not only under `--bundles` —
because the lock lists `bundles[]` either way and a digest for a directory the
tool refuses to write would be a provenance claim about something that cannot
exist. `ksor-audience-identifier-invalid`: a registered audience that cannot
name a bundle directory (`../x`, `.hidden`, `-x`, `internal.`, or
`build.lock.json`, whose name the lock copy beside the bundles already holds) —
an identifier must start with a letter or a digit, may then use letters, digits,
`-`, `_` and `.`, and may not END in `.`, which Windows strips from a path
segment, so `internal.` and `internal` would be one directory there.
`ksor-audience-identifier-collides`: two registered audiences differing only in
case, such as `internal` and `Internal`, which are two viewers in your policy
and ONE directory on macOS and Windows — the second bundle would merge into the
first, leaving a directory that holds concepts its viewer may not read.
