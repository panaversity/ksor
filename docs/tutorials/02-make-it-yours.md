# Make it yours — your knowledge, your record, in about half an hour

You finished [hello world](./01-hello-world.md) with a record that publishes
six documents: five samples about KSoR itself, and one refund policy you wrote.
By the end of this, the samples are gone, every document is about **your**
organisation, every one of them was approved by a person with a name, and the
tool that approved the samples has no authority left over anything.

Along the way you will do the two things a system of record exists for:
bring in knowledge that already lives in a file without losing a single number,
and write down knowledge that has only ever lived in someone's head — and see
the record refuse, twice, on your behalf.

Every command and every output below was run on 2026-09-02 and pasted as it
appeared, with one convention: a `build_id` is shown as `sha256:…`, because it
hashes the toolchain version along with the record and yours will not match.
The document counts and everything else will.

**You need:** the `handbook` from hello world, and one thing of yours — a
policy PDF, a Word document, a page — or nothing but what you know. For a PDF,
[`pdftotext`](https://poppler.freedesktop.org/) (`brew install poppler`,
`apt install poppler-utils`) makes the check in step 2 mechanical; without it
your agent reads the PDF directly and says so.

Each step gives you a prompt for your coding agent, and the same work under a
**Do it yourself** fold.

---

## Where you are

```sh
cd handbook
npx ksor build
```

```
ksor build: 6 document(s), 6 admitted to a machine surface at 2026-09-02T04:28:55.709Z
```

Six published. One is yours, approved by `human:you` — the placeholder the
scaffold ships. That placeholder is about to matter.

## 1. Tell the record who you are

> **Ask your agent:**
> Get me started — run the intake interview.

Three questions, asked one at a time, in your words: what this record is the
final word on, what sits just outside it, and who signs off on a document. Then
it writes `instance.md` with you, and replaces `human:you` in the policy with
your real handle.

<details><summary>Do it yourself</summary>

Answer the three questions in `instance.md`'s body, then in
`.ksor/governance.yaml` replace `human:you` with your handle in **both**
authority lists — and leave `ksor-starter/…` where it is, for now:

```yaml
approval_authorities:
  - actors: [human:priya, ksor-starter/0.0.55]
takedown_authorities:
  actors: [human:priya]
```

Give the handle a printed name in `.ksor/people.yaml`:

```yaml
version: "0.1"
people:
  "human:priya": Priya Patel
```

</details>

**Now the placeholder matters.** Your refund policy is approved by `human:you`,
and `human:you` just stopped being anyone the policy names. Build it in that
state and the record refuses — its own first document, by name:

```
error: ksor-approver-unauthorised
ksor build: 1 problem(s) — nothing written:

  knowledge/refund-policy.md
```

That is correct: an approval by an actor the policy does not authorise is
exactly what a system of record must not publish. It is also the same person.
So the interview re-attributes every act recorded under `human:you` to your
handle in the same change — approver, generator, owner — and the record is
green again:

```
ksor build: 6 document(s), 6 admitted to a machine surface at 2026-09-02T04:28:56.671Z
```

Commit it. The record is now Acme's, with the samples still in it.

## 2. Bring in something that already exists

Put a file of yours in the project — `src/expense-policy.pdf` here, a
two-page finance policy with page numbers and running headers, the kind of
thing every organisation has.

> **Ask your agent:**
> Here is our expense policy, `src/expense-policy.pdf`. Add it to the record
> under `finance/`, and tell me what it leaves open.

Watch what it does, because this is the point. It does not read the PDF and
write from memory. It **extracts** the text to a scratch file, converts from
that, and then runs a check that every number, date and name in what it wrote
appears in the extraction.

<details><summary>Do it yourself</summary>

Extract — outside `knowledge/`, which holds markdown and images only:

```sh
pdftotext -layout src/expense-policy.pdf /tmp/expense.txt
```

Write `knowledge/finance/expense-policy.md` from `/tmp/expense.txt`: the
document's own headings as `##`, the page furniture ("Page 1 of 2") dropped,
and a `sources` entry that names the manual precisely:

