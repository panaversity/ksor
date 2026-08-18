---
name: intake-interview
description: The first conversation with the owner of this Knowledge System of Record — five questions that define what it is authoritative for, then write instance.md together. Use when the owner asks to set up, configure, or "get started with" this project, when instance.md still contains its scaffold placeholder text, or when the scope of the corpus is unclear.
metadata:
  version: "1.0.0"
---

# Intake interview

`instance.md` is the identity of this Knowledge System of Record, and its
prose will one day be the agent surface's system prompt. Do not draft it from
guesses — interview the owner, one question at a time, and write down what
they actually say.

## The five questions

Ask these one at a time; follow up until each answer is concrete enough to
act on:

1. **Authority** — "What should this record be the _final word_ on? Finish
   the sentence: when someone here disagrees with this corpus, the corpus
   wins about ___."
2. **Boundary** — "What is explicitly _outside_ it — near-miss topics people
   will ask about that this record should refuse rather than guess at?"
3. **Audience** — "Who reads it — people, agents, both? In what situations,
   making what decisions?"
4. **Sources** — "Which existing materials are authoritative inputs (name
   the actual documents, systems, people), and which are explicitly _not_
   trusted?"
5. **Strictness** — "When the record doesn't cover a question, how firmly
   should it decline? ('Not in this corpus' is a correct answer here —
   confirm the owner wants that behavior and where they want it softened.)"

## Then write

- Rewrite `instance.md`'s body from the answers: the authority sentence
  first, then boundary, audience, and strictness — plain prose, written for
  a reader who must act on it. Do not touch the frontmatter keys.
- Offer to capture the source list from question 4 as the first real
  documents (the add-sources skill takes it from there).
- Read the result back to the owner and get an explicit yes before
  finishing. Their words, tightened — never your invention.
