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
regenerated for that filtered tree with `okf_version` at the root. No byte of
an excluded concept reaches it — not a title, a path, a description or an
asset — and any OKF consumer reads it with no ksor in the loop. The directory
is replaced on every run, a copy of `build.lock.json` is written beside the
bundles, and the scaffold's `.ksor/*` rule already gitignores it.

`build.lock.json` gains `bundles[]` — one `{ viewer, sha256, files }` per
viewer, recorded on EVERY build whether or not the flag was passed, so a
bundle directory can be matched to the publication that produced it. The
digest is sha256 over the JSON of the bundle's sorted `[path, sha256]` pairs.
`build_id` is unchanged: the bundles are a function of what it already
hashes. A lock written by an earlier ksor lacks the key and is refused as
`ksor-lock-invalid` — run `ksor build` once after upgrading, which `pnpm build`
already does.

One new refusal: `ksor-audience-identifier-invalid`, when a registered
audience cannot name a directory (for example `../x`), raised only under
`--bundles` and before anything is written.
