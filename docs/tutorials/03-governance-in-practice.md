# Governance in practice — who may read, who decided, and what the record refuses

You finished [Make it yours](./02-make-it-yours.md) with three documents of
your own, each approved by a person with a name. By the end of this, one is
for employees only and the public site has never seen it; one has been checked
by a second person and says so; one takes effect on a date; one has been
replaced, and its replacement says what it replaced; and one was withdrawn from
every surface through a ledger, then put back. Eleven times the record will
refuse to publish something, and each time it is right.

Every command and every output below was run on 2026-09-02 and pasted as it
appeared, with the convention from tutorial 2: a `build_id` is shown as
`sha256:…`, because it hashes the toolchain version along with the record and
yours will not match. Everything else will, except the ledger's entry ids,
which carry the instant you ran the verb.

**You need** the `handbook` from tutorial 2, and nothing else — no database,
no key. Each step gives you a prompt for your coding agent, and the same work
under a **Do it yourself** fold.

---

## Where you are

```sh
cd handbook
npx ksor build
```

```
ksor build: 3 document(s), 3 admitted to a machine surface at 2026-09-02T13:32:59.564Z
source: 3177e1bc4a3977a852ca4b5c96ea7730a09f82c6
  wrote build.lock.json — build_id sha256:…
```

Three documents, all public, all approved by `human:priya`. Now the rest.

## 1. A second audience

> **Ask your agent:**
> The late-claims procedure is for employees only. Restrict it to an `internal`
> audience, then build the public site and show me what `llms.txt` lists.

The first thing it meets is a refusal, because the record does not know what
`internal` is yet:

```
error: ksor-audience-unregistered
ksor build: 1 problem(s) — nothing written:

  knowledge/finance/late-claims.md
    problem: ksor-audience-unregistered
    why: `ksor.audience` names `internal`, which the policy's registry does not declare — an unknown identifier is a typo, and a typo reads as a restriction
    fix: use `public` or a registered audience (none registered), or register it in `.ksor/governance.yaml`
```

An audience is declared once, in the policy, before any document may name it
— a typo that silently restricted a document would hide it with nothing red.

<details><summary>Do it yourself</summary>

In `knowledge/finance/late-claims.md`, `audience: [internal]`. In
`.ksor/governance.yaml`, register it — `public` is implicit and never
declared:

```yaml
audiences:
  internal:
    description: Acme employees
```

Then `npx ksor build`, and `npm run build` for the site.

</details>

```
ksor build: 3 document(s), 3 admitted to a machine surface at 2026-09-02T13:33:26.780Z
```

Still three admitted — that count is documents admitted to _some_ viewer.
Which viewer is in the lock:

```json
{
  "path": "finance/late-claims.md",
  "status": "stable",
  "audience": ["internal"],
  "admitted": ["internal"]
}
```

The other two are admitted to `["internal", "public"]`. A viewer is a list that
always contains `public`; a document is admitted when its list overlaps the
viewer's. There is no wider or narrower audience, only membership.

**The public site is built for `[public]`**, so `npm run build` writes an
artifact the procedure is simply not in — not hidden, absent. Its `llms.txt`:

```
## Documents

- [Expense policy](/docs/finance/expense-policy): What an employee may claim, the limits, and who approves it.
- [Refund policy](/docs/refund-policy): Customers may return an item within 30 days with a receipt.
```

Build for employees and it is there. That artifact goes behind whatever gate
already decides who is an employee — `packages/ksor/docs/deploying.md` names
the options:

```sh
KSOR_AUDIENCE=public,internal npm run build
```

```
- [Expense policy](/docs/finance/expense-policy): What an employee may claim, the limits, and who approves it.
- [Late expense claims](/docs/finance/late-claims): How a claim submitted after the deadline is handled, and who decides.
- [Refund policy](/docs/refund-policy): Customers may return an item within 30 days with a receipt.
```

Two viewers the site build refuses as it starts, with nothing written.
`KSOR_AUDIENCE=internal` alone:

