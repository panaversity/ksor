---
"@panaversity/ksor": patch
---

A takedown can no longer stop applying without saying so

Two ways a recorded withdrawal quietly stopped covering what it was recorded to
cover. Both were found by attacking the door before exposing it publicly, and
both were reproduced end to end against a real database.

**A denial matched nothing after the document moved.** `takedown_denylist`
records a `stable_id`, and the serving predicate matches those rows against the
documents in the generation being served — so an id that no longer exists denies
nothing. The default stable_id is derived from the file's path, which means an
ordinary rename or move of a withdrawn document was enough: search, read,
outline and the site all served it again, with no error anywhere. Adding an
`index.md` beside a withdrawn section did the same, by changing the section's id.

Serving now refuses in that state, and so does the ingest that would create it —
the same check at both ends, so a generation where a withdrawal has stopped
applying cannot be published _or_ served:

```
2 takedown(s) match no document in generation 7: knowledge/legal/notice.md, …
  why: … an id that no longer exists denies NOTHING — so a withdrawn document
  that was renamed, moved, or had an index.md added beside it is served again
  fix: point the denial at where the document lives now, or retire it
  deliberately — never guess which one, because the tool cannot tell a rename
  from a deletion
```

Refusing rather than re-pointing automatically is the whole point: a tool that
guessed would eventually guess that a withdrawn document had been deleted when
it had been renamed.

**A withdrawn section did not cover its own directory.** When a section has no
`index.md` and its documents all live one level further down, it had no file to
name its own directory, so only the subdirectory was exported to the site. A
document written directly under the withdrawn section published to `/docs` and
`llms.txt` in the window before the next ingest. The section's directory is now
derived from its own identity, which for an index-less section is its path.
