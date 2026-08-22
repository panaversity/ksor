---
"@panaversity/ksor": patch
---

When calibration does not separate, `ksor calibrate` names the probes that held it open

A "NOT separable" verdict reads as _this corpus cannot be calibrated_, and the
report had every number needed to show otherwise while printing none of them.
Its only remedy was "widen the probe set" — when the fix is sometimes to narrow
it.

```
these out-of-corpus probes scored at or above your weakest in-corpus question:
  0.721  which vector database should I choose
  ^ look at these first. Either the record COVERS one — move it to the
    in-corpus side, because a probe the record answers is not out of corpus
    — or it genuinely does not separate, and the floor stays uncalibrated.
```

That is a real measurement, on a real 81-document book. One probe — a question
about vector databases, asked of a record containing a Postgres-and-AI chapter —
held the whole calibration open at 0.721 against a weakest in-corpus question of
0.680. It was not an out-of-corpus question at all; it was mislabelled. Moving it
separated the record immediately (`max OOC 0.676 < min in-corpus 0.680`), and the
resulting floor answered every in-corpus question and refused every genuine
out-of-corpus one.

Without that line, the conclusion drawn from the same numbers was that the record
could not support abstention — the product's headline guarantee — at all.

The advice deliberately names **both** readings, because either can be right: the
probe may be mislabelled, or the corpus may genuinely fail to separate, in which
case the floor stays uncalibrated and that is the correct outcome.