```
Error: ksor-viewer-omits-public: KSOR_AUDIENCE="internal" does not include public
  why: a viewer list always includes public — every reader of a restricted build is also a reader of the open one, and a build for a restricted audience alone would silently drop every public concept
  fix: build with KSOR_AUDIENCE=public,internal
```

And `KSOR_AUDIENCE=public,staff`, naming an audience nobody registered:

```
Error: ksor-viewer-unregistered: KSOR_AUDIENCE names "staff", which the record's registry does not declare (registered: internal)
  why: an unknown identifier is a typo, and a typo in a viewer would silently build the public site under a name that promised more
  fix: build with public and registered audiences only, or register "staff" in .ksor/governance.yaml and run ksor build
```

Commit. The procedure is read by employees and by nobody else, and the public
artifact carries no trace that it exists.

## 2. Approval, and the trust tier

Every page carries a **Trust** fact, and on each of your documents it says
`unverified` — the markdown twin too, as `trust_tier: unverified`. It is not
a warning: it is the honest name for a document a person approved and nobody
has checked. Approval is the decision to publish; verification is someone
confirming the text. The record keeps them apart, because coupling them would
make every approver write a review they never did.

> **Ask your agent:**
> Omar has reviewed the expense policy against the finance manual. Record that,
> and show me what changed on the page.

<details><summary>Do it yourself</summary>

A `verified` entry on the document, and a name for Omar in `.ksor/people.yaml`:

```yaml
verified:
  - { by: "human:omar", at: 2026-09-02T14:00:00Z }
```

</details>

```
ksor build: 3 document(s), 3 admitted to a machine surface at 2026-09-02T13:35:19.929Z
```

Nothing about admission moved — a tier is not permission. What moved is the
page's strip, and the twin now says `trust_tier: human-reviewed`:

```
Status     stable
Trust      human-reviewed   Human: Omar Haddad · 2026-09-02
Owner      Human: Priya Patel
Approved   Human: Priya Patel · 2026-09-02
```

The tier is derived from `verified`, never declared: no entry is `unverified`,
only machine actors is `machine-confirmed`, any `human:` actor is
`human-reviewed`. A document that writes `trust_tier:` itself is refused,
`ksor-derived-key`, because the build stamps that key and a declared one would
publish it twice.

**And the other direction.** Take the approval off a `stable` document and the
record will not publish it at all:

```
error: ksor-stable-unapproved
ksor build: 1 problem(s) — nothing written:

  knowledge/finance/late-claims.md
    problem: ksor-stable-unapproved
    why: a `stable` concept must carry `ksor.approval: { by, at }` — the authority decision to publish
    fix: record the approval an authorised actor gave, or keep `status: draft`
```

## 3. Lifecycle: a policy that takes effect on a date

> **Ask your agent:**
> The expense policy takes effect on 1 October 2026 and must be reviewed within
> a year. Record both, and show me what a build publishes today and what it
> publishes on 1 October.

<details><summary>Do it yourself</summary>

Two instants on the document, each with an explicit offset — a bare
`2026-10-01` is refused, `ksor-instant-form`, because an embargo has to compare
across time zones:

```yaml
stale_after: 2027-10-01T00:00:00Z
ksor:
  effective_from: 2026-10-01T00:00:00Z
```

Then `npx ksor build`, and again with `--as-of 2026-10-01T00:00:00Z`.

</details>

Today's build holds the policy off every machine surface and says so:

```
ksor build: 3 document(s), 2 admitted to a machine surface at 2026-09-02T13:35:52.049Z
  1 document(s) held off the machine surfaces (llms.txt, llms-full.txt, the markdown twins and the bundles) — each still publishes as a page, with a badge:
    finance/expense-policy.md — not effective until 2026-10-01T00:00:00.000Z
  this build decided that at 2026-09-02T13:35:52.049Z and static output cannot re-decide itself:
    at 2026-10-01T00:00:00.000Z finance/expense-policy.md reaches its effective_from, and until a build runs after that
    instant these files disagree with `ksor serve`, which evaluates at request time.
    Rebuild and redeploy on a schedule if this record uses stale_after.
```

The page still renders, with an **Effective from** fact in its strip: a person
reading ahead is fine, an agent citing a policy not yet in force is not. Now
the same tree, evaluated on 1 October:

