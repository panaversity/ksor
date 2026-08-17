---
name: technical-writing
description: Corpus and docs authoring for this repo — the source-of-truth hierarchy, governed-document frontmatter, and the style rules. Use when writing or editing anything under packages/ksor/docs/, workbench/*/knowledge/, docs/, or user-facing prose in README files. Not for code comments.
metadata:
  version: "1.0.0"
---

# Technical writing

ksor's product is governed knowledge; its own prose is held to the product's standard. Two rules
carry everything: **never write the present tense about behaviour that does not run**, and **one
fact, one file — everywhere else is a pointer.**

## The source-of-truth hierarchy

Do not rely on training data for claims about ksor's behavior. In order:

1. **Source, types, and tests** — what the code actually does.
2. **CLI output** — run the real command and read what it prints.
3. **Existing docs** (`packages/ksor/docs/`, `docs/status.md`) — already-reviewed truth.
4. **Merged PRs and the changelog** — what shipped, and when.
5. **`research/` plans** — proposed intent, NOT shipped behavior. Cite as "planned", never as
   "does".
6. **Issues and support threads** — evidence of problems only, never evidence of behavior.

For claims about _someone else's_ system (a library, an API, a spec): fetch the current official
documentation before writing; do not recall it.

## Governed documents

Corpus documents (`workbench/*/knowledge/`) carry `title`, `status`
(draft | review | approved | superseded), `owner`, and `provenance` (the actual sources, named
precisely). Product docs (`packages/ksor/docs/`) carry `title` and `status`.
`pnpm check:corpus` enforces this and its errors teach the fix — run it before handing off.

Provenance rules (from the predecessor's rules, which cross unchanged):

- Name the source in the document; copy load-bearing values exactly.
- A claim that cannot be traced does not go in.
- Two disagreeing sources stay two sources — never smooth them into one.
- Replaced documents are marked superseded, never deleted.
- Provenance proves who-said-when, not correctness. Never sell one as the other.

## Style

- Reader-first: lead with what the reader needs to do or know; context after.
- Every error message and every warning states what is wrong, why the rule exists, and how to fix
  it.
- No aspirational present tense: "ksor validates…" is a lie until the validator runs; write
  "will validate" or say the status plainly.
- `docs/status.md` is the only authority on what is built. Any document your change makes false is
  corrected in the same commit.
