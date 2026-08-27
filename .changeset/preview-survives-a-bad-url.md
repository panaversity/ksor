---
"@panaversity/ksor": patch
---

**`pnpm preview` no longer dies on a malformed URL.**

One request to `http://localhost:3000/%` killed the emitted preview server
outright — `decodeURIComponent` throws `URIError` on a malformed escape, and a
throw from a `node:http` request listener is an uncaught exception, so the
process exited and left the adopter with a dead port and a stack trace instead
of a page. Any truncated escape does it: `/%`, `/%zz`, a cut multi-byte
sequence. A request that cannot be parsed now resolves to nothing, which is what
the 404 path is for.

The containment check moves with it. `preview.mjs` refuses a request that
escapes the export, but it checked the resolved target once and then tried three
filename shapes — and the third, `` `${target}.html` ``, is outside the export
for exactly one request: `/`, where the target IS the root and the sibling
`out.html` would have been read. Containment is now asserted per candidate, so
the shapes tried can never outrun the rule they are tried under.

Found while making the browser suites' own static servers match this one.
