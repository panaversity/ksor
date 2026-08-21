---
"@panaversity/ksor": patch
---

The shrink guard guards `ksor ingest --flip` again — it had stopped

`.env.example` documents `KSOR_MAX_SHRINK` as "a corpus that shrinks by more
than this FRACTION refuses to flip". In 0.0.10 it did not. Deleting eight of ten
documents and running `ksor ingest --flip` published the two that were left,
silently, exit 0.

The cause was the fix that stopped a refused ingest from publishing. That moved
the flip out of `buildGeneration` and into the command, so the governance gate
could run against the new generation BEFORE it became the active one — and the
shrink check, which lived inside the build's flip branch, was stepped straight
over. The library test that covers the guard stayed green throughout, because it
drives `buildGeneration` directly with `flip: true`, which is no longer the path
the CLI takes.

There is now one answer to "may this generation be activated" — `flipRefusal` —
and both flip paths ask it, in the same transaction as the flip itself. The new
test drives the command rather than the library, so a guard that only one of two
paths performs fails the tier that proves it.

Verified against a live record: a 10 → 2 node build now names all eight removed
documents, refuses with exit 1, and leaves the previous generation serving.
