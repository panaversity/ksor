---
"@panaversity/ksor": patch
---

Ingest names the real reason it could not record a commit

Every first ingest of a freshly scaffolded project printed "knowledge/ is not in
a git repository". That is false: `ksor init` runs `git init`, so the repository
exists — it simply has no commit yet, and `rev-parse HEAD` fails with "unknown
revision" rather than because nothing is there. The reader was sent to `git
init`, which they had already run, in the one message that decides whether an
answer can be traced back to a reviewed commit.

Three different states were collapsing into that one sentence, and each has a
different next command:

```
knowledge/ is in a git repository with no commits yet …
  fix: commit the record (git add knowledge && git commit) and re-run

knowledge/ is not in a git repository …
  fix: git init, commit the record, and re-run

git is not installed …
  fix: install git, or pass --source-commit <sha> if the record is versioned elsewhere
```

Verified on a real scaffold: the fresh case prints the first, and committing the
record turns the next ingest's `source:` line into an actual SHA.
