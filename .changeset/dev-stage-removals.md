---
"@panaversity/ksor": patch
---

`pnpm dev` now drops a document that is deleted or moved while it runs (#274).

The dev server keeps a staged copy of the record, and its watcher carried edits
and new documents into that copy but never removals. A document deleted during
a review went on answering 200 at its old url and stayed in the sidebar, and a
moved one was listed twice, once at each path, until the dev server restarted.
Nothing told the owner to restart.

The refresh now removes every staged file the record no longer holds, and every
folder that leaves empty, so the deleted or moved document answers 404 at its
old url and leaves the sidebar within about a second. A document whose audience
is edited so that the dev viewer may no longer read it leaves the same way.

Removals were held back because a 2026-08-18 measurement found that deleting a
staged file took the dev server down. On fumadocs-mdx 15.4.0 and Next 16.3.3
it recovers on its own, but the race behind it remains: Turbopack can compile
before fumadocs has regenerated the collection, so the dev log may show
`Module not found` for the removed file, and a request in that moment can
answer with a 500. Measured on a fresh scaffold, another page polled every 20ms
did so one to four times in 6 of 8 removals, then answered 200 again. Builds
are unaffected: they never run the watcher.

An existing project takes the fix with `ksor migrate --write-site`, which
reissues `system/site/lib/stage-knowledge.ts` with the rest of the site.
