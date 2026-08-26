---
"@panaversity/ksor": patch
---

Refuse a withdrawal a document attests for itself, and close three record-checker gaps

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
