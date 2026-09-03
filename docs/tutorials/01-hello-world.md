# Hello world — a governed record, in about fifteen minutes

By the end of this you will have written one document, watched the record refuse
to publish it until a human approved it, and then asked your own coding agent a
question and had it answer **from that document**, naming which document and
which publication the answer came from.

Every command and every output below was run on 2026-09-01 and pasted as it
appeared. Nothing here is a sketch. One block is the exception and says so
where it appears: `ksor serve`'s boot report gained a `generation` line the day
after this walk, so step 8 shows the shape the current release prints.

**Part 1 needs nothing but [Node 24+](https://nodejs.org/en/download).** Part 2
needs two more things, both free, and says so before it asks.

Each step gives you a prompt for your coding agent. If you would rather type the
commands yourself, they are under the **Do it yourself** fold beneath each one —
the same commands, no shortcuts.

---

## Part 1 · The human surface

### 1. Create the project — this one is yours to run

```sh
npx @panaversity/ksor@latest init handbook
cd handbook
```

**Run this yourself rather than asking your agent**, for a reason worth knowing:
`init` reads which package manager invoked it and emits that manager's project.
`npx` gives you an npm project, `pnpm dlx` a pnpm one, `bunx` a bun one. The run
that scaffolds is the run that knows your toolchain — so the choice should be
yours, not whatever your agent's shell reached for.

The commands below are npm's, to match the `npx` above. On a `pnpm dlx` or
`bunx` project, substitute your own manager throughout.

It is also the moment your agent gets its instructions: `AGENTS.md`, three
skills, and `.mcp.json` all arrive here. Before this command there is nothing
for an agent to read.

### 2. Start it

> **Ask your agent:**
> Install the dependencies and start the site, then tell me what to open.

<details><summary>Do it yourself</summary>

```sh
npm install
npm run dev
```

</details>

Open **http://localhost:3000**. You have a documentation site rendering five
starter documents about KSoR itself. They are scratch paper — you will delete
them in [tutorial 2](./02-make-it-yours.md).

### 3. Write your first document

> **Ask your agent:**
> Add a document to `knowledge/` about our refund policy: customers can return
> an item within 30 days with a receipt, refunds land within 5 working days,
> items must be unused, and faulty goods are exempt from the window. Then tell
> me what to refresh.

<details><summary>Do it yourself</summary>

Create `knowledge/refund-policy.md`:

```markdown
---
type: Document
title: Refund policy
description: Customers may return an item within 30 days with a receipt.
status: draft
ksor:
  owner: "human:you"
  audience: [public]
---

A customer may return an item within **30 days** of delivery, with proof of
purchase. Refunds are issued to the original payment method within 5 working
days. Items must be unused and in their original packaging. Faulty goods are
outside this window entirely.
```

`type: Document` is the one type the profile promises never to reserve. Reserved
types — `Policy`, `Procedure`, `Control` and the rest — carry governance meaning,
so the record demands `sources` and an owner before it will accept one. If your
agent reaches for `type: Policy` here, it will meet that refusal and can either
add `sources` or fall back to `Document`; [tutorial 2](./02-make-it-yours.md) is where
reserved types earn their keep.

</details>

Refresh the browser. Your document is there — with a **draft** badge.

### 4. The moment this whole product exists for

> **Ask your agent:**
> Build this for publishing.

<details><summary>Do it yourself</summary>

```sh
npx ksor build
```

</details>

```
ksor build: 6 document(s), 5 admitted to a machine surface at 2026-09-03T04:12:04.205Z
source: unspecified — knowledge/ is in a git repository with no commits yet, so this build cannot be traced back to a reviewed commit.
  fix: commit the record (git add knowledge && git commit) and re-run
  change-control: not checked — the repository has no commits yet, so whether a stable concept's body changed under its `generated.at` (KSP R23) was not checked
  wrote knowledge/index.md
  wrote build.lock.json — build_id sha256:bfc0918da9d2e3444e6f4ea87ae1853a86f21cd4362d149c4ab09855272042ca
```

Two lines are worth reading. `source: unspecified` is the record saying it
cannot trace this build to a reviewed commit — you have not made one yet — and
`change-control: not checked` is the same honesty about a different question:
with no history, whether an approved document was edited after its approval
(KSP R23) is unanswerable, so it is reported rather than passed. Both go away
at the commit two steps down.

Your timestamp will differ. So will the `build_id` if you are on a later ksor
than the 0.0.59 these were captured on — the id hashes the TOOLCHAIN along with
the record, because "what produced this" is part of what a publication is. What
you can reproduce right now is the claim itself: run `ksor build` twice without
changing anything and the id is identical both times. Same record, same
toolchain, same `build_id` is a property this project tests itself on rather
than asserts.

The `source: unspecified` line is the record telling you it cannot trace this
build back to a reviewed commit, because you have not made one yet. We fix that
in a moment.

**Six documents. Five admitted.** Yours is not one of them — it is absent from
`llms.txt`, from the markdown twins, from everything an AI agent would read.
Nobody has approved it.

> **Ask your agent:**
> Why isn't my refund policy in `llms.txt`? Then approve it and build again.

Read that answer against the build's own count rather than the dev server:
`pnpm dev` serves `/llms.txt` from a static route it computes once per process
(the static export requires that), so it keeps showing the pre-approval list
until you restart it. The document's own page updates either way, and the built
site is always current.

<details><summary>Do it yourself</summary>

Change `status: draft` to `status: stable`, and add the two acts that publishing
requires — who produced the text, and who approved it:

```yaml
status: stable
generated: { by: "human:you", at: 2026-09-01T09:00:00Z }
ksor:
  owner: "human:you"
  audience: [public]
  approval: { by: "human:you", at: 2026-09-01T10:00:00Z }
```

Then commit the record and build again — the commit is what turns that
`source: unspecified` into something an auditor can follow:

```sh
git add -A && git commit -m "Add and approve the refund policy"
npx ksor build
```

</details>

```
ksor build: 6 document(s), 6 admitted to a machine surface at 2026-09-01T21:38:13.441Z
source: 4ff382518b868c7534153c9bf7963fcaad80b6db
  wrote build.lock.json — build_id sha256:ac107998b571a92f3c2d51f1fb9eecdb7189aea92b89d81133a512596be79bf2
```

`source` is now your commit — the build traces to a reviewed change, which is
the whole of what provenance claims: not that the content is right, but that
this publication came from that reviewed change. Your sha will be your own, and
so will the `build_id`, which moved because the document did and which also
carries the toolchain that built it.

That is the product. A draft reaches no machine surface, an approval is an act
with a name and a time attached to it, and the count moved because a human
decided something — not because a build ran.

**Part 1 is done.** You have a governed record and a website, and you spent
nothing.

---

## Part 2 · The agent surface

This is the half that answers questions. It needs two things, both free:

|                          |          |                                         |
| ------------------------ | -------- | --------------------------------------- |
| a Postgres with pgvector | **free** | your agent can create it                |
| an embedding API key     | **free** | you paste it — no agent can do this one |

### 5. Get the database

`.mcp.json` at the project root declares the MCP servers your agent may reach.
It ships with two: **Neon**, used below, and
**agentfactory-system-of-record** — a read-only KSoR record Panaversity
operates, there as an example of the surface you are building. The second is not
your record and nothing here needs it; delete the entry if you would rather your
agent not have it.

The Neon server acts on your Neon **account**, not on one database: an agent
holding it can create and delete projects and branches. That is why the prompt
below asks to see the plan first.

> **Ask your agent:**
> Using the Neon MCP server, create a project called `handbook` and enable the
> pgvector extension on it. Then create a branch called `dev`, and save that
> branch's connection string to `.env` as `KSOR_DB_URL`. Never print my API key.
> Show me the plan before you run anything.

<details><summary>Do it yourself, or use any Postgres</summary>

Neon is the path that has an MCP server, not a requirement — any Postgres with
pgvector works:

```sh
docker run -e POSTGRES_PASSWORD=x -p 5432:5432 pgvector/pgvector:pg17
```

Then put its URL in `.env` as `KSOR_DB_URL`.
</details>

### 6. Paste the key — the one step no agent can do

Get a key from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey). **Embedding
input is free of charge**; this is a signup, not a bill. No vendor mints an API
key over a protocol, so no agent can do it for you.

