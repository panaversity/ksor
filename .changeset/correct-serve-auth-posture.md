---
"@panaversity/ksor": patch
---

Correct the documented serving posture, and name the agent surface at `init`.

The docs said `ksor serve` "binds loopback with auth off by default". It never
did: `buildAuth` refuses to boot unless SSO is configured or
`KSOR_AUTH_DISABLED=1` is explicit — loopback included. An adopter who followed
the prose instead of `.env.example` exported only the DSN and the provider key
and hit a boot refusal they had been told would not happen, and the sentence
advertised a weaker posture than the product actually ships. Both READMEs and
the scaffold's `AGENTS.md` now say what the code does; the scaffold's own
`.env.example` and setup steps were already correct and are unchanged.

`ksor init`'s closing handoff now names `pnpm serve` alongside `pnpm dev`, so
the MCP surface is visible at the moment the adopter is reading the screen
rather than only in the runbook.
