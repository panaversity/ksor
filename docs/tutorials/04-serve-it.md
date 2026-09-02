# Serve it — with a floor, in about half an hour

You finished [Make it yours](./02-make-it-yours.md) with three documents that
are all yours, and the agent surface from [hello world](./01-hello-world.md)
still serving the starter you have since deleted. Its boot report said
`abstain OFF`, and this tutorial is the one hello world promised when it said
that teaching a record to say _"I don't know"_ is a **measurement, not a
setting**.

By the end of this, the door serves the three documents; you have measured
where questions this record answers score against questions it does not; the
record refuses below that line; a real coding agent has asked it three
questions and been refused exactly once, correctly; and you have seen a
document withdrawn from the door between two questions.

Every command and every output below was run on 2026-09-02 and pasted as it
appeared, with two conventions. A `build_id` is shown as `sha256:…`, because it
hashes the toolchain version along with the record and yours will not match.
And the door is on port **8180** throughout, because 8080 was held by another
record on the machine this was captured on — `ksor serve` refused it by name and
suggested `KSOR_MCP_PORT`, so that is what was used. On your machine leave the
variable off and read `8080` wherever this says `8180`.

**You need:** the `handbook` from tutorial 2, with the `.env` you wrote in
hello world — `KSOR_DB_URL`, `GEMINI_API_KEY`, `KSOR_AUTH=disabled-local` —
and a fresh, empty database for it. This walk used a local Postgres 17 with
pgvector; a Neon branch works the same way. Starting empty is deliberate: the
first step is the one every new adopter meets, and it should be seen once.

Each step gives you a prompt for your coding agent, and the same work under a
**Do it yourself** fold.

---

## Where you are

```sh
cd handbook
npx ksor build
```

```
ksor build: 3 document(s), 3 admitted to a machine surface at 2026-09-02T13:55:53.046Z
source: 11efcbd83b8007f8d8029d7fc5bcfac4b0ed2230
  wrote build.lock.json — build_id sha256:…
```

Three documents, three admitted, and a clean `source` commit. The site is
right. The door is about to tell you it has nothing.

## 1. Serve nothing, and be told so

> **Ask your agent:**
> Provision the database — `npm run provision` — then start the server in the
> background and tell me what it says.

<details><summary>Do it yourself</summary>

```sh
npm run provision   # schema + ingest authorization — once per database
npm run serve
```

`provision` applies the schema and grants ingest. Both are re-runnable and
report what they found. On this empty database:

```
schema: applied 2.5 at dim 1536, text search english (database named by KSOR_DB_URL)
granted: sor_content_ingest may now ingest handbook
```

</details>

```
ksor serve · handbook
  db          direct endpoint · local
  audience    public
  generation  NONE — nothing published; run npm run refresh
  trust       unverified
  auth        DISABLED — 127.0.0.1 only, and a public bind will refuse to boot
  abstain     OFF — no floor calibrated; out-of-corpus questions will be answered, not refused
  serving     http://127.0.0.1:8180/mcp
```

Read the `generation` line. The database is provisioned and the door is up,
and **it is serving nothing**, because serving does not publish — `refresh`
does, and you have not run it against this database. The line says so, in
capitals, with the command that fixes it spelled for the package manager that
started the process. `/health` says the same thing, and every search answers
`reason: "unpublished"` before it spends an embedding call:

```sh
curl -s http://127.0.0.1:8180/health
```

```json
{
  "corpus_id": "handbook",
  "store": "reachable",
  "boot_checks": "passed",
  "generation": "NONE — nothing published; run npm run refresh",
  "abstain_gate": "OFF — no floor calibrated; out-of-corpus questions will be answered, not refused",
  "embedding_space": "gemini-embedding-001/d1536 ok",
  "auth": "disabled"
}
```

An empty record is a different answer from _"not in the record"_, and a door
that came up green about nothing would be the worst first impression this
product could make. Leave the server running.

## 2. Publish

> **Ask your agent:**
> Publish the record — `npm run refresh` — then check the door's health again
> without restarting it.

<details><summary>Do it yourself</summary>

