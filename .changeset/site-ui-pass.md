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

**The previous/next neighbours sit at the foot of the page, not wherever the
text stopped.** A governed record is full of short documents, and on those the
pager landed mid-screen — 265px above the bottom edge on the policies index,
measured — reading as more content rather than as the end of the page. It now
takes the free space as margin above it, and stays exactly where it was on any
document taller than the viewport.
