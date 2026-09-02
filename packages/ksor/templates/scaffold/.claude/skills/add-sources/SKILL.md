---
name: add-sources
description: Turn what the owner has into governed knowledge in knowledge/ — a document, a page, pasted text, notes, or something nobody ever wrote down that they tell you. Use when the owner shares material to add, says "add this to the knowledge base", asks how to get existing content in, or wants to write down what they know from memory with no source to hand. Not for editing the site.
metadata:
  version: "2.0.0"
---

# Add sources

Getting knowledge into the record is the everyday work of this project. The
rules that make it _governed_ are in `AGENTS.md` → "Writing knowledge" (shape,
frontmatter, audience, `draft` until the owner approves, copy values exactly,
never invent). This file is the ACT: how a source becomes a document that
passes those rules, whatever kind of source it is.

## The source is one of two kinds — and usually both

**A file** — PDF, Word, slides, HTML, a Notion export, pasted text — is
knowledge that already exists somewhere. Your job is to move it without losing
anything: convert it, structure it, and prove every load-bearing value survived.

**A person** — "it's just how we do it" — is knowledge that exists nowhere
yet. Your job is to draw it out by asking, write it as the record and not as a
transcript, and record only what they confirm.

A real owner has both: the policy PDF, and the exception everyone knows that
the PDF never mentions. So the person step runs EVERY time, after the file:
"what does this not cover?" is the question that finds the pages nobody wrote.

## When the source is a file

1. **Extract the text first, into a scratch file outside `knowledge/`.** The
   extraction is what you convert from and what you verify against, so it has
   to be a file you can grep, not something you remember reading:

   | format                   | extractor                                                           |
   | ------------------------ | ------------------------------------------------------------------- |
   | PDF                      | `pdftotext -layout in.pdf /tmp/in.txt` (poppler)                    |
   | docx / odt / html / epub | `pandoc in.docx -t gfm -o /tmp/in.md`                               |
   | docx on macOS            | `textutil -convert txt in.docx -output /tmp/in.txt` (built in)      |
   | anything                 | `markitdown in.pdf > /tmp/in.md`, if installed                      |
   | Notion / Obsidian export | already markdown — no extraction needed; the file IS the extraction |

   None on `PATH`? Read the file directly (your Read tool opens PDFs) and say so
   in your report — there is then no extraction to verify against, and step 5
   degrades to re-reading the source by eye. That is a weaker check, and the
   owner must be told it was the check that ran.

   **Empty extraction — whitespace, form-feeds, nothing — means the PDF has no
   text layer.** Stop and tell the owner: "This is a scanned image. I can read it
   as a picture, but I cannot promise the numbers in it are right, and a wrong
   threshold in a system of record is worse than a missing page. Give me a text
   PDF, or paste the section you need." Do not OCR it and hope.

2. **Decide the shape of the RECORD, not of one file.** A 200-page manual is not
   one document. One document per topic — the unit someone would ask a question
   about — placed where its path is the identity it should have, with `order:`
   set to reading order. Show the owner the proposed tree before writing it.

3. **Convert to CommonMark a person would have written.** Real headings from
   the document's own structure (never an `# h1` — the title is the frontmatter),
   real lists, real tables; images extracted and placed beside the document
   with relative links. Strip page furniture: running headers and footers, page
   numbers, "Page 4 of 12", the table of contents. Keep the source's own words
   for anything load-bearing.

4. **Name the source precisely** in `sources` — a URL where one exists,
   otherwise the descriptor that governs ("Finance policy manual §4.2, 2025
   edition"; "internal docs" governs nothing) — and cite it from the claim with
   a footnote whose label is that source's `id`.

5. **Verify — do not trust yourself.** Run the shipped check against the
   extraction from step 1:

   ```sh
   node .agents/skills/add-sources/verify.mjs /tmp/in.txt knowledge/<path>.md
   ```

   It lists every load-bearing token in the document's body — numbers, dates,
   thresholds, codes, capitalised names — that does not appear in the
   extraction. Each one is either a value you changed (fix it, verbatim) or a
   value you introduced (delete it, or turn it into an `Open question:` line
   for the owner). A value that passes was in the source; nothing more is
   claimed. Frontmatter is exempt, because its title and description are your
   words by design.

## When the source is a person

1. **Ask, one question at a time, in their words.** Who triggers this? What
   happens first, then next? Who has to approve, and at what threshold? What
   goes wrong, and what is the exception? Follow up until each answer is
   concrete enough that someone who was not in the room could act on it —
   "what would someone actually ask this?" gets further than "define the
   boundary".

2. **Draft as the record, not as a transcript.** One document per topic. Their
   sentences, tightened — never your inference about what they must have
   meant. Anything they did not say, or said they were not sure of, becomes an
   `Open question:` line in the document. It does not become prose.

3. **The source is the conversation, and it is named like any other.** No
   `provenance:` key exists; the attestation goes in `sources`:

   ```yaml
   sources:
     - id: ops-interview-2026-08-21
       title: Interview with J. Smith, Head of Operations
       resource: "Interview with human:jsmith (Head of Operations), 2026-08-21T10:00:00Z, conducted by human:you"
   ```

   Who, their role, the instant, and who asked. That is a claim nobody can
   check against a file, and the pull request that adds it is the only thing
   standing behind it — say so if the owner asks what "verified" would mean
   here. No transcript is kept: raw unreviewed speech does not belong in a
   governed record, and the checker refuses a `.txt` there anyway.

4. **Two people describe one process differently — surface it, never smooth
   it.** Two cited statements, each with its own footnote, and the
   disagreement flagged to the owner. Which one becomes `stable` is an
   approval, not an edit.

## Finish — every batch, either kind

- `pnpm check`, and obey what it prints.
- `ksor build`: it regenerates every folder's `index.md` and writes the lock.
- **Read it back on the site.** `pnpm dev` renders the real page, drafts
  marked; that page is what the owner confirms against, not a message in a
  terminal. "Their words, tightened — never your invention" is the standard,
  and it is theirs to say whether you met it.
- **Then ask them to approve it — and write down what they said.** A draft
  reaches no machine surface: no `llms.txt`, no `/md/` twin, nothing for an
  agent to cite. Until the owner says "approved" and you record
  `ksor.approval: { by: <their handle>, at: <now> }` with `status: stable`,
  the record still publishes nothing of theirs. Never record an approval
  nobody gave.
- Commit the documents, the indexes and the lock together.
