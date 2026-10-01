---
"@panaversity/ksor": patch
---

Add OrcaRouter as a first-class AI provider, with two ways to give it a
credential.

**The provider.** `embedding.provider: orcarouter` in `instance.md` routes
embedding and calibration-question synthesis through
`https://api.orcarouter.ai/v1`, an OpenAI-compatible gateway, with the key in a
`Bearer` header. Model ids keep their `vendor/model` namespace as the catalog
publishes them.

**Two entries, one credential.** `ksor connect orcarouter` authorizes this
machine in your browser with OAuth 2.0 + PKCE (S256) and stores the
`sk-orca-…` key it mints; `ksor connect orcarouter --key` stores one you
already hold. They differ only in how the credential is obtained — both end at
the same ordinary key, billed to your account and revocable by you, and nothing
downstream can tell which was used. `--status` reports the credential in use,
masked; `--clear` removes it. The key lives in the `.env` beside your record,
the same file your database DSN is in, and is never logged, never sent to a
browser, and never put in a URL.

**`ksor models`** lists what the credential can actually reach, read from the
live `GET {api}/models` and filtered to the capability you ask for — an
attachment narrows a chat list further, to the models whose catalog record
declares that input modality. When the endpoint cannot be reached the built-in
verified seed is shown, and it says so.

**`ksor console`** serves both entries and that model list on one local page,
on an ephemeral loopback port with a per-run token. It is deliberately not part
of the record's site: that is a static export, and a provider credential is not
a published document.

New environment variables: `ORCAROUTER_API_KEY`, plus `ORCA_BASE_URL`,
`ORCA_AUTH_BASE_URL` and `ORCA_API_BASE_URL` for a self-hosted deployment
(explicit overrides win; `ORCA_BASE_URL` is the shared fallback). All are
documented in the scaffold's `env.example`.
