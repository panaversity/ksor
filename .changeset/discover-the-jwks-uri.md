---
"@panaversity/ksor": patch
---

The signing keys are discovered, not guessed — any standards-compliant SSO now works.

`KSOR_SSO_URL` is documented as "the AS base", and the verifier appended one
vendor's layout to it (`/api/auth/jwks`, Better Auth's). Auth0, Okta, Entra,
Keycloak, Cognito and Google all publish elsewhere, so every one of them failed
the key fetch — which is classified transient, so the door booted clean and
returned 503 to every request with nothing naming the cause. The only posture an
operator could actually reach was `KSOR_ALLOW_PUBLIC_UNAUTHENTICATED=1`: the one
key we handed people was the one that props the door open.

`jwks_uri` is now read from the SSO's own metadata document — RFC 8414 first,
then OpenID Discovery — with `KSOR_JWKS_URL` kept as an explicit override, and
the vendor path kept as a last resort that reports itself as a guess. Where the
keys came from is stated on the boot line.

Verified against three real providers: Google (RFC 8414, cross-origin
`jwks_uri`), GitHub Actions OIDC, and Entra — whose issuer carries a path,
the case a naive `${sso}/.well-known/…` gets wrong.

Discovery never refuses to boot: an unreachable AS falls back and says so.
