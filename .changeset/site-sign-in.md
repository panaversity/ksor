---
"@panaversity/ksor": patch
---

Name the reader on the website

The scaffolded site can now sign a reader in and show who they are in the
navbar. It is off until three variables are set — the control does not render at
all without them, which stays the default.

The flow is OAuth 2.0 Authorization Code with PKCE against a public client, with
no secret anywhere in a build that ships to browsers. Endpoints are discovered
(RFC 8414, then OIDC), so no vendor is named in the code or in configuration;
verified end to end against Auth0 and against a Better Auth deployment. The
session lives in `sessionStorage` for the tab, and no refresh token is requested
or stored — a token that unlocks nothing on this site should not outlive the
visit.

What it does NOT do is restrict reading, and the documentation leads with that.
The site is a static export: every published document is a file the host serves
to whoever asks, so keeping people out is still the origin gate or a per-audience
build, both unchanged. This names an already-authenticated reader; it is not a
step toward access control, and treating it as one would be the mistake the
"Keeping people out of the site" section exists to prevent.

Also fixes a real gap it exposed: the site build never read the repository-root
`.env`, so following the scaffold's own instructions would have set variables
that silently never reached the bundle.
