---
"@panaversity/ksor": patch
---

**Review fixes across the record, the deny seam and the site's machine
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
  Denial binds inside the admission walk, so both surfaces refuse it.

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
