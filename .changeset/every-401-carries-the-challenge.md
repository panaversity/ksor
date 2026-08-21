---
"@panaversity/ksor": patch
---

Every 401 from the MCP door carries its `WWW-Authenticate` challenge, not just the first

Only the missing-token branch emitted `WWW-Authenticate: Bearer
resource_metadata="…"`. A token that failed verification — expired, wrong
audience, no subject, bad signature — came back as a bare 401. That is the most
common 401 a real client will ever see, because tokens expire mid-conversation,
and it left the client with no pointer back to the resource-metadata document:
it could not re-discover the authorization server it had just been talking to.
Only a caller that had never sent a token was told where to go.

The MCP authorization spec requires `WWW-Authenticate` on a 401 without
qualification. Every 401 now carries it, with RFC 6750's `error="invalid_token"`
so a client refreshes rather than retrying the dead token.

A **503** stays deliberately unchallenged: an unreachable key set is our outage,
not the token's fault, and challenging there would send a user whose token is
perfectly good back through a login over a key-fetch failure.

Found by adversarially checking the release that documented this door. The
adversarial auth suite missed it by asserting the STATUS of each rejection and
never the header — it now sweeps every 401-producing token and asserts the
challenge on each, with the 503 as the negative control.
