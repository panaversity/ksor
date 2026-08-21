---
"@panaversity/ksor": patch
---

`ksor ingest` says how much of the record no search will return

A chunk shorter than the navigation threshold is stored, embedded and readable —
and excluded from every retrieval arm by the serving predicate. That rule exists
for a good reason: a "See also: [a] [b] [c]" block should never be a search hit.
But it decides by LENGTH ALONE, so a short _substantive_ paragraph is caught by
it too — and a policy handbook is made of short substantive statements.

Measured on a realistic five-document operations handbook with real embeddings:
**10 of 16 chunks unsearchable, and one entire document that `outline` lists and
`read` returns in full but `search` can never find.** A complete policy
statement — "Probation: six months, with a written review at three and six" —
is 191 characters, so the record treats it as navigation. The ingest line
reported a cheerful `16 chunks; embedded 16` and said nothing.

It says it now:

```
ingest: generation 1 — 2 nodes, 4 chunks; embedded 4, carried 0, failed 0
  not searchable: 3 of 4 chunk(s) (75%) are shorter than the navigation
    threshold — stored and readable, but no search returns them
  FOUND ONLY BY NAME: knowledge/onboarding:prose — no searchable chunk at all
```

This does **not** change the threshold, and nothing that was searchable stops
being so. Where that line belongs needs a gold-set measurement, which is issue
#55. What is fixed here is the silence — because the silence is what let a
record ship most of itself unfindable, and told its owner everything was fine.

The count is computed with the serving predicate's own admission test, and a db
test compares it against what the SQL actually admits: a report the database
disagrees with would be worse than none.
