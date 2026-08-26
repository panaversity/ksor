---
"@panaversity/ksor": patch
---

Two ways a concept could leave the index while its page stayed published.

**A `title` or `description` written across two lines is refused rather than rendered.** Both are written into ONE §8 index bullet, so a line break there does not render badly — it makes the bullet unreadable, and the concept disappears from the index, the sidebar and the reading order while it keeps its route and the MCP door keeps serving it. Nothing went red: the index generator and the index parser are two halves of one format and agreed on the broken output, so `ksor-index-stale` stayed green over it. A trailing break is the same defect wearing a YAML scalar style — `>` folds onto one line and keeps the newline, which emptied the description in the bullet and nowhere else. `ksor-one-line-form` now refuses both at the one place every surface reads, and `ksor migrate` folds a block or folded scalar onto one line rather than handing back a tree its own checker rejects.

**A `%` in a filename is refused, and the site no longer dies decoding one.** `knowledge/50%-off.md` passed the checker and then killed `next build` with a bare `URIError: URI malformed` naming no file at all. A path is also a URL, where `%` opens an escape sequence: `50%-off.md` is a malformed one and `50%20off.md` decodes to a different name, so the character gives one document two identities — which is what `ksor-name-unportable` exists to refuse. The site's decode is guarded as well, the way the record's own link resolver already guards the identical call, so a bundle from another OKF producer renders the listing it can instead of taking the build down.
