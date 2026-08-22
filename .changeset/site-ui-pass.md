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
stands alone — no sidebar, no document chrome, `Open the record` as the way in,
landing on the first document in governed order rather than a hardcoded path.
Every word on it comes from `instance.md` or a document's frontmatter, because
the site contains no authored content, and everything it says is in the
server-rendered markup, so a crawler, a reader without JavaScript and an agent
parsing the HTML all read the same page.

**The site has a design, not a default theme.** Three voices, each marking who
is speaking: the record's own words in a serif (its title, its documents'
titles), the site's furniture in a sans, and everything machine-facing — the
slug, addresses, owners, statuses, section labels — in mono. System stacks only,
because a web font is fetched at build time and the scaffold's build must work
offline and byte-identically. The palette moves from neutral grey to a cool ink
(`oklch(0.17 0.012 255)`) that sits with the accent instead of beside it, with
firmer hairlines, and the accent is spent only on actions, links and the active
state.

**The front door is the record's cover, and it is one screen.** The identity
takes the whole window under the navbar over a faintly ruled ground: the
record's name, the authority sentence it declares in `instance.md`, one way in,
and a drawing of what a system of record does. The cover follows the theme
rather than staying dark in both — pale stock in the light, and in the dark it
rises one step above the page instead of turning white, because a cover is the
surface that catches the light. Every machine address came off the page:
`/llms.txt` sits where agents look for it and each document advertises its own
markdown twin, so nothing became less discoverable by leaving the front door,
and the page stopped printing URLs at a reader who will never fetch one.

**The drawing replaces a second list.** The right of the cover illustrates the
product's own definition — one governed source, sealed, projecting into the
pages a person reads, the markdown a consumer fetches, and the door an agent
connects through, with the connectors running one way because that direction is
the claim. It is SVG rather than a picture file: no binary in the adopter's
repo, no request at runtime, sharp at any size, and every stroke follows the
theme.

**The cover's composition is centred and its type ramp closed.** The signature
line at the foot took the section's free space as top margin, which cancelled
the centring and left 197px of dead space below the content and none above it
(measured at a 996px-tall window); the composition now sits in the middle of the
space above the signature, 157px clear at the top and 158px at the bottom. The
ramp ran 12px eyebrow to a 76px title to an 18px lead — a jump with nothing in
the middle — and is now 12 / 64 / 20. The accent rule under the title was still
pinned to the dark theme's blue from when the cover was dark in both themes,
which left it all but invisible on the pale light cover; it takes the token
again, so it inverts with everything else.
