---
"@panaversity/ksor": patch
---

A passage a reader must not miss can now be a callout. Write GitHub's alert
syntax — a blockquote whose first line is `[!WARNING]` — and the site renders a
styled panel tinted with that kind's own colour:

```markdown
> [!TIP]
> Climb one rung at a time, and only when something has gone wrong without it.
```

It stays a plain blockquote everywhere else the record is read, carrying a
visible label, and `/md/` and `llms-full.txt` keep the author's blockquote
rather than this site's component.

Not `:::warning`: a dialect renders as literal punctuation everywhere outside
this site.
