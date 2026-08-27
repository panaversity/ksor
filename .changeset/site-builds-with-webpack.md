---
"@panaversity/ksor": patch
---

**The emitted site builds with webpack, so a real record still deploys.**

The scaffold's site build was `next build`, which under the pinned Next 16.2.9
means Turbopack. Turbopack evaluates the Tailwind PostCSS transform in a
separate process and waits on a deadline for the reply, and on Vercel's default
build machine (4 cores, 8 GB) that process stops answering once a record is big
enough to prerender a few hundred routes. Measured on a real 205-document
record — 435 routes — the build ran about seven minutes and died:

```
FATAL: An unexpected Turbopack error occurred:
Failed to write app endpoint /icon.png/route
- timeout while receiving message from process
- deadline has elapsed
```

Nothing in that points at the build command, and it names `/icon.png/route`,
which is not the problem. The same record compiled in 86s with
`next build --webpack`, a supported Next 16 flag rather than a workaround.

The scaffold now emits `next build --webpack`. `dev` is unchanged and still
Turbopack — the failure is production-only, where every route is prerendered at
once. An existing project takes the fix with `ksor migrate --write-site`, which
already offers `system/site/package.json`.

This also retires an intermittent CI failure: the conformance suites carried a
retry for `TurbopackInternalError: Input image not found`, a flake in
Turbopack's static-image metadata pipeline reading the scaffold's `app/icon.png`
mark. That pipeline is no longer on the production path, so the retry is gone
rather than left in place — a shim retrying quietly is what would stop the suite
reporting a real regression.
