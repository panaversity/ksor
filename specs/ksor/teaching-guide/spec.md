---
status: draft
date: 2026-08-23
claim: a record is adopted by being taught — onboarding, handover, a team lead walking someone through a policy — and the person doing the teaching needs the misconceptions and the questions to ask, which are knowledge about the document that today lives only in whoever has explained it before
---

# Teaching guides

A document in `knowledge/` may carry a fourth **attachment**, named after it:

| File                  | What it is                                          |
| --------------------- | --------------------------------------------------- |
| `<doc>.teaching.yaml` | how to teach `<doc>.md` to someone who is new to it |

Everything the study-attachments spec says holds unchanged: no route, no
sidebar entry, no `llms.txt` line, no markdown twin, no search entry, no stable
id, no MCP node, no frontmatter of its own, and its parent's governance
entirely. This spec adds only what is specific to a teaching guide.

Ported from the predecessor's `TeachingGuideSheet`
(`apps/learn-app/src/components/TeachingGuideSheet/`) under decision 6. Its
data model is substantially **not** carried, and §5 says why.

## 1 · Who it is for, which is not the reader

The summary, the deck and the quiz all serve the person READING the document.
A teaching guide serves someone else: whoever has to explain the document to a
third person. Onboarding a new hire onto an expenses policy, handing a process
to another team, running an induction session.

That audience difference is the whole design:

- It is **not** in the study-aids region at the end of the page. That region is
  what a reader does after reading, and a teaching guide is not for them.
- It opens from a control in the page's own action row, beside the markdown
  export — the row that already holds "things about this document rather than
  the document".
- It renders in a **sheet**, so it never displaces the document. A teacher
  reads the guide ALONGSIDE the prose, which is the predecessor's own framing
  and the reason it chose a sheet rather than a tab.

## 2 · Why this is knowledge, and belongs in the record

The obvious objection is that a teaching guide is site furniture. It is not,
and the test is critical rule 1: could it live anywhere else and still be
true?

"The three misconceptions people have about this policy" is a fact ABOUT the
policy, discovered by whoever has explained it twenty times. Today it lives in
that person's head and leaves when they do. Putting it in the record makes it
reviewable in a PR, versioned with the document it explains, and withdrawn when
the document is withdrawn — which is the same argument the summary made, applied
to a different reader.

What it must never become is a second source. A guide may only say what its
document says, plus how to teach it. A guide asserting a rule the document does
not contain is a claim nothing governs.

## 3 · The authored shape

```yaml
teaching:
  title: Teaching the approvals policy
  audience: New managers, in their first week
  duration: 20 minutes
prerequisites:
  - Has read the expenses overview
objectives:
  - Can state the approval threshold without looking it up
  - Can name who approves when the requester is the manager
key_points:
  - Two approvers are required above the threshold, always
misconceptions:
  - text: That the threshold is per-item rather than per-invoice
    instead: It applies to the invoice total, including tax
discussion:
  - Where would this policy be ambiguous for a contractor?
check:
  - Ask them to walk through a 900-unit purchase end to end
tips:
  - Use a real invoice from last quarter rather than an invented one
```

Every key except `teaching.title` is optional, and a guide carrying only
`key_points` is a legitimate guide. `misconceptions` takes either a plain
string or a `{text, instead}` pair — the pair exists because "what people get
wrong" is only half a teaching note; the correction is the other half, and an
author who has it should have somewhere to put it.

## 4 · No pedagogy is ratified

`objectives` are prose. There is no Bloom level, no proficiency enum, no
DigComp area, and no `cognitive_load.new_concepts` count.

An adopter running an accredited curriculum may write `level: A2` as free text
on an objective and the site will render it as a label. What ksor will not do
is VALIDATE it, because validating an enum means choosing a taxonomy, and a
knowledge system of record has no business ratifying a theory of learning. The
predecessor could: it is a curriculum, and its taxonomy is part of its product.
Here the same fields would be an unenforced vocabulary that looks governed.

## 5 · Not carried, and why

1. **The frontmatter model.** The predecessor reads all of this from the
   lesson's own YAML frontmatter — roughly ten new keys with nested objects.
   ksor's frontmatter is a CLOSED key set the checker refuses additions to,
   deliberately, and a document's frontmatter is where its GOVERNANCE lives.
   Pedagogy is not governance. An attachment keeps the document's frontmatter
   exactly as it is.
2. **`skills[]` with Bloom / DigComp / proficiency, and `cognitive_load`.** §4.
3. **`session_group` / `session_title` / `lesson_type`.** These place a lesson
   in a course. A KSoR has an `order:` and a folder tree, and no sessions.
4. **`differentiation.extension_for_advanced` / `remedial_for_struggling`.**
   A real idea, but it presumes a graded cohort. The same value is available as
   an ordinary teaching tip without the framing.
5. **`TeachMePanel`** — the AI tutor chat next to it. `useStudyModeAPI.ts` calls
   a `study-mode-api` backend; the site is a static export with no backend, and
   decision 7 fixes it as preview and review. Not portable, and not attempted.

## 6 · The visibility limitation, stated rather than discovered

An attachment inherits its parent's tier EXACTLY. So a public document cannot
carry an internal teaching guide, and there is no key that would let it.

This is the same constraint the summary and the deck already carry, and it is
load-bearing rather than an oversight: a per-attachment tier would be a second
governance surface on a thing that deliberately has no id, and the first time
it disagreed with its parent the record would be publishing a restriction it
was not enforcing. An adopter who needs a private guide for a public document
writes it in a second record, which is the same answer the record gives for
private documents generally.

## 7 · Acceptance

1. `<doc>.teaching.yaml` opens from the document's action row and renders in a
   sheet, on its document's page and nowhere else in the export.
2. A document without one shows no control at all — presence-driven, like the
   deck and the quiz.
3. The parent's `/md/` twin, `llms.txt` and `llms-full.txt` are byte-identical
   with and without the guide present.
4. `ksor ingest` creates no node; no `stable_id` resolves to one.
5. A restricted parent's guide appears in 0 files of a public build, against a
   positive control at its own tier.
6. An orphan refuses `ksor-attachment-orphan`; one declaring frontmatter
   refuses `ksor-attachment-frontmatter` — the existing class rules.
7. A guide whose every section is empty is refused: it would render a control
   that opens an empty sheet.
8. The sheet is reachable and dismissable by keyboard, and its content is in
   the server-rendered HTML rather than fetched.

## 8 · Out of scope

The AI tutor panel (§5.5), any per-attachment visibility (§6), any validated
pedagogical taxonomy (§4), and progress tracking for a teacher — a guide is
read, not completed.
