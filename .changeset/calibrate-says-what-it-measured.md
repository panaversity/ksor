---
"@panaversity/ksor": patch
---

`ksor calibrate` states what its measurement is worth, not just its result

The default door synthesizes in-corpus questions by asking a model to write one
FROM each sampled passage, then scores those questions against the corpus that
contains the passage. They share vocabulary a reader's question will not, so the
in-corpus distribution sits higher than real traffic will and the separation the
run reports is an UPPER BOUND. The `--queries-file` door carried a caveat about
its own distribution; the default door — the biased one — carried none.

Found live: a real record calibrated this way reported min in-corpus 0.682
against max out-of-corpus 0.580 and recommended `vector_floor: 0.631`. Questions
the record demonstrably answers then scored 0.530 to 0.606 — every one below the
recommended floor. Pasting it would have made the record abstain on questions
whose answers it had just cited, which is the failure abstention exists to
prevent, arrived at from the other side.

The block now carries that caveat, and prints the one number it always left the
reader to work out: the separation margin, with the probe counts behind it. A
margin of 0.054 over six in-corpus and four out-of-corpus probes is a different
claim from the same margin over sixty, and both figures were already on the
report without ever reaching the page. The mathematics and the recommended value
are unchanged.

It also names the generation it measured. With nothing pinned — the ordinary
case, calibrating what is being served — the report carried no generation at
all, so the provenance comment beside a pasted floor read `on generation unknown
(no generation pinned)`. A floor is a threshold inside ONE generation's embedding
space, and the query that counts the chunks had already resolved which one.

`runCalibration` had no test of any kind; it has one now, against real Postgres.
