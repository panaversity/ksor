# Example Corpus KSoR

This Knowledge System of Record is the repository's living fixture: the corpus
that `ksor` verbs are developed against, that integration tests validate, and
that future agent evals question.

It is deliberately tiny and deliberately real — every document carries the
governance frontmatter (`title`, `status`, `owner`, `provenance`) that
`scripts/check-corpus.mjs` enforces, because the fixture must exercise the same
rules adopters live under.

It is authoritative for nothing outside this repository.
