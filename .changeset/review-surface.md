---
"@panaversity/ksor": patch
---

The scaffold gains `/review` — one page listing everything in the record that
still wants a human's eyes.

Decision 7 calls the site "preview and review, not an editor". The per-page half
shipped long ago: a badged page says what state it is in. The record-level half
did not, so a reviewer asking "what needs me?" had to walk the sidebar document
by document — free on the five-document starter, and the difference between
review happening and review being skipped on a record of any size.

`/review` groups every badged document by the state the lifecycle rule already
computed — drafts, past their review date, not yet effective, deprecated — with
each one's owner and the instant that explains it. It offers no approve control
and never will: approving is `status: stable` with an actor, in a pull request.
On a built site it cannot list drafts, because a build excludes them from every
surface, and the page says exactly that rather than showing an empty list.

It enumerates the same staged, audience-filtered set the sidebar reads, so it
cannot list a document the rest of the site hides — asserted in both directions
by the visibility canary, which now carries a badged restricted document that
must never appear and a badged public one that must.
