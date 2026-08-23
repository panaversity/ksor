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