Your `.env` now needs three lines:

```sh
KSOR_DB_URL=postgres://…
GEMINI_API_KEY=…
KSOR_AUTH=disabled-local
```

That last line is not optional. `ksor serve` refuses to boot unauthenticated —
deliberately, so nobody leaves a record open by accident. Saying it out loud is
how you get a local server.

### 7. Publish to the door

> **Ask your agent:**
> Run `npm run provision`, then `npm run refresh`.

<details><summary>Do it yourself</summary>

```sh
npm run provision   # schema + ingest authorization — once
npm run refresh     # build, embed, publish a generation
```

</details>

```
run 1: building generation 1 (embed gemini:gemini-embedding-001/d1536/RETRIEVAL_DOCUMENT)
structure: 7 nodes, 6 sources, 23 chunks; carried 0, pending 23
embedding 23 pending chunks (batch 32) ...
embedded 23, failed 0
source: 5bfbaafd809e199e44453ad94837300cf6e4e0ad-dirty
ingest: generation 1 — 7 nodes, 23 chunks; embedded 23, carried 0, failed 0
pre-flip delta vs gen 0: 0 -> 7 nodes (+7 / -0)
  added:   ["knowledge/governance-ladder","knowledge/refund-policy","knowledge/surfaces#section","knowledge/surfaces/for-agents","knowledge/surfaces/for-people","knowledge/surfaces/overview","knowledge/what-is-a-ksor"]
FLIPPED active generation -> 1
gc: nothing collectable (active/rollback/grace all hold)
```

