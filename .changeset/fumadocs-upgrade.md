---
"@panaversity/ksor": patch
---

**The scaffolded site moves to Fumadocs 16.14.5 / fumadocs-mdx 15.3.0**, from
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

