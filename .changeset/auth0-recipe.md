---
"@panaversity/ksor": patch
---

A third worked authorization recipe: Auth0, the hosted provider with a free
tier — written around the confusions rather than the happy path, because every
step in it is one that was got wrong first on a real tenant.

The recipe leads with the thing that causes the trouble: **Auth0's "API" is your
ksor door, and Auth0's "Application" is whoever calls it.** From there it covers
what a scripted caller needs versus an interactive one (they are two different
applications, because a machine-to-machine app has no browser and filling in its
callback field changes nothing), and the authorization step that hides — it
lives on the API rather than the application, and it is a `Grant Access` button
inside an `Edit` panel, not the toggle the table appears to offer.

Also records what Auth0 gets right: it honours RFC 8707, so an MCP client sending
`resource=<your mcp url>` receives a token audienced there with no vendor
parameter and no mapper.

Also answers the question that comes BEFORE any recipe and that the page never
addressed: **will your provider work at all?** Three checks — does it issue
RS256 JWTs rather than opaque tokens (the door verifies signatures itself and
makes no introspection call), does it publish RFC 8414 or OIDC metadata so the
keys can be discovered, and can it mint a token audienced at your identifier.
A provider failing any one of them cannot be used, and today that is discovered
several screens into a vendor console rather than in the first minute.

The page was then read cold by someone who had never used any of the three
providers, and their report is the rest of this change. It found the page
answered neither of the two questions a deployer has first, and contradicted
itself on a third:

- **What does this protect?** Only the MCP door. The website is a separate
  surface and stays exactly as public as it was — now stated before anything
  else, along with the fact that this is one gate rather than per-user rules
  (the door reads no scopes; different readers seeing different documents is the
  record's `audiences:` model, a different mechanism).
- **`KSOR_MCP_RESOURCE_URL` "never has to resolve"** was wrong. The authorization
  server never fetches it, but a client does — it is where `www-authenticate`
  points. An invented value boots green and breaks discovery silently.
- **`KSOR_AUTH` appeared only as "delete any"**, undefined, inside one recipe, so
  readers of the other two never saw it — while a scaffold ships it SET. It is
  now defined once, up front, as the first thing to remove.
- **`KSOR_SSO_URL` "is the issuer"** contradicted a later warning that the two
  are deliberately different strings. The general rule is now stated once: one
  is a base for path joining, the other is compared byte-exact.
- **"Three variables"** introduced a four-row table, and three more were
  scattered across the page. Six now, in one table, with formats.
- **Nothing verified against the door.** A new section decodes the token
  (`aud`/`iss` — the debugging step for this page's own stated failure mode) and
  checks both the refusal and the acceptance, in that order.
- The Auth0 recipe dead-ended at "Save Changes" without saying what the client
  credentials were for, and its step 3 read as permission to skip step 5 — the
  step it calls "the one that hides".
