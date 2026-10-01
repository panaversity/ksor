---
"@panaversity/ksor": patch
---

A new npm or bun scaffold builds its site again.

`mdast-util-to-markdown@2.1.3`, published 2026-09-27, broke the MDX stringifier
of `fumadocs-core@16.15.4`, the version the scaffold pins. Any page with bold or
italic text sent it into recursion without end, so `npm run build` and
`bun run build` failed with `RangeError: Maximum call stack size exceeded`
(fuma-nama/fumadocs#3604). The npm and bun scaffolds ship no lockfile, so a
fresh install picked up 2.1.3. Their root `package.json` now has
`"overrides": { "mdast-util-to-markdown": "2.1.2" }`, and their README explains
it. The pnpm scaffold has not changed, because its committed lockfile already
holds 2.1.2.

If you scaffolded with npm or bun and your build now fails this way, add the
same `overrides` entry to your root `package.json` and install again. Remove the
entry when you move `fumadocs-core` to 16.15.15 or later, which has the
upstream fix.
