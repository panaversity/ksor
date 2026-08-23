---
"@panaversity/ksor": patch
---

The MCP tool surface is now adopter-owned. `ksor init` emits
`system/gateways/content.ts`, where a record sets what its tools are called,
what it says it covers, and how much of an agent's context an answer costs.

Agents are the operator, and an agent pays for this surface out of its context
window — twice. Measured against a live 81-document record: the three tool
definitions cost ~2,843 tokens and are resident for the whole session, and one
`search` at the default `k=10` costs ~3,541 tokens per call. Until now a record
could change none of it.

Three edits pay for themselves. **Dropping a tool nothing calls** is the largest
win — omitting `outline` and `read` gives back ~1,556 tokens a session.
**`covers`** says what this record answers and what it does not, which is how an
agent with several records attached picks yours. **`k`** is the real lever on
reply size; `budgets.maximum_response_characters` is not, and the measurement
shows why — at ~1,400 characters a hit it cannot bind before the 50-hit ceiling.

The file is a plain `.ts` with **no build step and no package** (Node 24 strips
types natively), and it is **deletable** — without it the door serves exactly
the previous surface, unchanged.

What stays framework-owned is deliberate: output schemas, provenance, input
schemas, and the description floor. `covers` composes ABOVE that floor, never
instead of it, because the floor carries envelope branching, the meaning of
`gate: "off"`, and the instruction that corpus text is untrusted. A record able
to replace it would silently stop abstaining and start obeying instructions
written into its own documents.

Adds the package's first public subpath export beyond the root:
`@panaversity/ksor/gateway` — types and plain data objects, 0.17 kB.

New: `docs/tool-surface.md`.