```sh
npm run refresh
curl -s http://127.0.0.1:8180/health
```

</details>

```
run 1: building generation 1 (embed gemini:gemini-embedding-001/d1536/RETRIEVAL_DOCUMENT)
structure: 4 nodes, 3 sources, 6 chunks; carried 0, pending 6
embedding 6 pending chunks (batch 32) ...
embedded 6, failed 0
source: 11efcbd83b8007f8d8029d7fc5bcfac4b0ed2230
ingest: generation 1 — 4 nodes, 6 chunks; embedded 6, carried 0, failed 0
pre-flip delta vs gen 0: 0 -> 4 nodes (+4 / -0)
  added:   ["knowledge/finance#section","knowledge/finance/expense-policy","knowledge/finance/late-claims","knowledge/refund-policy"]
FLIPPED active generation -> 1
gc: nothing collectable (active/rollback/grace all hold)
```

Four nodes: your three documents and the `finance` folder, a node of its own.
Six chunks, six embedding calls — the whole cost of publishing a record this
size. And the server you left running already knows:

```json
"generation": "1 · 4 nodes · source 11efcbd83b8007f8d8029d7fc5bcfac4b0ed2230"
```

The generation is re-read on every health probe, so a `refresh` shows without
a restart. Restart it anyway, to see the boot block name what it serves:

```
  generation  1 · 4 nodes · source 11efcbd83b8007f8d8029d7fc5bcfac4b0ed2230
  ...
  abstain     OFF — no floor calibrated; out-of-corpus questions will be answered, not refused
```

That second line is the subject of the rest of this tutorial.

### What OFF means, exactly

Ask the door something the record does not cover. Not something far away —
something _near_: the late-claims procedure mentions parental leave as an
exception, and says nothing about how long it is.

```sh
curl -s -X POST http://127.0.0.1:8180/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search","arguments":{"query":"How many weeks of parental leave do employees get?","k":2}}}'
```

```json
"ok": true,
"abstained": false,
"gate": "off",
"top_cosine": 0.5303894719366247,
"hits": [ "knowledge/finance/late-claims", "knowledge/refund-policy" ]
```

Two hits, both cited, both governed, both approved by Priya — and neither
answers the question. With the gate off the door returns its closest passages
to anything at all, and an agent reading them will do what agents do with
passages: answer. The envelope says `gate: "off"`, so an agent that reads
envelopes knows this is not evidence of coverage. Most will not read it.

The number to hold onto is `top_cosine: 0.530`. That is how close the record's
best passage came, in the embedding space the record was published into. The
gate is a line drawn in that space, and the next step is finding where.

## 3. Measure the floor

A floor is not a setting you choose. It is a **measurement**: you give the
record real questions it answers, it scores them, it scores questions it does
not answer, and if the two sets separate it prints the line between them. If
they do not separate, it prints no number at all, because any number it
printed would be one it knows lets something through.

Write eight questions the record answers, in the words someone would actually
ask, one per line, in `questions.txt`:

```
How long does a customer have to return something?
Do I need a receipt to get a refund?
What is the daily limit on meals when I am travelling?
How much can I spend on a hotel per night?
Who approves an expense claim over a thousand?
When is an expense claim counted as late?
What happens to a late claim from a director?
Is a claim still late if I was on sick leave?
```

> **Ask your agent:**
> Here are eight questions our record answers, in `questions.txt`. Calibrate
> the floor with them.

<details><summary>Do it yourself</summary>

```sh
npx ksor calibrate --instance instance.md --queries-file questions.txt
```

The zero-LLM door: no question synthesis, so no generation quota to hit on a
free key — but not zero-key, because the questions are still embedded.

</details>

