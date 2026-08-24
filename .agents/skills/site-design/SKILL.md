---
name: site-design
description: How to design or restyle the scaffolded KSoR site — its home page, document pages, theme tokens, typography and components. Use it before changing anything under packages/ksor/templates/scaffold/system/site, whenever the task mentions the site, the home page, the theme, dark mode, layout, spacing, a component's look, "make it modern/professional", or a screenshot of the site. It carries the design language, the constraints that are not negotiable here (no web fonts, no authored content, static export), the traps this shell has already sprung, and the review a design change must pass before it ships.
metadata:
  version: "1.1.0"
  origin: written 2026-08-22 from a full redesign pass — every trap below was hit live
---

# Designing the KSoR site

The general craft of visual design is not here — load the `frontend-design` skill for that (aesthetic
direction, type pairing, avoiding templated defaults). **This skill is the part that is specific to
this product**: what the site is, what it may not do, what has already gone wrong, and how a change
proves itself. Use both.

## What you are designing

A **system of record**: the copy of the company's knowledge that wins when it and a spreadsheet
disagree. Not a docs site, not a marketing site. Its world is charters, registers, custody,
provenance, supersession — and its vernacular is worth mining, because that is where distinctive
choices come from.

It serves **two audiences from one source**: a person reading pages, and an agent reading bytes
(`llms.txt`, `llms-full.txt`, `/md/<path>.md`). That duality is the product's second principle and
the richest thing in the brief — a design that expresses it beats a design that decorates around it.

## Four constraints that are not style opinions

1. **The site never contains authored content** (scaffolded AGENTS.md, critical rule 1). Every word
   on a page comes from `instance.md` or a document's frontmatter. You may write UI labels — "Open
   the record", "For agents" — but never a sentence that describes the product. If a design needs
   copy to work, the design is wrong for this product. Design carries the weight instead.
2. **No web fonts.** A Google face is fetched at BUILD time, which breaks the offline build and the
   byte-identical rebuild the scaffold pins — and the browser smoke test asserts **zero external
   requests**, so it fails the suite, not just the principle. System stacks only. `shadcn init` adds
   `next/font/google` on its own; revert it every time.
3. **Static export.** `output: "export"`. No runtime, no server components that need one, no image
   optimizer. Interactivity is fine (client components render into the HTML), but anything the
   BYTES must carry — governance, addresses, statuses — has to be in the server-rendered markup,
   not behind a click. A crawler, a reader with JavaScript off, and an agent parsing HTML all get
   what is in the file.
4. **The home page has four jobs and no fifth** (`research/site-design.md` §4): say what the record
   is authoritative for, name the identity citations carry, open the record, point at the agent
   doors. A marketing home page is a recorded non-goal.

## The design language as it stands

Change it deliberately, not accidentally — and if you change it, change it everywhere at once.

- **Three voices.** Serif (`--font-display`, system stack) for the record's own words: the instance
  title, document titles. Sans for the site explaining itself. Mono for everything machine-facing:
  the slug, addresses, owners, effective dates, statuses, section labels. Each face marks _who is
  speaking_, which is why it survives contact with new components.
- **Cool ink, not neutral grey.** `--foreground: oklch(0.17 0.012 255)` and its dark counterpart —
  a trace of blue so text sits with the accent rather than beside it. Hairlines at `0.9`.
- **One accent, spent narrowly.** `--primary` is the whole brand. Actions, links, active state. A
  page where the accent is everywhere has no accent. `--ksor-caution` is the only other coloured
  thing and it means the opposite (a withdrawn document).
- **The record lists as CARDS** — a bordered surface per entry, an icon, the title in the
  record's serif, its metadata in mono, and an arrow. It listed as a hairline register until
  2026-08-22, and the register lost: it was honest about hierarchy and silent about being
  usable, because at rest a row carried no affordance at all — only a hover tint — so on a
  touch screen nothing ever said the row was a link. Four treatments were prototyped on a
  route and the owner chose the card. What did NOT change is the voice: serif for the record's
  own words, mono for what the record says about them, and `approved` staying silent.