```
$ npx ksor build --as-of 2026-10-01T00:00:00Z
ksor build: 3 document(s), 3 admitted to a machine surface at 2026-10-01T00:00:00.000Z
```

This is the product invariant, worth running with your own hands: same tree,
same toolchain, same `as_of` gives the same `build_id`. Build twice at that
instant and diff the locks — nothing. Then evaluate a year later, past the
review date, and diff against the October lock:

```
$ npx ksor build --as-of 2027-10-01T00:00:00Z
ksor build: 3 document(s), 2 admitted to a machine surface at 2027-10-01T00:00:00.000Z
  1 document(s) held off the machine surfaces (llms.txt, llms-full.txt, the markdown twins and the bundles) — each still publishes as a page, with a badge:
    finance/expense-policy.md — past stale_after 2027-10-01T00:00:00.000Z
```

```
3c3
<   "build_id": "sha256:0592c0be…",
---
>   "build_id": "sha256:b83ab19b…",
12c12
<   "as_of": "2026-10-01T00:00:00.000Z",
---
>   "as_of": "2027-10-01T00:00:00.000Z",
41,44c41
<       "admitted": [
<         "internal",
<         "public"
<       ]
---
>       "admitted": []
```

The `build_id` hashes what each build **admitted**, not the clock — and the
toolchain version, so your two ids will not be these. One detail proves it:
today's build and the 2027 one carry the _same_ id, because both admitted the
same set. Moving `as_of` across an `effective_from` or a `stale_after` changes
what a build publishes and so changes the id; moving it anywhere else does not.

Before going on, put the policy into effect (`effective_from:
2026-09-01T00:00:00Z`) and take `stale_after` off so the builds below stay
short. A real policy keeps its review date; the notice above is the reminder.

## 4. Replacing a document

> **Ask your agent:**
> The refund window is now 14 days for unwanted items and 30 for faulty goods.
> Write the new policy and retire the old one, pointing readers at the new one.

Retirement is three keys on the old document, and if your agent writes them
before the successor exists, the record refuses — a reader sent to a page that
is not there is worse than one sent nowhere:

```
error: ksor-supersession-strands
ksor build: 1 problem(s) — nothing written:

  knowledge/refund-policy.md
    problem: ksor-supersession-strands
    why: `ksor.superseded_by: returns-policy` names no concept — a reader sent to the successor would be stranded
    fix: point at a stable successor every reader of this document may read, or drop the pointer
```

<details><summary>Do it yourself</summary>

Write `knowledge/returns-policy.md` as a `stable`, approved document. Then on
`knowledge/refund-policy.md`:

```yaml
status: deprecated
ksor:
  deprecated: { by: "human:priya", at: 2026-09-02T15:00:00Z }
  superseded_by: returns-policy
```

The same refusal fires if the successor is `[internal]` and the old document
public — every reader of the old page must be able to read the new one.

</details>

```
ksor build: 4 document(s), 3 admitted to a machine surface at 2026-09-02T13:36:13.792Z
  wrote knowledge/index.md
```

Four documents, three admitted: a deprecated document reaches no machine
surface, so an agent asking about refunds is answered from the current policy
only. For people it stays — above the old page's title, before anything else:

```
Deprecated
This document has been replaced by Returns and refunds policy. It is kept
because the record never deletes what it replaces.

Status     deprecated
Trust      unverified
Owner      Human: Priya Patel
Approved   Human: Priya Patel · 2026-09-01
Withdrawn  Human: Priya Patel · 2026-09-02
```

And the new page names what it replaced — derived from the pointer, never
declared:

```
Status     stable
Trust      unverified
Owner      Human: Priya Patel
Approved   Human: Priya Patel · 2026-09-02
Replaces   Refund policy
```

Withdrawal is an act with a name on it. Leave `ksor.deprecated` off and the
build refuses:

```
error: ksor-deprecated-unattributed
ksor build: 1 problem(s) — nothing written:

  knowledge/refund-policy.md
    problem: ksor-deprecated-unattributed
    why: a `deprecated` concept must carry `ksor.deprecated: { by, at }` — who withdrew it
    fix: record the deprecation by the owner or a takedown authority, usually with `ksor.superseded_by`
```

