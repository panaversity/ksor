---
"@panaversity/ksor": patch
---

Ingest says what the navigation rule now is, not what it used to be

0.0.15 changed how a section is judged to be navigation — shape rather than
length — and left every sentence describing it behind. So a fresh `ksor ingest`
reported:

```
not searchable: 1 of 5 chunk(s) (20%) are shorter than the navigation threshold
```

There is no navigation threshold any more, and the page in question was not
short: it was an index of links, which is exactly what the rule now catches. The
remedy was wrong in the same way — "lengthen these sections" is no longer how a
page becomes searchable, and padding a link list would not have made it one.

```
not searchable: 1 of 5 chunk(s) (20%) read as navigation rather than content
FOUND ONLY BY NAME: knowledge/index — no searchable chunk at all; a page of
links reads as navigation; give it prose of its own, or reach it by slug
```

Found by running the published artifact rather than by reading the diff. The
same stale description was corrected in the three other places it had been
copied to.
