---
"@panaversity/ksor": patch
---

A citation pin no longer outlives a restriction

A snapshot token pins a generation so a citation keeps resolving to the same
bytes. It was also deciding the _audience_ question — evaluating `visibility` on
the pinned row — so a document restricted after the token was issued kept reading
in full for the token's life, to a caller the record had just closed it to.

Three routes refused it and one served it, on the same surface, in the same
second: `outline` omitted it, `search` filtered it, an unpinned `read` refused it,
and `read` with a pre-flip token returned the whole document.

The generation pointers are why the obvious guard missed it. A flip sets
`rollback_generation` to the generation just superseded, so a pre-flip pin is
exactly the rollback pointer — servable by design, and the check that narrows a
pin to {active, rollback} passed it.

**Governance is now read from the record as it stands.** A pin still decides
which generation's content is served; it no longer decides whether the caller may
have it. A document the record no longer contains cannot be resurrected by one
either. Unpinned reads are unaffected — with nothing pinned, the two generations
are the same one and the check is an identity.

The cost is deliberate: a citation can stop resolving within the token's 30
minutes when the record restricts what it points at. That is what "the record
changed" should look like. The alternative is a window in which a withdrawal is
not a withdrawal.
