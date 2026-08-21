---
"@panaversity/ksor": patch
---

A 503 refusal no longer puts the database host and user on the wire

When the deferred boot checks fail, `/mcp` refuses with the thrown error's
message in full under `data.detail`. For the three authored failures that is the
point — a too-old schema, a governance violation and a text-search mismatch each
carry a multi-line remedy the operator has to act on. But the catch treated every
error alike, and `pg` writes the host, its resolved address, the port and the
database user into its connection and authentication failures. Those went out
verbatim to any caller who could reach the door.

What may leave is now decided in one place and by TYPE, not by inspecting
message text: a class we wrote is a class whose words we control. A driver error
is refused with its class named and its text withheld, and the caller is told
which kind of failure it is — infrastructure, not their request.

The full text still reaches the operator, deliberately: the refusal says the
reason is in the server's logs, and the deferred-boot line recorded only the
error's NAME, so before this the real message existed nowhere. That is also why
the boot checks are not sanitised at their source — reducing a driver error to a
class name early would destroy the one copy anyone can act on.

**The test that covered this was holding it in place.** It asserted that
`http.ts` contains the literal string `data: { detail: message }` — so the leak
was pinned by an assertion with reasoning attached. Grepping source is the right
instrument for "does this check run before dispatch", because position is a
property of source, and the wrong one for "what does the response contain".
Response contents are now asserted against real bodies, including a `pg`-shaped
connection failure whose host, address, port and user must all be absent.

Verified live: a gateway pointed at an unreachable database answers
`the content store is unavailable (Error)` with no host, port, user or database
name anywhere in the body, while the server log carries
`connect ECONNREFUSED 127.0.0.1:59999` in full.