```
measured on generation 1 (served), model gemini-embedding-001, door: queries-file
CAVEAT: --queries-file floors are measured on human/gold-derived queries — section-weighted eval targets, NOT per-node passage samples — so this floor's low tail is a different distribution than the synthesized door's; record 'door: queries-file' beside the number and never compare the two doors' floors as interchangeable.
AURC = 0.356  (lower = better separation)
separation margin: 0.079 (over 8 in-corpus / 20 out-of-corpus probes)
zero-FA floor (never refuse a real question): 0.656 -> coverage 0.286, ooc leak 0.000
ALT (0.95-precision): floor = 0.656 -> coverage 0.286
weakest in-corpus queries (these set the floor):
  0.656  Do I need a receipt to get a refund?
  0.686  How much can I spend on a hotel per night?
  0.693  How long does a customer have to return something?
  0.696  What is the daily limit on meals when I am travelling?
  0.706  Is a claim still late if I was on sick leave?

separable: max OOC 0.578 < min in-corpus 0.656; midpoint has margin both ways
Paste this into instance.md's frontmatter (merge it into `retrieval:` if the file already has one):
retrieval:
  vector_floor: 0.617   # calibrated 2026-09-02 on generation 1, model gemini-embedding-001/d1536, door: queries-file
  floor_digest: 8bfb07d0e6f5
```

Read it from the bottom. It separated: the best out-of-corpus probe scored
0.578, your weakest real question 0.656, and the floor is the midpoint, 0.617.
The weakest question is listed by name because **the floor is set by the
weakest of them** — a vague question drags it down, and a question the record
does not actually answer invalidates the measurement.

**Do not paste it yet.** The twenty out-of-corpus probes it measured against
are built in, and they are all far from any handbook — the kind of question
nobody would bring to this record. The parental-leave question above is the
dangerous kind: close enough to score. So write six of those, in `ooc.txt`,
and measure again:

```
How many weeks of parental leave do employees get?
What is the mileage rate for driving my own car?
Who approves a purchase order for a new supplier?
How do I request a company credit card?
What is the notice period when resigning?
Can a customer exchange an item instead of a refund?
```

> **Ask your agent:**
> Now measure it against questions just outside our scope — `ooc.txt`.

<details><summary>Do it yourself</summary>

```sh
npx ksor calibrate --instance instance.md --queries-file questions.txt --ooc-file ooc.txt
```

</details>

```
separation margin: -0.005 (over 8 in-corpus / 6 out-of-corpus probes)
zero-FA floor (never refuse a real question): 0.656 -> coverage 0.643, ooc leak 0.111
...
NOT separable: max OOC 0.662 >= min in-corpus 0.656; zero-FA floor leaks 0.111
NOT pasting a floor: this measurement did not separate, so any number here would be one that is known to leak.
Widen the probe set (scope-adjacent near-misses, not only far-domain questions), add in-corpus questions, and re-run. Until then, put the record in the fail-closed state — paste this into instance.md's frontmatter (merge it into `retrieval:` if the file already has one):
retrieval:
  vector_floor: uncalibrated

these out-of-corpus probes scored at or above your weakest in-corpus question:
  0.662  Can a customer exchange an item instead of a refund?
  ^ look at these first. Either the record COVERS one — move it to the
    in-corpus side, because a probe the record answers is not out of corpus
    — or it genuinely does not separate, and the floor stays uncalibrated.
```

**No floor.** One near-miss — _can a customer exchange an item?_ — scored
0.662, above your weakest real question, and the tool refused to print a
number it knows would let that question through. The floor it offered instead
is `uncalibrated`, which makes the door refuse _everything_ until a real one
replaces it. That is the fail-closed state, and it is the correct one.

Now read what it found. That question is one customers ask. The refund policy
does not answer it — not because exchanges are out of scope, but because
nobody wrote the exchange rule down. The measurement found a hole in the
**record**, not in itself. That is the same move as tutorial 2, so make it the
same way:

> **Ask your agent:**
> Nobody ever wrote down what happens to an exchange. Interview me and add it
> to the refund policy.

<details><summary>Do it yourself</summary>

Add a section to `knowledge/refund-policy.md`, in your words:

```markdown
## Exchanges

A customer may exchange an unused item for a different size or colour of the
same product within the same 30 days, with proof of purchase. An exchange for a
different product is handled as a refund and a new purchase.
```

An edit is a new act, so bump `generated.at` and approve it again, as you:

```yaml
generated: { by: "human:priya", at: 2026-09-02T14:00:00Z }
ksor:
  approval: { by: "human:priya", at: 2026-09-02T14:30:00Z }
```

