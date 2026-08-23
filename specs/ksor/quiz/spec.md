---
status: draft
date: 2026-08-23
claim: a system of record is only worth what its readers actually absorbed, and a quiz whose questions are governed artifacts of their document — reviewed in a PR, inheriting the parent's tier, withdrawn with it — checks understanding of the record itself rather than of whatever a model happened to generate
---

# Quiz attachments

A document in `knowledge/` may carry a third **attachment**, named after it:

| File              | What it is                                     |
| ----------------- | ---------------------------------------------- |
| `<doc>.quiz.yaml` | a multiple-choice quiz derived from `<doc>.md` |

Everything the study-attachments spec says about an attachment holds here
unchanged: no route, no sidebar entry, no `llms.txt` line, no markdown twin, no
search entry, no stable id, no MCP node, no frontmatter, and its parent's
governance entirely. This spec adds only what is specific to a quiz.

Ported from the predecessor learn-app under decision 6
(`apps/learn-app/src/components/quiz/`, `components/GatedQuiz/`,
`scripts/quiz-audit/`). Three of its mechanisms were **not** carried and the
reasons are in §6.

## 1 · Why the answer key is safe here, for free

Issue #35 asks the sharp question directly: _"does `read` return the quiz as
text? Does an agent get the answers? Should it? A record whose answer key is
retrievable by any agent is a different product than one where it is not."_

Because a quiz is an **attachment**, ingest creates no node for it
(`plain-tree.ts`, `isAttachment`), so there is no `stable_id` to cite, nothing
for `search` to match, and nothing for `read` to return. The answer key cannot
reach the agent surface at all — not by a filter that could be forgotten, but
because the row does not exist.

This is not a claim to be re-earned per surface. It is the same single
exclusion the summary and the deck already rely on, which is the point of
having one rule (decision 24).

## 2 · Why it is not a directive

Issue #35 records the blocker: `:::quiz` needs a ratified directive grammar,
and until one exists there is no governed way to author a quiz. An attachment
sidesteps that entirely — a quiz is a **file named after its document**, not
syntax inside one, so `knowledge/` stays CommonMark and framework-free
(decision 8) with no grammar in existence. The directive grammar remains
unratified and remains worth ratifying for other reasons; it is not a
prerequisite for this.

## 3 · The authored shape

```yaml
quiz:
  title: Expense approvals
  description: Optional — one line shown under the heading.
  questionsPerRound: 10 # optional; see §4
questions:
  - question: Who approves a purchase above the threshold?
    options:
      - A second approver, independent of the requester
      - The requester's own manager, in every case
      - Any approver holding a delegated authority
      - The finance team, after the purchase completes
    answer: 0
    explanation: >
      Why this is right, and why each distractor is wrong.
    source: Approvals — thresholds
```

- `answer` is a **zero-based index** into `options`. Two to six options; the
  index must be in range. The 4-option requirement is not carried (§6).
- `explanation` is required. The predecessor's immediate-feedback model teaches
  through the mistake, and an unexplained wrong answer teaches nothing.
- `source` is optional prose naming where in the document the answer lives.
  It is **not** a citation and must not be presented as one — a citation in
  this product carries a generation (product invariant 1), and an attachment
  has no id to pin. The UI labels it "In the document", never "Source".
- No `id:` anywhere: the path is the quiz's identity, a question's identity is
  its own text — the same rule the deck follows.

## 4 · Rounds

The predecessor requires a bank of exactly 50 and shows a random 15–20, so a
retake is mostly new questions. That ratio is right and the floor is not: a
governed record's document may warrant five questions, and demanding fifty
would mean padding a returns policy with invented ones — which is the failure
this product exists to prevent.

So: `questionsPerRound` defaults to 10, and a bank at or below that size is
shown **whole, in authored order**, with no shuffle and no "new round" offer,
because there is no second round to offer. A larger bank draws a random round
and offers another. The UI states which case it is rather than leaving a
reader to infer it.

## 5 · The audit is a build refusal, not a script

The predecessor's `scripts/quiz-audit/README.md` lists what shipped and was
found **by students, not by them**: every correct answer at position A across
9 quizzes and 451 questions; explanations that dismiss their own marked
answer; the correct option systematically the longest in 40–100% of questions
per file. Its own `findings-2026-04-14.txt` still reports 88% pick-longest in
one file, which is the argument against an advisory checker — it was written,
it was run once, and the findings sat.

These checks therefore run in `pnpm check` AND in the build, the way the
attachment rules already do, and a failure refuses:

| Slug                       | Refuses when                                                  |
| -------------------------- | ------------------------------------------------------------- |
| `ksor-quiz-answer-bias`    | one option index holds > 60% of answers (bank of ≥ 5)         |
| `ksor-quiz-length-bias`    | picking the longest option would win > 60% of questions (≥ 5) |
| `ksor-quiz-answer-run`     | 4+ consecutive questions share an answer index                |
| `ksor-quiz-contradiction`  | an explanation dismisses the option the quiz marks correct    |
| `ksor-quiz-duplicate-stem` | two questions share their first 60 characters                 |

The thresholds are deliberately looser than the predecessor's (60% against
its 29–35%) because they must hold on a five-question bank without forcing
authored answers into a pattern. They are floors against the shipped bug, not
a distribution target.

`ksor-quiz-contradiction` is the one worth stating precisely: it fires when an
explanation contains a dismissal phrase naming the marked answer's own letter
or index — "option A is wrong", "A is incorrect" where `answer: 0`. It is
deliberately narrow. A broad reading of prose would refuse honest text.

## 6 · Not carried, and why

1. **The auth gate, XP, and `progress-api` submission** (`GatedQuiz/index.tsx`).
   The site is a static export with no backend, and decision 7 fixes it as
   preview and review, not an editor. A score is reader state and stays in the
   reader's browser, exactly as deck progress does.
2. **The exactly-50 / exactly-4 requirements.** §4 for 50. Four options is a
   convention from timed multiple-choice exams, not a property of a governed
   record; two to six is admitted and the audit is what protects quality.
3. **JSX authoring.** `<Quiz questions={[...]} />` in MDX is a framework file
   in the record (critical rule 2), and its 50-question literal makes a
   document unreadable in a plain markdown viewer.

One mechanism IS carried that the predecessor does not have: the audit runs on
every build rather than on request.

## 7 · Acceptance

1. `<doc>.quiz.yaml` renders in the study-aids region, after the deck, on its
   document's page and nowhere else in the export.
2. A document with a quiz and no deck renders the quiz alone; with neither, the
   region does not exist.
3. The parent's `/md/` twin, `llms.txt` and `llms-full.txt` are **byte-identical**
   with and without the quiz present.
4. `ksor ingest` creates no node for a quiz; no `stable_id` resolves to one.
5. A restricted parent's quiz appears in **0** files of a public build, against
   a positive control at its own tier.
6. An orphan quiz refuses `ksor-attachment-orphan`; one declaring frontmatter
   refuses `ksor-attachment-frontmatter` — the existing class rules, unchanged.
7. Each audit slug in §5 refuses in `pnpm check` and in `pnpm build`, with a
   message naming the question numbers.
8. Answering shows immediate feedback, the explanation, and `source` labelled
   as a location rather than a citation.
9. A bank at or below `questionsPerRound` shows whole with no new-round offer;
   a larger one draws a round and offers another.
10. Score state survives a reload and is per-reader; it is never sent anywhere.

## 8 · Out of scope

Highlights (issue #35 — reader state needing an owner decision first), the
directive grammar, any server-side scoring or cross-device progress, and
timed or graded assessment. A quiz here teaches; it does not certify.
