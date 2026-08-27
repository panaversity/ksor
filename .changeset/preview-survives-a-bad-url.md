---
"@panaversity/ksor": patch
---

**`pnpm preview` no longer dies on a URL it cannot parse or a file it cannot
read.**

Two crashes of one shape, both in the emitted preview server. `pipe()` attaches
its error listener to the destination and never to the source, and
`decodeURIComponent` throws on a malformed escape — so either failure reached a
`node:http` request listener with nobody watching, which is an uncaught
exception. The process exited and left the adopter a dead port and a stack trace
instead of a page.

- **`http://localhost:3000/%`** ended the session. So did `/%zz` and any
  truncated multi-byte escape — the first hostile URL a browser extension or a
  scanner sends.
- **A file the export cannot read** did the same, with no attacker at all: a
  mode-000 file anywhere under `out/` is a one-request kill, and so is the
  ordinary loop of rebuilding in another pane while the preview runs, where the
  export is torn down and a page re-requests an asset that has gone.

A request that cannot be parsed now resolves to nothing, which is what the 404
path is for. A file that fails to open ends the response and **says why on the
console**, because a silently truncated page is its own kind of lie.

**Two more failures now explain themselves** instead of arriving as stack
traces: an occupied port names the collision — `dev` defaults to 3000 as well —
and a `PORT` that is not a number is refused, where before it became `NaN`,
bound an arbitrary free port, and printed `http://localhost:NaN`.

**And the server binds where it says it binds.** `listen(PORT)` with no host
binds every interface while the log has always printed `localhost`, so the
export — drafts included — was reachable from the whole network. It is loopback
now.

Alongside this, the containment check moved from once-per-request to
per-candidate. `resolve()` tries three filename shapes, and the third,
`` `${target}.html` ``, names a sibling of the export root whenever the target
IS the root. It is reachable only when the export has no `index.html`, so this
is defence in depth rather than a fixed leak — and it is the case the test now
builds an export without an index in order to reach, having previously asserted
the rule against a fixture that could not.