Move the exchange question from `ooc.txt` to `questions.txt` — it is in the
record now, so it is an in-corpus question. Then commit, and:

```sh
npm run refresh
npx ksor calibrate --instance instance.md --queries-file questions.txt --ooc-file ooc.txt
```

</details>

```
run 2: building generation 2 (embed gemini:gemini-embedding-001/d1536/RETRIEVAL_DOCUMENT)
structure: 4 nodes, 3 sources, 7 chunks; carried 5, pending 2
embedding 2 pending chunks (batch 32) ...
embedded 2, failed 0
source: 29ffdd7d13a2d5e22feb2e7009f5bf3b3a6777fc
ingest: generation 2 — 4 nodes, 7 chunks; embedded 2, carried 5, failed 0
pre-flip delta vs gen 1: 4 -> 4 nodes (+0 / -0)
FLIPPED active generation -> 2
```

Two chunks embedded, five carried forward unchanged: an edit costs what the
edit touched. Then the measurement, on generation 2:

```
measured on generation 2 (served), model gemini-embedding-001, door: queries-file
...
separation margin: 0.025 (over 9 in-corpus / 5 out-of-corpus probes)
zero-FA floor (never refuse a real question): 0.656 -> coverage 0.643, ooc leak 0.000
...
separable: max OOC 0.630 < min in-corpus 0.656; midpoint has margin both ways
Paste this into instance.md's frontmatter (merge it into `retrieval:` if the file already has one):
retrieval:
  vector_floor: 0.643   # calibrated 2026-09-02 on generation 2, model gemini-embedding-001/d1536, door: queries-file
  floor_digest: 8bfb07d0e6f5
```

Separable again, on a harder test: the nearest miss is now 0.630, the margin
is 0.025 instead of 0.079, and the floor is **0.643**. That is a narrower gap
than the first run's, and a more honest one — it was measured against
questions that could plausibly be asked of this record, not against questions
about astronomy.

### What the floor is

The floor is a cosine similarity in one embedding space — the distance, in
`gemini-embedding-001` at 1536 dimensions, below which this record's best
passage is not close enough to count as an answer. It was measured on **this**
record's passages against **these** questions, on generation 2, and every one
of those facts is written in the comment beside the number. Change the
documents, the model, or the questions, and the number is a different number.

That is why a floor is never copied between records. `0.643` means nothing
away from the corpus and embedding space it was measured in: another record's
weakest real question might score 0.71 or 0.58, and a copied 0.643 would refuse
half of its real questions or answer everything, silently, with the envelope
still reporting a measured gate.

> **Ask your agent:**
> Paste the retrieval block into `instance.md` and restart the server.

<details><summary>Do it yourself</summary>

Paste the block exactly as printed into `instance.md`'s frontmatter — the
comment too, because it is the record of the measurement, and `floor_digest`,
which names the retrieval predicate the floor was measured through. If the file
already has a `retrieval:` block, merge into it; a duplicate key is refused.
Then restart `ksor serve` — the floor is read at boot.

</details>

```
ksor serve · handbook
  db          direct endpoint · local
  audience    public
  generation  2 · 4 nodes · source 29ffdd7d13a2d5e22feb2e7009f5bf3b3a6777fc
  trust       unverified
  auth        DISABLED — 127.0.0.1 only, and a public bind will refuse to boot
  abstain     floor 0.643 — below it, this record abstains
  serving     http://127.0.0.1:8180/mcp
```

`abstain` is on. The parental-leave question that scored 0.530 in step 2 is
now below the line.

## 4. Three questions, from a real agent

If you followed hello world, `handbook` is already in `.mcp.json`; if this walk
moved your port, update the URL. **Start a new agent session** — MCP servers
are read when a session begins.

The three questions below were put to a coding agent from the project
directory, one fresh session each, so nothing carried over between them. What
follows is what the agent said, and what the door said to the agent.

<details><summary>Do it yourself — the exact command</summary>

