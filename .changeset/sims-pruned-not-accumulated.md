---
"@panaversity/ksor": patch
---

**A restricted document's sim no longer survives into a public build.** The
site published carried sims by copying them into `system/site/public/sims/`
and never removing what an earlier build had left there. Because static export
ships `public/` verbatim and that directory is gitignored, the accumulation was
invisible and served: build once with `KSOR_AUDIENCE=public,internal`, build
again with the default, and the internal document's sim was still at
`/sims/<path>.html` — the same for a document taken down between builds.

The staged tree was correct in both builds, which is why nothing was red; the
leak was entirely in the publish step that mirrors it. That step now prunes
whatever the current build did not publish, so `public/sims/` holds exactly the
sims this audience is allowed to see. Adopters get it on the next build; no
record change is needed.