## Traps this shell has already sprung

Every one cost a live debugging round. Check them before you ship.

| Trap                                                      | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--card` is **white** in shadcn's light theme             | A "surface" painted with `bg-fd-card` is invisible on the page. Use `--muted` for a band or panel. **Fumadocs paints its own code block with `bg-fd-card`**, so fenced code read as loose monospace text with a faint outline until `.prose figure.shiki` was given `--muted` — measured 2026-08-22 at under 2% lightness between the block and the page. **It paints the CALLOUT with it too**, so a Note and a Warning both arrived as a white box with a coloured hair down one edge and the kind was legible only in the icon (2026-08-25). |
| A colour override on bare `:root`                         | Leaks into dark mode — `.dark` and `:root` have equal specificity and yours comes later. Always write the pair.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| The docs grid is `offset │ sidebar │ main │ toc │ offset` | The sidebar panel spans the offset too, so above `--fd-layout-width` (97rem default) its surface runs to the window edge while its contents sit inside. `--fd-layout-width: 100%` zeroes the offsets.                                                                                                                                                                                                                                                                                                                                           |
| The article is `max-w-[900px] mx-auto` inside `main`      | Centred in a column whose width changes with the TOC, so the prose _moves_ between documents. Cap the measure (`#nd-page:not([data-full="true"])`) and keep the TOC column held.                                                                                                                                                                                                                                                                                                                                                                |
| `DocsPage` `full`                                         | Widens the article to 1168px AND drops the TOC column — the escape hatch when a page needs the width. Our measure cap exempts `data-full="true"`.                                                                                                                                                                                                                                                                                                                                                                                               |
| Fumadocs' pager prints "Next Page"                        | Only when the neighbour has no `description`. Do not design around the label appearing.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| React splits `For {value}`                                | The server HTML contains `For <!-- -->humans`. Never assert on text that spans an interpolation.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `next/font/google`                                        | See constraint 2. It will come back every time the shadcn CLI touches the project.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| The repo's `typecheck` does NOT cover the template's site | `packages/ksor` does not typecheck `templates/scaffold/system/site`, so a prop added to a component's TYPE but not to its destructuring passes lint, typecheck, guard, unit and integration — and fails only when a scaffold is actually built (2026-08-25). The sharpest reason the "verify on a built scaffold" rule below is not optional.                                                                                                                                                                                                   |

## How to work

**Prototype on a route, not in the shipped page.** Build variants under
`system/site/app/(home)/proto/<name>/page.tsx` in an emitted scaffold, show them side by side, let
the owner pick, then port the winner into the template and delete the prototypes. Three cheap
routes beat three rounds of describing.

**Measure, do not squint.** Read real numbers out of the browser — grid tracks, computed colours,
element positions, characters per line. "The prose jumped 134px between documents" is a finding;
"it feels off" is not. Screenshots are for judging composition; measurements are for claims.

**Verify on shipped bytes.** `pnpm build` and serve `system/site/out` statically. The dev server
hides things: the Next dev-tools badge, un-minified CSS, hot-reload state.

**Both themes, every time.** Not "and dark mode works too" — flip it and look.

## Before you call it done

- Both themes, at a wide window and a narrow one.
- Keyboard focus is visible on every control you added; motion is behind `motion-safe:`.
- `site.governance: false` still renders (governance keys disappear, the record still lists).
- The static export carries what you designed: `grep` the built HTML for the thing you added.
- `pnpm fmt lint guard check:corpus typecheck test:unit test:integration` — and for anything the
  browser can see, `KSOR_E2E=1 pnpm exec vitest run --config vitest.integration.config.ts
packages/ksor/src/scaffold-e2e.integration.test.ts`, which is the ONLY suite that opens a page.
  A design change that greens the fast gates and reddens that one has not been tested.
- Any document the change made false — `research/site-design.md`, `specs/ksor/init/spec.md`, the
  scaffolded `AGENTS.md` "Customizing the site" seams — corrected in the same commit.
- A changeset entry, because the template ships inside the npm package.
