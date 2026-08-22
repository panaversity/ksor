---
"@panaversity/ksor": patch
---

The scaffolded site got a UI pass, driven by measuring the real page in a
browser rather than reading the code.

**Every document is now published as markdown too.** `/md/<path>.md` carries the
document's body and its governance as frontmatter, and each page advertises its
twin with a `rel="alternate"` link and a visible "This document as markdown"
line. An agent handed a document URL no longer has to scrape a React app to
reach text the record holds verbatim.

**Governance shows up where a reader chooses, not only after the click.** The
sidebar, the previous/next pager, search results, the home page and every folder
index now carry a caveat status, so a withdrawn document and the one that replaced it stop
looking identical at the moment you pick between them.

**A folder page lists what the folder holds**, and the home page lists the
record — it used to announce a document count and link to one of them.

**The home page opens with the record's own words**: the first paragraph of
`instance.md`, which is also what `ksor serve` gives the MCP server. The
framework's marketing line is gone from the adopter's front page, which the
project's own critical rule 1 never allowed. Scaffolded `instance.md` was
reordered so the authority sentence comes first, where it belongs for the system
prompt too.

**Supersession runs both ways.** The withdrawn document names its successor; the
successor now names what it replaced, derived from the record with no new
frontmatter key.

**The supersession notice reads as a caution and is reachable by landmark** —
its own colour instead of the brand accent that also means "go here", and
`role="region"` with `aria-labelledby` instead of `role="note"`.

**A provenance entry that is a URL is now a link** — the whole entry only, and
`http(s)` only, so an authored `javascript:` source can never become a
clickable href.

**The sidebar footer no longer renders an empty input-shaped box.** The theme
switch shipped inside a bordered bar that stretched to the sidebar width around
one 61px control; it now sits on the footer row beside the mark.

**The left rail is flush with the window again.** The docs grid gives the
sidebar panel the centring offset as well as its own column, so above 97rem the
panel's surface ran to the window edge with the first nav item starting 103px
inside it (measured at 1728px). The layout width is now `100%`: the offsets go
to zero, the rail starts where the window does, and the prose does not move.

**The site is a shadcn/ui project.** `components.json` and `lib/utils.ts` ship
with the scaffold, so `pnpm dlx shadcn@latest add <name>` writes a component the
adopter then owns, and Fumadocs reads the same palette through its `shadcn` CSS
preset — one set of tokens for the shell and for anything added from the
registry, with `--primary` carrying the brand. It also ends a real defect: the
`neutral` preset painted the page and the sidebar it sits against 1.6% apart, so
the reading surface never read as a page. The shadcn CLI itself is deliberately
NOT a dependency (578 extra packages, measured); the four the site actually uses
cost +2.

**The previous/next neighbours sit at the foot of the page, not wherever the
text stopped.** A governed record is full of short documents, and on those the
pager landed mid-screen — 265px above the bottom edge on the policies index,
measured — reading as more content rather than as the end of the page. It now
takes the free space as margin above it, and stays exactly where it was on any
document taller than the viewport.

**The reading column stopped moving, and stopped being a slab.** The shell caps
the article at 900px — 78 characters a line at the body's 16px — and centres it
in whatever the table-of-contents column leaves, so the prose ALSO jumped 134px
sideways between a document with headings and one without (measured: text at
x=446 against x=580). The measure is now 46rem, about 66 characters, and the
TOC column is held on every page, so sidebar and rail are the same width and the
column lands in the same place on every document: x=464, 672px wide, on a
document with a table of contents and on one without, verified in both.

**The home page is the record's own front door.** It is a landing page that
stands alone — no sidebar, no document chrome, `Open the record` as the way in —
and the hero is split: the record's identity, its authority sentence
and a humans/agents switch on the left; on the right a panel showing the
record's OWN published bytes, the same `llms.txt` the route serves and the same
markdown twin `/md/` serves, with a copy button. Below it the record lists as
cards carrying who owns each entry, how many documents sit below it, and any
caveat status. Every word still comes from `instance.md` or frontmatter — the
site contains no authored content — and both audience blocks stay in the markup
so a crawler, a reader without JavaScript and an agent parsing the HTML all find
every door. The shape is borrowed deliberately from the docs homes of AI-first
projects read on 2026-08-22 (Anthropic's asymmetric hero with a live artifact,
Vercel AI SDK's humans/agents switch, Cursor and MCP rendering their first page
inside the docs shell); what is ours is that the artifact is evidence rather
than illustration.

**The site has a design, not a default theme.** Three voices, each marking who
is speaking: the record's own words in a serif (its title, its documents'
titles), the site's furniture in a sans, and everything machine-facing — the
slug, addresses, owners, statuses, section labels — in mono. System stacks only,
because a web font is fetched at build time and the scaffold's build must work
offline and byte-identically. The palette moves from neutral grey to a cool ink
(`oklch(0.17 0.012 255)`) that sits with the accent instead of beside it, with
firmer hairlines, and the accent is spent only on actions, links and the active
state.

**The front door is the record's cover.** The identity claims a full-bleed band
over a faintly ruled ground — ink on white in the light theme, and in the dark
it rises one step above the page rather than turning white, because a cover is
the surface that catches the light. The record's contents sit on the cover as a
second column, and the panel showing the bytes an agent is served (`llms.txt`
and a document's markdown twin, tabs and a copy button) crosses the cover's
lower edge onto the page below. That crossing is the one bold move; the rest is
quiet. Two ways in sit side by side — open the record, or search it, the second
opening the real search dialog — and every machine address moved into the panel
where the bytes are, instead of competing with the primary action. Document
pages keep the same three voices, and their governance strip reads as the
record's checkable facts.
