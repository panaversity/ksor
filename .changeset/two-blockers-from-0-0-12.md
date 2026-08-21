---
"@panaversity/ksor": patch
---

Two defects introduced in 0.0.12, found by verifying the published package live

**The discovery document became invalid exactly when a record became real.** The
MCP registry schema caps `ServerDetail.description` at **100 characters**
(2025-12-11). 0.0.12 started generating that description from the record's own
prose — a real improvement over the hard-coded sentence it replaced — and capped
it at 300. The unfilled placeholder is 88 characters and validates; a described
record's title plus scope sentence is routinely 150-350 and does not. So
`/.well-known/mcp/server.json` passed validation until the owner did the thing
the scaffold asks for, then silently stopped, with nothing in the build to say
so. It is now assembled inside the schema's budget and trimmed at a word
boundary rather than mid-word.

**The boot report reassured the operator in the one configuration that needs a
warning.** `KSOR_ALLOW_PUBLIC_UNAUTHENTICATED=1` permits an unauthenticated
public bind, and the auth line kept printing `DISABLED — 0.0.0.0 only, and a
public bind will refuse to boot` — false on both counts, at the moment the whole
record is being served to anyone who can reach the port. It now says that,
naming the variable responsible.

Both shipped in 0.0.12 and both were mine; the aligned boot report and the
self-describing discovery document are otherwise unchanged.
