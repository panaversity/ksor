---
"@panaversity/ksor": patch
---

The documented way to run `ksor init` pins a version, so a stale runner cache
can no longer decide which ksor an adopter meets.

`npx @panaversity/ksor init my-sor` is spec `*`, and any cached version
satisfies it — so npx runs whatever that machine already has without consulting
the registry. Found live on a Windows box following the README: it replayed
`0.0.0`, the name-reservation stub published on the first day of the project,
whose whole implementation prints "the name is reserved; this is not a release"
and exits 2. Thirty-nine releases later, the first command in the README
produced a placeholder, and nothing in that output points at the cause.

Both READMEs now say `@panaversity/ksor@latest`. The three "Start here" forms
change together — `pnpm dlx` reuses its cache for 24 hours by default and
`bunx` resolves from the install cache before the registry, so pinning only npx
would have left two of the three supported managers in the trap. `npm install
-g` is unchanged: an install resolves the `latest` dist-tag by definition.

If you have run ksor before, your own cache is still warm. Run the `@latest`
form once and it resolves the current release.
