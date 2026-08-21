---
"@panaversity/ksor": patch
---

A provider outage is never reported as "the record does not cover this"

When the embedding provider is down, the vector arm does not run — so an empty
result says nothing about coverage. It says we could not look. That distinction
was fixed once for records with a calibrated floor, and the condition was the
bug: it left the case out that matters most.

An **uncalibrated** record is the default state of every fresh scaffold. There
the emptiness came from the keyword arm, which abstains when it returns no rows
— and it returns nothing for almost every natural-language question, because
`websearch_to_tsquery` ANDs its terms (measured 12 of 12 on real questions). So
during any outage an uncalibrated record answered every question with
`abstained: true`, while the tool description instructs the agent to state that
as fact and never fall back on its own knowledge.

It reached this release because the existing test asked a question the keyword
arm could answer, so the degraded path served real hits and looked correct. Ask
the way a person asks and it did not. That case is now covered.

Found live against the published 0.0.12 with an invalid key — the same state a
rejected CI key had produced that morning, which is how likely this is.

**`ksor calibrate` also stops blessing a floor on far-domain evidence alone.**
The built-in out-of-corpus probes are all far-domain — dinner, taxes, boiling an
egg — and a shipped set cannot be scope-adjacent, because adjacency depends on a
corpus it has never seen. Far-domain probes score low against anything, so the
margin comes out inflated. Measured on one record, changing only the probe set:
built-ins reported "separable, margin 0.072" and recommended a floor; eight
scope-adjacent near-misses reported "NOT separable, margin -0.030" — and that
floor then answered six of the eight live, with citations. The tool already knew
to say "widen the probe set", but said it only on the not-separable branch, which
is when it is least needed. It now says it whenever the built-ins are used.
