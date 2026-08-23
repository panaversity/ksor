---
"@panaversity/ksor": patch
---

The MCP tool surface is now adopter-owned code. `ksor init` emits
`system/gateways/content.ts` — ordinary `registerTool` calls with ordinary zod —
where a record sets what its tools are called, what it says it covers, what they
accept, and which of them exist at all.

Agents are the operator, and an agent pays for this surface out of its context
window twice. Measured against a live 81-document record: the three tool
definitions cost ~2,990 tokens and stay resident for the whole session, and one
`search` at the default `k=10` costs ~3,541 tokens per call. Until now a record
could change none of it. Deleting the two tools your agents never call gives back
~1,643 tokens a session — verified live at 5,337 bytes of definitions against the
default's 11,960.

Real code rather than a config API, because models are trained on the MCP SDK and
on zod and not on our field names — and because `registerTool` lets a record add
its own tools, which no config schema could have anticipated. One import
(`@panaversity/ksor/gateway`, which re-exports `z` and `McpServer`), so a
registration stays a file: no package, no build step, nothing new in your
lockfile. It is **deletable** — without it the door serves the identical surface.

The handlers, output schemas and framework description text stay in the package,
because a hand-written handler returning fabricated hits with plausible
`stable_id`s passes every shape check there is. Your prose composes ABOVE the
framework text, never instead of it — and since that is now a template literal in
a file you own, **the door inspects its own served surface at boot** and refuses
to start when a guarantee is gone: `ksor-gateway-floor-missing`,
`ksor-gateway-no-tools`, `ksor-gateway-unloadable`.

Adds a public subpath export, `@panaversity/ksor/gateway`.

New: `docs/tool-surface.md`.
