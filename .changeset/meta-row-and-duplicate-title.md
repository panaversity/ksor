---
"@panaversity/ksor": patch
---

**Two fixes on the document page.**

The governance row put **Export** in the middle of the row with nothing under
it. Export and the reading time each carried their own `ms-auto`, and on a row
narrow enough to wrap they landed on the same line — where two auto margins
SPLIT the free space between them rather than stacking, so Export came to rest
mid-row instead of at either end. They are now one right-hand cluster and
travel together at every width.

And the starter's `knowledge/surfaces/overview.md` was titled `Surfaces` inside
a section already called Surfaces, so its breadcrumb read `Surfaces › Surfaces`
and the sidebar showed a Surfaces inside Surfaces. It is titled `Overview` now,
matching its filename, and the generated section index was regenerated with it.
