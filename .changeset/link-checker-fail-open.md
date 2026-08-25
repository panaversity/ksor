---
"@panaversity/ksor": patch
---

**The link checker no longer goes blind on two ordinary markdown shapes.** Every link rule — `ksor-link-widens`, `ksor-link-dead`, `ksor-link-escapes` — and the footnote rule read the document with its code stripped out, so a shape the stripper mistook for code took its links out of reach of all four at once, with nothing red. A public document could point at a restricted one and `ksor build` exit 0.

**A list item's continuation paragraph is prose, not code.** CommonMark requires four spaces of indent there, and the stripper read any four-space line as an indented code block — so the link in

```
- A bullet.

    See [the plan](/secret/plan.md) for detail.
```

was invisible to the checker while the site published it as a live link. Indentation is now measured from the container's content column, the way CommonMark measures it: code inside an item starts four columns past the ITEM, and a fenced sample inside an item is still a fence. A sub-bullet at the same indent was always seen, which is why this hid.

**A fence that never closes now hides only itself.** The fence state survived to end of input, so one stray ` ``` ` in prose silenced every link and footnote after it — half a document unjudged, with no signal. An unclosed fence is a stray backtick run, not a block, and the rest of the document is judged again.

Both directions were checked: no document in the shipped starter or the example corpus changes shape under the new stripper, and everything that was really code — indented blocks, fenced blocks inside list items, code spans, thematic breaks — is still stripped.
