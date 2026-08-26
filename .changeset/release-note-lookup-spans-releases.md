---
"@panaversity/ksor": patch
---

**Fix the release-note lookup, properly this time.** The previous release added
`releaseNote()` so doc-truth assertions could survive a changeset being folded
into the changelog. It resolved a consumed note to the NEWEST changelog
section, which is only correct for the release that consumes it: a note
consumed in 0.0.41 lives in the 0.0.41 section forever, so by 0.0.42 the lookup
returned a different release entirely.

Two failures came out of that, and the second was worse than the bug it
replaced: presence assertions went red, and a fenced-block scan went VACUOUS —
passing because the section handed to it contained no code blocks at all.

`releaseNote()` now returns the whole changelog once a note is consumed, plus
whether the note is still `pending`. Assertions about the PRESENCE of prose use
the text (finding it anywhere in the changelog proves it shipped); assertions
about STRUCTURE gate on `pending`, because "every fenced block must show
`--approve-by`" is a rule about a note still under review, not one to apply to
the whole published history.

Verified in both states and mutation-tested against the released tree: removing
`--approve-by` or changing the tool-size figure in the changelog turns the
assertions red.
