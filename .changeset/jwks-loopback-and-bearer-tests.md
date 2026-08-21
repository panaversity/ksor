---
"@panaversity/ksor": patch
---

A loopback authorization server's keys are reachable again.

JWKS discovery refused a cleartext `jwks_uri`, which is right for a network AS
and wrong for a local one: a dev authorization server on loopback advertises
`http://127.0.0.1:…/jwks`, the resolver refused it, the vendor guess was used
instead, and every request returned 503. `assertHttpUrl` already exempts
loopback for the SSO base for exactly this reason; the resolver now does too.
Cleartext to any non-loopback host is still refused.

Found by writing the first test that boots the gateway in bearer mode.
