---
"@panaversity/ksor": patch
---

Adversarial coverage for the MCP door (issue #33), first slice: the governance
leak sweep and cross-replica snapshot behaviour.

**A withdrawn document must not appear in any field of any reachable response.**
The existing takedown test proves each serving arm behaves at the arms someone
thought of. This one plants an unguessable marker inside the withdrawn document
— in its body _and its title_ — and asserts the marker appears nowhere in the
serialized result, across eighteen request shapes: search by body, by marker, by
title words, at several limits, keyword search, `topOneScore`, read by
stable_id / slug / qualified path, and outline at every anchor and page. A leak
into a field the test has never heard of still fails it.

It carries a **positive control**, because every other assertion is a
not-contains and a probe that could never see the marker would pass them all
while proving nothing: each shape runs before the takedown and the ones that
testify are required to have found it first.

It also covers the subtlest case, which carries no content at all — `topOneScore`
feeds the abstention gate, so a withdrawn document scoring there would let a
record claim coverage on the strength of text it refuses to show.

**Cross-replica snapshot tokens**, listed in #33 as "documented, untested" and
since found on a real deployment: two processes with no `KSOR_SNAPSHOT_KEYS`
produce tokens neither can verify from the other, and the verdict is `invalid`
rather than `unknown_key` — the key _id_ matches and only the secret differs,
which is why the failure is invisible until you read it. Also pins rotation
(outstanding tokens survive while the old key is listed, and die when it is
dropped) and cross-deployment refusal.
