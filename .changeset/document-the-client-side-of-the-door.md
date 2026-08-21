---
"@panaversity/ksor": patch
---

The scaffold documents what a CLIENT has to do to reach a public MCP door

`ksor serve` implements the OAuth Resource Server handshake in full — an
unauthenticated request gets a 401 carrying
`WWW-Authenticate: Bearer resource_metadata="…"`, and that document names the
record's resource identifier and its authorization server, so a client discovers
where to authenticate instead of being told. None of it was written down
anywhere an adopter or their agent reads. The operator half was documented (the
three environment variables); the half their agents actually execute was not.

The scaffold's `AGENTS.md` now walks the three steps, and names the failure that
goes wrong quietly: a token minted for a different audience is a perfectly valid
token, and this door rejects it, so `aud` against `KSOR_JWT_ALLOWED_AUDIENCES` is
the first thing to compare when a client authenticates fine and still gets 401.
It also records the two behaviours a client author has to know and could not have
guessed — RS256 only, no opaque-token introspection, and an unknown key id
answering 503 rather than 401, because during a key rotation the token is
probably good and retrying beats sending the user back through a login.

This closes one of the three items named in issue #26; the worked provider
recipes and the introspection/rotation policy remain open there.