Seven nodes: your six documents and the `surfaces` folder, which is a node of
its own. The `source:` sha is your commit, and `-dirty` because `refresh` ran
`ksor build` first and the lock it rewrote is not committed yet — provenance
being precise about that, as in Part 1.

Seven seconds, and your record is published as **generation 1** — the number
every answer will cite.

### 8. Serve it

> **Ask your agent:**
> Start the server in the background and tell me the URL.

<details><summary>Do it yourself</summary>

```sh
npm run serve
```

If port 8080 is taken, the refusal tells you so and offers
`KSOR_MCP_PORT=8081 ksor serve`.
</details>

```
ksor serve · handbook
  db          direct endpoint · local
  audience    public
  generation  1 · 7 nodes · source 5bfbaafd809e199e44453ad94837300cf6e4e0ad-dirty
  trust       unverified
  auth        DISABLED — 127.0.0.1 only, and a public bind will refuse to boot
  abstain     OFF — no floor calibrated; out-of-corpus questions will be answered, not refused
  serving     http://127.0.0.1:8080/mcp
```

_This is the one block on the page that was not captured on 2026-09-01: the
`generation` line landed the day after, and every label moved two columns to
make room for it. The values are the walk's own — generation 1, the seven nodes
step 7 published, and the commit its `source:` line names._

The `generation` line says what the door is serving. It would read
`NONE — nothing published; run npm run refresh` if you had started the server
before step 7, because serving does not publish. And read that `abstain` line —
it is telling you the truth about what this record cannot do yet. We come back
to it at the end.

### 9. Point your agent at your own record

> **Ask your agent:**
> Add my record to `.mcp.json` as `handbook`, pointing at that URL.

<details><summary>Do it yourself</summary>

```json
"handbook": { "type": "http", "url": "http://127.0.0.1:8080/mcp" }
```

</details>

### 10. Restart your agent, and ask it

**Start a new session.** MCP servers are read when a session begins, so your
agent cannot see the one you just added until it restarts. This is the one piece
of ceremony in the whole tutorial, and it is real.

> **Ask your agent:**
> How long does a customer have to return something?

It answers from your record, and the answer carries where it came from:

```json
"provenance": {
  "corpus_id":  "handbook",
  "stable_id":  "knowledge/refund-policy",
  "generation": 1,
  "retrieved_at": "2026-09-01T12:02:45Z"
},
"governance": {
  "status": "stable",
  "trust_tier": "unverified",
  "approval": { "by": "human:you", "checked": "policy" }
}
```

That is the whole point. Not "an AI said 30 days" — **this document, in this
publication, approved by this person, said 30 days**, and you can open it.

---

## What you do not have yet

Two honest gaps, each with a tutorial behind it.

**This record answers everything it can find.** The boot report said
`abstain OFF`, and it meant it: ask it something your record knows nothing about
and it will return its closest guess rather than declining. Teaching a record to
say _"I don't know"_ is a **measurement**, not a setting: you give it real
questions your record answers, it measures where those score against questions
it does not, and it prints a floor. That measurement is
[tutorial 4, Serve it — with a floor](./04-serve-it.md); the reference
procedure is in `packages/ksor/docs/ingesting.md` under "Turning the
abstention gate on".

**The record is still mostly about KSoR.** Five of your seven documents are
starter scratch paper. Replacing them with your organisation's actual knowledge
— and retiring the tool that approved them — is
[tutorial 2, Make it yours](./02-make-it-yours.md). It starts with the
`intake-interview` skill the scaffold ships, brings in one file of yours and
one thing nobody ever wrote down, and ends with a record that is only yours.

---

## Reference

| command             | what it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | the site, hot-reloading, drafts visible and marked   |
| `npm run check`     | the record checker — run before every commit         |
| `npm run build`     | check the record, regenerate indexes, write the lock |
| `npm run provision` | apply the schema, authorize ingest — once            |
| `npm run refresh`   | build, embed, publish a generation                   |
| `npm run serve`     | the MCP server, over what you published              |

`docs/status.md` is authoritative on what the current release supports. If it
and this tutorial ever disagree, it wins.