```sh
unset CLAUDECODE
claude -p "QUESTION" --model sonnet --mcp-config .mcp.json --strict-mcp-config \
  --allowedTools "mcp__handbook__search,mcp__handbook__read,mcp__handbook__outline"
```

`--allowedTools` pre-approves the record's three tools, because a
non-interactive run cannot answer a permission prompt. Any MCP client works the
same way; this one was to hand.

</details>

**First, a question the record answers — in words it never used.**

> **Ask your agent:**
> What's the meal allowance when I'm away on business?

The agent searched, the door answered from generation 2, and the reply names
the document and the section:

```
Meals are capped at **45 per day** while you're away on business (source:
`knowledge/finance/expense-policy`, "Limits" section, Finance manual §7 2026
edition).

A few related points from the same policy:
- You need an itemised receipt for every line — a card statement doesn't count.
- Claims are paid within 10 working days of approval.
- If you submit more than 60 days after the receipt date, it's treated as a late
  claim and needs your line manager's note plus Head of Finance sign-off.
```

The question said _allowance_ and _business_; the record says _capped_ and
_away from their normal place of work_. It scored 0.694 — above the floor by
five hundredths. That gap is the margin the measurement bought.

**Second, the near-miss.** The record mentions parental leave. It does not say
how long it is.

> **Ask your agent:**
> How many weeks of parental leave do we get?

What the door returned to the agent:

```json
{
  "ok": false,
  "abstained": true,
  "reason": "abstained",
  "gate": { "floor": 0.643 },
  "top_cosine": 0.5549184511188827,
  "hits": []
}
```

And what the agent said:

```
This record abstained — it doesn't cover parental leave (its scope is customer
refunds and employee expenses only; it explicitly excludes HR policy like
leave). I can't answer this from here; you'd need your HR policy documentation
for that.
```

**That is the headline.** The same question that returned two cited passages
in step 2 now returns none, with the floor it fell under in the envelope, and
the agent said _I don't know_ instead of paraphrasing the late-claims exception
into an answer about leave. Nothing about the agent changed between the two.
The record did.

**Third, a question from another world.**

> **Ask your agent:**
> What is the boiling point of water at sea level?

```
The handbook here is scoped to Acme's refund and expense policies, not general
knowledge, so I won't query it for this.

100°C (212°F) at standard atmospheric pressure (1 atm / 101.325 kPa).
```

It never asked the record. That is worth seeing once, because it draws the
boundary of what a floor is: **the floor governs what the record says**. It
does not govern what an agent says about things it never asked the record.
The agent read the record's scope — the first paragraph of `instance.md`, which
is handed to every connecting agent — and decided for itself. A question
inside the scope reaches the gate; a question outside it may never arrive. Both
are correct, and only the first is the record's to guarantee.

## 5. Is the floor still right?

A floor is measured once, and then the record grows. As it does, questions that
were out of corpus start scoring above a fixed number, and the guarantee
weakens in silence. Every search leaves a row carrying its own score, on both
sides of the gate, so the check reads the record's own traffic — no key, no
embedding call:

> **Ask your agent:**
> Run `ksor calibrate --check` and tell me what it says.

<details><summary>Do it yourself</summary>

```sh
npx ksor calibrate --instance instance.md --check
```

</details>

```
floor drift — last 30 day(s)
  declared vector_floor  0.643
  searches logged        4  (3 answered, 1 abstained)
  abstain rate           25.0%
  answered top score     p05 0.530  p50 0.530  p95 0.694
  within 0.01 of floor    2  (66.7% of answers)
  verdict                NO-DATA — only 4 logged search(es) — too few to characterise; this reports traffic, so a record nobody queries says nothing rather than looking healthy
```

Four searches: the gate-off question from step 2 (asked twice while this was
captured) and the two the agent just made — the third never reached the door.
The verdict is `NO-DATA`, and that is the honest reading of four rows: below
thirty it declines to characterise the traffic rather than dress a handful of
numbers up as evidence. Two things to know before you trust the lines above it.
It reads **every** logged search, including the two made while the gate was
off, which is why `within 0.01 of floor` is counting answers that scored 0.530
— below the floor, not near it. And it exits 0 whatever it says: a stale floor
is a _re-measure this_ state, and failing a build for one would make the
shortest way out deleting `vector_floor` altogether.