```yaml
---
type: Policy
title: Expense policy
description: What an employee may claim, the limits, and who approves it.
status: draft
order: 1
sources:
  - id: fin-2026-s7
    title: Finance manual §7, 2026 edition
    resource: "Finance manual §7, 2026 edition (expense-policy.pdf)"
ksor:
  owner: "human:priya"
  audience: [public]
---
```

`type: Policy` is a reserved type, so `sources` and `ksor.owner` are required
— that is what makes it one. Cite the source from the body with a footnote
`[^fin-2026-s7]`.

Then verify, against the extraction:

```sh
node .agents/skills/add-sources/verify.mjs /tmp/expense.txt knowledge/finance/expense-policy.md
```

</details>

Here is that check running on the document as it was first written:

```
$ node .agents/skills/add-sources/verify.mjs /tmp/expense.txt knowledge/finance/expense-policy.md
14
EXIT=1
```

One line: `14`. The manual says claims are paid within **10** working days;
the document said 14. Nothing else about the page was wrong — the headings,
the thresholds, the names all matched — and a reader would never have noticed.
Fix it, and:

```
$ node .agents/skills/add-sources/verify.mjs /tmp/expense.txt knowledge/finance/expense-policy.md
EXIT=0
```

What the check promises is narrow and worth knowing exactly: every number,
date and capitalised name in the body is in the source. It cannot see a
sentence that was left out, and it cannot tell a paraphrase from an invention.
That is what reading it back on the site is for.

```
ksor build: 7 document(s), 6 admitted to a machine surface at 2026-09-02T04:28:57.523Z
```

Seven documents. Six admitted — the new one is a draft, and a draft reaches no
machine surface.

**Then the question that finds the missing pages.** Your agent should ask,
once the file is in: _what does this not cover?_ Every organisation has an
answer. Ours was late claims.

## 3. Bring in something nobody ever wrote down

> **Ask your agent:**
> Nobody ever wrote down how we handle a late expense claim. Interview me and
> write it up.

Now it drives. Who decides a late claim is late? What happens then? Who
approves it, and is a director different? What is the exception? It follows up
until someone who was not in the room could act on the answer — and it writes
your sentences, tightened, never its own inference about what you must have
meant.

<details><summary>Do it yourself</summary>

Write `knowledge/finance/late-claims.md`. The source is the conversation, and
it is named like any other source — who, their role, when, and who asked:

```yaml
sources:
  - id: priya-2026-09-02
    title: Interview with Priya Patel, Head of Finance
    resource: "Interview with human:priya (Head of Finance), 2026-09-02T10:00:00Z, conducted by human:you"
```

Anything you were not sure of does not become prose. It becomes a line the
reader can see:

```markdown
Open question: is there an absolute cut-off after which a claim is never paid?
Priya thought there was one "around six months" but did not want that written
down without checking.
```

</details>

```
ksor build: 8 document(s), 6 admitted to a machine surface at 2026-09-02T04:28:58.002Z
```

Eight. Still six admitted. Two drafts are waiting on you.

That `Open question:` line is the honest shape of institutional knowledge. The
record now says _exactly_ what Priya was sure of, and says out loud what she
was not — where a wiki page would have quietly written "six months" and been
cited for years.

**If a second person tells it differently**, both statements stay, each with
its own footnote, and the disagreement is flagged to you. Which one becomes
`stable` is a decision someone with approval authority makes — an act with a
name on it, not an edit.

## 4. Read it back, then approve

> **Ask your agent:**
> Show me both on the site.

`npm run dev`, and open the two pages. They are marked as drafts. This is the
review surface — the actual page, not a message in a terminal — and it is
where you decide whether the record says what you meant.

> **Ask your agent:**
> Approved — record both as me.

<details><summary>Do it yourself</summary>

On each document, `status: stable` plus the two acts publishing requires:

```yaml
status: stable
generated: { by: "human:priya", at: 2026-09-02T09:00:00Z }
ksor:
  owner: "human:priya"
  audience: [public]
  approval: { by: "human:priya", at: 2026-09-02T11:00:00Z }
```