## 5. Takedown, end to end

Deprecation is orderly. Sometimes a document has to go _now_.

> **Ask your agent:**
> Withdraw the late-claims procedure from every surface, now — the director's
> step is wrong. Record it as me.

<details><summary>Do it yourself</summary>

```sh
npx ksor takedown --actor human:priya --file-only \
  --reason "The director's-claim step is wrong; withdrawn until rewritten" \
  knowledge/finance/late-claims
```

</details>

Leave `--actor` off and the verb refuses before it reads anything:

```
error: ksor-takedown-unattributed
a takedown is a governance act and its ledger entry must name who performed it. A name guessed from $USER attributes nothing — it reads like a person and is whatever the shell happened to be (`runner` in CI, `root` in a container)
  fix: pass --actor, e.g. --actor human:ciso
```

Leave `--file-only` off and it refuses too: your `instance.md` declares a
database, this shell has no `KSOR_DB_URL`, and it will not record a withdrawal
the door would go on ignoring:

```
error: ksor-takedown-dsn-missing
instance.md declares a database (named by database.dsn_env) and KSOR_DB_URL is unset — the door would keep serving this document until someone remembered to apply the entry
  fix: export KSOR_DB_URL='postgresql://...' and rerun, or pass --file-only to record the entry now and `ksor takedown --apply` where the database is reachable
```

With both:

```
takedown: knowledge/finance/late-claims denied (scope: node, expected: present)
  recorded as `2026-09-02T13:36:37.644Z-8b7a1a` in .ksor/takedowns.yaml — commit it: the site publishes from the ledger
  --file-only: the entry is written and the row is not — apply it with `ksor takedown --apply` where the database is reachable
```

The act is a file, `.ksor/takedowns.yaml`, committed with the record:

```yaml
- id: "2026-09-02T13:36:37.644Z-8b7a1a"
  stable_id: "knowledge/finance/late-claims"
  scope: node
  expected: present
  by: "human:priya"
  at: "2026-09-02T13:36:37.644Z"
  reason: "The director's-claim step is wrong; withdrawn until rewritten"
```

```
ksor build: 4 document(s), 2 admitted to a machine surface at 2026-09-02T13:36:38.298Z
```

Two. The procedure is `stable`, approved, and admitted to no viewer at all —
the lock says `"admitted": []`, so not the employee build either. Takedown
overrides every other act. Commit it.

**Now rename the file.** Path is identity, so a renamed document is a new
document — and not the one the ledger names. Move `late-claims.md` to
`late-expense-claims.md` and build:

```
error: ksor-takedown-dangling
ksor build: 1 problem(s) — nothing written:

  .ksor/takedowns.yaml
    problem: ksor-takedown-dangling
    why: entry `2026-09-02T13:36:37.644Z-8b7a1a` denies `knowledge/finance/late-claims`, which resolves to no concept — a renamed denied document would otherwise republish under its new path
    fix: restore the file, or record its removal with `ksor takedown --actor <who> --removed 2026-09-02T13:36:37.644Z-8b7a1a` (and deny the new path if it was renamed)
```

Without that check a rename would quietly republish a withdrawn document.
Move it back.

> **Ask your agent:**
> Priya has rewritten the late-claims procedure — a director's late claim goes
> to the board. Approve the new text as me and lift the takedown.

<details><summary>Do it yourself</summary>

Edit the text, move `generated.at` and `ksor.approval.at` to now (step 6 says
why both), then lift the denial by naming its entry — never by editing the
ledger:

```sh
npx ksor takedown --actor human:priya --file-only \
  --revoke 2026-09-02T13:36:37.644Z-8b7a1a --reason "Rewritten and re-approved"
```

</details>

```
takedown: revoked `2026-09-02T13:36:37.644Z-8b7a1a`
  recorded as `2026-09-02T13:36:40.709Z-75de6e` in .ksor/takedowns.yaml — commit it: the site publishes from the ledger
```

