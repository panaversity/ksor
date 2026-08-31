---
"@panaversity/ksor": patch
---

The site prints natural names for the actors a record cites, where the record
declares them.

A governed page led with a slug — "Owner · human:bashiraziz" — on every owner,
trust, approval and withdrawal line. `.ksor/people.yaml` maps an actor to the
name a page should print, and the site substitutes it at render time. An actor
with no entry renders exactly as stored: no splitting, no camelCase guessing,
no derivation. A display name is the one thing in a governance line that cannot
be computed — `bashiraziz` is equally "Bashir Aziz" and "Bashira Ziz" — so the
owner is its only source.

A MAP keyed by the whole identifier, not a list of names a handle is derived
from. The derivation could only ever match a handle that IS somebody's squashed
full name, so `human:ciso`, `human:audit-lead` and `human:mjs` — most of the
actors in a real record — had no expressible name at all; and it collided, since
two different people can squash to one handle.

Deliberately NOT part of `.ksor/governance.yaml`. That file is the root of
authority: its key set is closed so nothing can sit there without being
enforced, and its digest is hashed into `build.lock.json` — so a display name
living there would mean correcting the spelling of somebody's name refused the
next site build as `ksor-lock-stale`. Appearing in `people.yaml` confers no
authority; it only changes what is printed, and nothing cross-checks the two
lists, because a person who leaves the authority list is still the recorded
approver of everything they approved.
