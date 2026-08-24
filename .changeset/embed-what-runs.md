---
"@panaversity/ksor": patch
---

A document can now show something running, where the prose puts it. Give a link
the title `embed` and the site renders it as a click-to-load frame:

```markdown
[Play run-until-done](goal-loop.sim.html "embed")
```

It stays an ordinary CommonMark link everywhere else — GitHub, a plain editor,
`/md/`, `llms-full.txt` — so nothing was added to `knowledge/`.

Prefer carrying the page in. A `<name>.sim.html` beside its document, exactly
like a figure, is published by the build and served from your own site: it
works offline, tells nobody outside what someone is reading, and is versioned
with the document. An `https:` link works too, but many hosts send
`X-Frame-Options: SAMEORIGIN` and a browser will refuse to frame them.

Nothing is requested until a reader clicks, so a built page still makes zero
external requests. A carried page is measured, so the frame is exactly as tall
as what it holds — you never write a height into a document.
