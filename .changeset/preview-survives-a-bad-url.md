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
path is for. And a file that fails to open answers **500 with a reason**, not a
blank page: the response head is written on the read stream's `open` event
rather than before it, so a file that never opens can still be answered
honestly. (A file that vanished BEFORE the request was already a 404 — the
resolver stats every candidate — so this is the file that is there and will not
open.) Writing it first would have produced a complete, valid, EMPTY `200` —
which a browser renders as a blank page and `fetch().text()` reports as `""` —
and that is the same silent lie this change exists to stop telling, one layer
down. A failure PART WAY through, where the head is already out and no status
is left to send, destroys the connection instead of ending it cleanly, so the
client sees a truncated response because that is what happened. Either way the
reason goes to the console.

**Two more failures now explain themselves** instead of arriving as stack
traces: an occupied port names the collision — `dev` defaults to 3000 as well —
and a `PORT` that is not a port number is refused. That covers more than the
obvious case: `Number("")` and `Number(" ")` are `0`, so an unset `PORT=` in a
shell or a compose file used to bind an arbitrary port and print
`http://localhost:0`, exactly as `PORT=abc` printed `:NaN`.

**And the server binds where it says it binds.** `listen(PORT)` with no host
binds every interface while the log has always printed `localhost`, so the built
export was reachable from the whole network. It is loopback now, with
`KSOR_PREVIEW_HOST` as the way out for the cases where reaching it from
elsewhere is the point — a container published with `-p`, a cloud dev box, or
the built site on a phone. Set it on the command line: `preview` is plain `node`
and does not read `.env`.

Stated precisely, because a governance claim is the one thing to get exactly
right in both directions. A DEFAULT build carries no drafts at all (record spec
§2.5 admits them to no surface of a build), so what a default `out/` exposed is
the published record. The case that mattered is the one this first missed:
`KSOR_AUDIENCE=public,<audience> pnpm build`, whose output holds
audience-restricted documents and which the scaffold's AGENTS.md says "belongs
behind that audience's own access control, never on a public host" — that `out/`
was network-reachable from a preview. `KSOR_DRAFTS=show` is the other. `pnpm dev`,
where drafts live, is `next dev` and unchanged by this.

Alongside this, the containment check moved from once-per-request to
per-candidate. `resolve()` tries three filename shapes, and the third,
`` `${target}.html` ``, names a sibling of the export root whenever the target
IS the root. It is reachable only when the export has no `index.html`, so this
is defence in depth rather than a fixed leak — and it is the case the test now
builds an export without an index in order to reach, having previously asserted
the rule against a fixture that could not.