Then commit and build.

</details>

```
ksor build: 8 document(s), 8 admitted to a machine surface at 2026-09-02T04:28:58.600Z
source: a05bfee025c3bca26fa07bb099db4433fdfcf9a5
  wrote build.lock.json — build_id sha256:…
```

Eight admitted. Both approvals carry your handle and the instant you gave them,
and `people.yaml` prints your name on the page.

## 5. Retire the samples

Five documents about KSoR are still published on Acme's record. Now that
something of yours is in, they can go.

> **Ask your agent:**
> Delete the five starter documents, then take the tool that approved them out
> of the policy.

<details><summary>Do it yourself</summary>

```sh
rm -r knowledge/what-is-a-ksor.md knowledge/what-is-a-ksor.summary.md \
      knowledge/governance-ladder.md knowledge/surfaces
npx ksor build
```

</details>

```
ksor build: 3 document(s), 3 admitted to a machine surface at 2026-09-02T04:28:59.083Z
source: a05bfee025c3bca26fa07bb099db4433fdfcf9a5 (dirty) — an input differs from that commit, so it does not contain the bytes this build published.
```

Three documents, all yours. Read the second line: the build says its `source`
commit does not contain what it just published, because you have not committed
the deletion. That is provenance being precise rather than polite. Commit, and
it will name a commit that does.

Two things to know before you do this in anger. **The order mattered**: a
record is never empty, so deleting the five before writing one of yours refuses
`ksor-record-empty` and writes nothing. And **the starter actor stays until the
last sample goes** — it approved them, and a policy that stops naming it while
one is still published refuses that document, exactly as `human:you` did in
step 1.

Now the last sample is gone, so:

<details><summary>Do it yourself</summary>

In `.ksor/governance.yaml`, remove `ksor-starter/…` from inside the list —
not the whole line, which would take you with it:

```yaml
approval_authorities:
  - actors: [human:priya]
```

</details>

```
ksor build: 3 document(s), 3 admitted to a machine surface at 2026-09-02T04:28:59.663Z
source: f22879939064c74c7f38b79d713324cc39f28171
  wrote build.lock.json — build_id sha256:…
```

Committed, clean, and nothing in this record was approved by anything but a
person.

## What you have

```
knowledge/
├── finance/
│   ├── expense-policy.md     ← converted from a PDF, every value verified
│   └── late-claims.md        ← elicited, with one honest open question
└── refund-policy.md          ← from hello world, re-attributed to you
```

Three documents, three approvals with names on them, one source that is a file
and one that is a person — both named precisely enough that someone could go
and check. `llms.txt` and the door serve exactly these and nothing else.

Two refusals did work for you: `ksor-approver-unauthorised` when the policy
and a document disagreed about who may approve, and `ksor-record-empty` if you
had cleared the shelf before stocking it. Neither is an error. Each is the
record declining to publish something it could not stand behind, which is the
whole job.

**What is not done yet.** The abstention floor is still unmeasured, so the
door answers questions outside the record instead of declining them — that is
tutorial 4, with the served rung. And `late-claims.md` has an open question
with Priya's name on it. She should answer it, and the answer should arrive the
way everything else did: her words, a new approval, a new build.

---

## Reference

| command                                                  | what it does                                            |
| -------------------------------------------------------- | ------------------------------------------------------- |
| `pdftotext -layout in.pdf /tmp/in.txt`                   | extract a PDF's text to verify against                  |
| `pandoc in.docx -t gfm -o /tmp/in.md`                    | the same for Word, HTML, ODT, EPUB                      |
| `node .agents/skills/add-sources/verify.mjs EXTRACT DOC` | every number, date and name in DOC's body is in EXTRACT |
| `npm run check`                                          | the record checker — every refusal names its fix        |
| `npx ksor build`                                         | check the record, regenerate indexes, write the lock    |

`docs/status.md` is authoritative on what the current release supports. If it
and this tutorial ever disagree, it wins.
