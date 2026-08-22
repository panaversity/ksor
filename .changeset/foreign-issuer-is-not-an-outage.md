---
"@panaversity/ksor": patch
---

A token from another authorization server is refused, not reported as an outage

An unknown key id raises the same error whether the cause is key-rotation lag or
a token minted by an entirely different authorization server. Both were treated
as transient, so a client presenting a credential that can never work got `503
service unavailable` — and retried it, forever, while the misconfiguration read
as an outage in every dashboard.

Reproduced across two real servers: a door configured for Ory Hydra, presented
with a genuine Keycloak token, answered 503. It now answers 401, before it
fetches a key at all.

The check runs only when `KSOR_SSO_ISSUER` is set, because only then has the
operator stated what the issuer should be. It reads the issuer from an unverified
payload, which is sound for exactly one purpose — refusing. A token that passes
it still has its signature verified in full, so a lie there buys nothing.

Genuine rotation lag is still transient, still uncached, and a valid bearer is
still re-admitted the instant the key set catches up.

**New: `docs/authorization.md`**, shipped in the package — two worked recipes for
putting a record behind an authorization server, both executed against real
servers rather than written from their documentation, plus what an agent does to
obtain a token and what each refusal means.