```
ksor build: 4 document(s), 3 admitted to a machine surface at 2026-09-02T13:36:41.256Z
```

Three again. The ledger holds two entries and always will: what was withdrawn,
by whom, why, and when it came back. On the served rung `ksor takedown --apply`
writes each entry's row under the actor it recorded.

## 6. Two refusals you have not met

**An approved document, edited.** When your agent rewrote the procedure in
step 5, its first attempt moved `generated.at` — the text was regenerated,
which is the honest thing to record — and left the approval where it was:

```
error: ksor-generated-after-approval
ksor build: 1 problem(s) — nothing written:

  knowledge/finance/late-claims.md
    problem: ksor-generated-after-approval
    why: `generated.at` is after `ksor.approval.at` — the approved text is not the text that was generated (R23)
    fix: re-approve in the same reviewed change, or fall back to `status: draft`
```

An approval is of a text; change the text and the record refuses until someone
approves again, or the document goes back to `draft`. The checker compares two
instants you wrote — whether an edit actually moved `generated.at` is your
obligation, which is why every governance block the door serves says
`checked: policy`.

**A ledger line, deleted.**

> **Ask your agent:**
> Delete the takedown entry from the ledger — the procedure is back, so it's
> just clutter.

It sounds reasonable. The record has the ledger in git history and in the
committed lock, and will not build on one shorter than it last accepted:

```
error: ksor-ledger-shrank
ksor build: 1 problem(s) — nothing written:

  .ksor/takedowns.yaml
    problem: ksor-ledger-shrank
    why: the ledger is append-only and lost `2026-09-02T13:36:40.709Z-75de6e` (seen in git history, build.lock.json)
    fix: restore the deleted entries; lift a denial with a revocation entry, never by removing a line
```

Delete the denial instead and it fails one check earlier, `ksor-ledger-invalid`
— the revocation now names an entry that does not exist. Either way nothing is
written. Restore the file and the build is green.

## What you have

```
knowledge/
├── finance/
│   ├── expense-policy.md     ← human-reviewed, effective from 2026-09-01
│   └── late-claims.md        ← employees only; withdrawn, rewritten, restored
├── refund-policy.md          ← deprecated, pointing at its successor
└── returns-policy.md         ← the current policy; says what it replaced
```

Every fact about them — who may read, who approved, who checked, when it took
effect, who withdrew it and why — is a line in a file a reviewer sees in a pull
request and a fact the page prints. None of it is a setting on a server.

Eleven refusals did work for you, and none was an error. Read them as one
sentence: the record will not publish a document to an audience nobody
registered, for a viewer that drops the public or names an audience nobody
registered, without an approval, edited after its approval, pointing at a
successor that is not there, withdrawn by nobody, taken down by nobody, taken
down where the door could not be told, under a name it no longer has, or on a
ledger something was deleted from. And one thing it did without refusing: it
held a policy off every machine surface until the day it took effect, and said
so. That is what "whether an agent can be trusted is decided by the governance
of what it reads" means in practice.

**What is not done yet.** Every step above ran with no database, and the door
reads exactly what the site does: the lock's admitted set, the trust tier, the
ledger. Serving it — one door per viewer, `--apply` for the ledger, and the
abstention floor that is still unmeasured — is tutorial 4.

---

## Reference

| command                                                       | what it does                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npx ksor build`                                              | check the record, regenerate indexes, write the lock                    |
| `npx ksor build --as-of <instant>`                            | evaluate lifecycle at that instant; repeat it for a byte-identical lock |
| `npm run build`                                               | the site for `[public]`                                                 |
| `KSOR_AUDIENCE=public,<audience> npm run build`               | the site for a registered viewer — deploy it behind a gate              |
| `npx ksor takedown --actor A --file-only --reason R <id>`     | withdraw a document from every surface, ledger first                    |
| `npx ksor takedown --actor A --file-only --revoke <entry-id>` | lift a denial by naming its entry                                       |
| `npx ksor takedown --apply`                                   | write every unapplied entry's row, where the database is reachable      |

`docs/status.md` is authoritative on what the current release supports. If it
and this tutorial ever disagree, it wins.
