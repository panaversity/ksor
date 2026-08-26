---
"@panaversity/ksor": patch
---

**The Auth0 recipe now names the trap that costs the afternoon it warns about.**
Walked end to end against a live Auth0 tenant and a deployed door for the first
time (2026-08-26), and the recipe was right about what to type and silent about
the two things that actually go wrong.

The API **Identifier** must equal `KSOR_MCP_RESOURCE_URL` character for
character, `/mcp` path included — and **Auth0 does not let you edit it after the
API is created**, so a wrong one is fixed by making a new API, not by correcting
the field. Neither fact was written down.

Two Auth0 errors now have a table, because both arrive as a failed token request
and they mean opposite things: `Service not enabled within domain` is no API
with that Identifier, while `Client "…" is not authorized to access resource
server` means the Identifier is right and the grant from step 5 is missing.
Moving from the first to the second is progress.

And "Verify it" gains a step 0: ask the PROVIDER for a token before touching the
door. Half of these failures never reach ksor, and one `curl` at the token
endpoint separates the halves — which is how this diagnosis was actually made,
after several rounds of reasoning about dashboard toggles that turned out not to
be the cause.