Run it on a schedule once the record has traffic. When it says `WATCH`, the
remedy is step 3 again — the measurement is the only thing that produces a new
number.

## 6. Withdraw a document, between two questions

The late-claims procedure has an open question in it, and Priya is not sure
the CFO route is right. Take it down while she checks:

> **Ask your agent:**
> Take `finance/late-claims` down — it is under review. Record it as me.

<details><summary>Do it yourself</summary>

```sh
npx ksor takedown --instance instance.md --actor human:priya \
  --reason "under review — the CFO route is being rewritten" knowledge/finance/late-claims
```

`--actor` is required, and there is no default: a name taken from the
environment reads like a person and is whatever the shell happened to be.

</details>

```
takedown: knowledge/finance/late-claims denied (scope: node, expected: present)
  recorded as `2026-09-02T14:01:15.834Z-aa6e77` in .ksor/takedowns.yaml — commit it: the site publishes from the ledger
  the row is written — no surface serves it from this request on
```

Ledger first, row second, in one act. `.ksor/takedowns.yaml` gained an entry
with your handle, the instant, and the reason; the door stopped serving the
document on the next request; the site will stop at its next build, because it
reads the committed ledger. Commit it.

Then ask the agent the seventh question from `questions.txt` — one the record
answered a minute ago:

> **Ask your agent:**
> What happens to a late claim from a director?

```
The handbook doesn't cover this. The expense policy
(`knowledge/finance/expense-policy`) covers how to claim, what may be claimed,
limits, and who approves — but it has no provision for a "late" claim (no
submission deadline is mentioned), and it doesn't have a "director" tier:
approval is just line manager (up to 1,000) or Head of Finance (above that),
with the rule that nobody approves their own claim.

So there's no rule in the record for either half of your question — what
counts as "late," or a director-specific approval path. If your organization
has one, it isn't in this handbook.
```

Read what happened underneath, because it is not an abstention. The door
_answered_ — three searches, all above the floor, all from the expense policy,
which is genuinely the nearest thing the record still serves. What it did not
return was a single passage from `late-claims`, and the agent, reading only
what it was given, said so. A takedown is not a score; it is a document that
no longer exists on the surface, and the answer traces to what was actually
served.

Lifting it is a new entry, never a deleted line: `ksor takedown --revoke
<entry-id> --actor human:priya`, with the id the denial printed.

## What you have

```
instance.md          ← retrieval: vector_floor 0.643, measured on generation 2
questions.txt        ← nine questions the record answers, in someone's words
ooc.txt              ← five it does not, close enough to score
.ksor/takedowns.yaml ← one denial, with a name and a reason
```

A door serving generation 2 of three documents; a floor measured on them, with
the measurement written beside the number; one near-miss refused with the line
it fell under in the envelope; one document withdrawn by name. And one thing
the measurement gave you that you did not ask for: an exchange rule that had
never been written down, found because a question about it scored too close
to count as outside.

The number is the least of it. What you have is a record that can say what it
does not know, and the evidence — on generation 2, against these questions —
of where that line is.

---

## Reference

| command                                                                     | what it does                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------- |
| `npm run provision`                                                         | apply the schema, authorize ingest — once per database  |
| `npm run refresh`                                                           | build, embed, publish a generation                      |
| `KSOR_MCP_PORT=8180 npm run serve`                                          | the MCP server, on a port of your choosing              |
| `curl -s http://127.0.0.1:8180/health`                                      | what the door serves, and whether the gate is on        |
| `npx ksor calibrate --instance instance.md --queries-file Q [--ooc-file O]` | measure the floor; prints nothing pasteable if it leaks |
| `npx ksor calibrate --instance instance.md --check`                         | is the declared floor holding against real traffic      |
| `npx ksor takedown --instance instance.md --actor A --reason R <stable-id>` | withdraw a document from every surface, ledger first    |

`docs/status.md` is authoritative on what the current release supports. If it
and this tutorial ever disagree, it wins.
