---
"@panaversity/ksor": patch
---

The scaffolded site no longer logs a React key warning on every page in
`pnpm dev`.

The shell renders the sidebar footer as one child of an array, so the element
needs a `key`. Without it React logged "Each child in a list should have a
unique key prop" naming `RecordShell`, on every route. A production build
strips the warning, which is why it survived — it only appears in the dev
server, which is where an adopter meets the site first.
