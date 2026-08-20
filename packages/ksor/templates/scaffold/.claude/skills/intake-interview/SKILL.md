---
name: intake-interview
description: The first conversation with the owner of this Knowledge System of Record — six questions that define what it is authoritative for and who may read it, then write instance.md together. Use when the owner asks to set up, configure, or "get started with" this project, when instance.md still contains its scaffold placeholder text, or when the scope of the corpus is unclear.
metadata:
  version: "1.3.0"
---

# Intake interview

`instance.md` is the identity of this Knowledge System of Record, and its
prose IS the agent surface's system prompt (`ksor serve` wires it into the MCP
server's instructions). Do not draft it from guesses — interview the owner, one
question at a time, and write down what they actually say.

## The six questions

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
6. **Audiences** — "Does every reader of this record see every document? If
   not, what are the audiences, from most public to most restricted?" A yes
   is the common answer and the whole answer: write no `audiences:` key and
   nothing about the project changes. A list means writing it into
   `instance.md`'s frontmatter — ordered least- to most-restricted with
   `public` first, plus `default_visibility:` naming the audience a document
   takes when it says nothing (there is no safe guess, so the checker
   requires it). Tell the owner what the key does and does not do:
   documents carry `visibility:` and builds are made per audience, but
   anyone who can clone the repository reads everything in it — if someone
   must not read a document and can clone, that document belongs in a
   different repository.

## Then write

- Rewrite `instance.md`'s body from the answers: first the `# H1` — the
  record's **display title**, the human name every page will lead with
  ("Acme Operations Handbook", not the slug) — then the authority sentence,
  boundary, audience, and strictness — plain prose, written for a reader
  who must act on it. Leave the identity frontmatter keys alone; two things
  are written there when they apply: an audience model from question 6, as
  `audiences:` (a list) and `default_visibility:` (`pnpm check` holds the
  record to it from that moment on); and — only when the owner stands up the
  served MCP rung — the `database:`/`embedding:`/`retrieval:` blocks (see
  `AGENTS.md` → "Serving to agents"; that is a later climb, not part of this
  interview). The strictness answer from question 5 is the intent behind the
  `retrieval.vector_floor` on that climb, measured by `ksor calibrate` — capture
  it in the prose now so it is ready.
- Restart `pnpm dev` afterwards so the site picks the new title up, and
  show the owner their name on the page.
- Offer to capture the source list from question 4 as the first real
  documents (the add-sources skill takes it from there).
- Read the result back to the owner and get an explicit yes before
  finishing. Their words, tightened — never your invention.
