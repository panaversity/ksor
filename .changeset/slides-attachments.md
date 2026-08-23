---
"@panaversity/ksor": patch
---

Presentations, as governed attachments of a document.

A document in `knowledge/` may now carry `<doc>.slides.yaml`. It renders at the
top of that document's page — before the prose, because a deck is the shape of
the thing and gives the detail somewhere to land.

**Ask your coding agent and it writes the deck.** `make slides for
knowledge/expenses/approvals.md` runs the new `make-slides` skill, which reads
the document whole, writes the slides, checks every claim and every number back
against it, and tells you what it left out because the document did not support
it — which is usually how you find out a document has a gap. No browser, no
third-party tool, no step where a person takes over.

**The record owns the deck by default.** `deck:` carries the slides themselves
and the site renders them, which is the only mode where a presentation is
governed: reviewed in the same pull request as its document, versioned with it,
withdrawn when it is withdrawn, and incapable of rotting into a dead link. Every
slide ships in the server-rendered HTML, so a reader without JavaScript, a
crawler and an agent parsing the page all get the whole deck. Presenter notes
render outside the slide, so they are not projected in fullscreen.

**A deck you keep elsewhere** can be embedded instead — `slides.url:`, with the
embed url derived for Google Slides, Canva and SlideShare. Its frame is
click-to-load: nothing is requested from the host until a reader asks for it, so
a page still makes zero external requests and a reader who only wanted the
policy never announces that to a slide host. Declaring both modes is refused
(`ksor-slides-two-sources`) — two presentations with nothing to say which one
governs is the disagreement a system of record exists to settle. `http` urls are
refused too, since a browser blocks a mixed-content frame silently.

Like every attachment, a deck has no URL, no sidebar row, no `llms.txt` line and
no id an agent can cite, and it takes its `visibility:` and any takedown from its
parent.
