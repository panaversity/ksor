---
"@panaversity/ksor": patch
---

A refused `ksor ingest --flip` no longer publishes.

The governance gate added in 0.0.8 ran *after* the build, and the build had
already flipped — so an ingest into a state no surface can serve reported the
problem, exited 1, and left the record's active pointer moved to the generation
it had just refused. The shrink guard does the opposite and always has: it
refuses inside the build and leaves the old generation serving.

`ingest` now builds without flipping, runs the gate against the new generation,
and activates only if it passes. A refusal says what was left behind and that
the previous generation still serves; `ksor gc` reaps the abandoned one.

Found by running the real 0.0.8 package against a live Neon database rather
than by reading the code.
