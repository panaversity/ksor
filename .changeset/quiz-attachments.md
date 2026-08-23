---
"@panaversity/ksor": patch
---

Quizzes, as governed attachments of a document.

A document in `knowledge/` may now carry `<doc>.quiz.yaml` beside its summary
and its flashcard deck. It renders at the end of the document's page, under the
deck: choose an option, see immediately whether you were right, and read the
explanation before moving on. There is no pass mark — a quiz here checks
understanding of the record, it does not certify anybody — and answers stay in
the reader's own browser.

A quiz is **part of its document, not a document**: no URL, no sidebar row, no
`llms.txt` line, no markdown twin, no search entry, and no stable id. That last
one settles a question worth being explicit about: because `ksor ingest` creates
no node for a quiz, **the answer key cannot reach the MCP surface at all**.
There is nothing for an agent to search and nothing for it to read — not by a
filter that could be forgotten, but because the row does not exist. Governance
inherits from the parent exactly as the summary and the deck already do.

**`pnpm check` and `pnpm build` refuse a quiz a reader could pass without
reading it**, naming the questions to fix:

- `ksor-quiz-answer-bias` — more than 60% of answers at one option position
- `ksor-quiz-length-bias` — picking the longest or shortest option usually wins
- `ksor-quiz-answer-run` — four or more questions in a row share an answer
- `ksor-quiz-contradiction` — an explanation calls the marked answer wrong
- `ksor-quiz-duplicate-stem` — two questions open with the same 60 characters

These are carried from the predecessor, where the same mistakes shipped and were
found by readers rather than by the project — one quiz put every correct answer
in the same position across 451 questions. There they lived in a script that was
run once; here they are part of loading the file, so a quiz that fails them
cannot be published. The ratio rules do not apply below five questions, where
enforcing a spread would mean choosing an author's answers for them.

`ksor init` ships a quiz on the seed document, so a first `pnpm dev` shows the
shape. Its own first draft was refused for putting four of five answers at
option B — the check catching exactly what it was carried for.
