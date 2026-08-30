---
"@panaversity/ksor": patch
---

**Two audit rows were missing the fact that makes them auditable.**

`retrieval_log` exists so an operator can say what an act was allowed to see and
what it answered from. Two rows could not answer that:

- **`outline_served` recorded no generation.** Its two siblings,
  `similarity_searched` and `content_served`, both pin one — so the single act
  that hands an agent the SHAPE of the record was the one that could not be
  joined to the publication it described. The projection carried no generation
  to write, so this is a column rather than an extra query: `walk` already
  selects it, and `OUTLINE_COLUMNS` moves 9 → 10 under the same width guard that
  exists because a narrower fixture once hid a truncated projection.
- **An ANSWERED search recorded no `top_cosine`.** The abstained row has always
  carried it, so the ledger held the deciding score only for queries the gate
  REFUSED — precisely the half that cannot show a floor drifting as a record
  grows. Both rows now record what the decision turned on, whichever way it
  went.

An empty outline still records NULL, deliberately: it served no row from any
generation, which is the same reason `search_abstained` records NULL when
nothing matched.

**And `cleanCut` is deleted.** It was exported and documented as the tool the
search budget uses to trim an overflowing hit — in the present tense, for a
caller that has never existed. It came from the predecessor's grain-expansion
path, a feature ksor deliberately never carried, so it was a mechanism brought
across without the purpose it existed for.
