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
