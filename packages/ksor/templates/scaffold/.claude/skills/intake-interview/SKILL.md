---
name: intake-interview
description: The first conversation with the owner of this Knowledge System of Record — seven questions that define what it is authoritative for, who may read it and who may approve it, then write instance.md together. Use when the owner asks to set up, configure, or "get started with" this project, when instance.md still contains its scaffold placeholder text, or when the scope of the corpus is unclear.
metadata:
  version: "1.5.0"
---

# Intake interview

`instance.md` is the identity of this Knowledge System of Record, and its
prose IS the agent surface's system prompt (`ksor serve` wires it into the MCP
server's instructions). Do not draft it from guesses — interview the owner, one
question at a time, and write down what they actually say.

## Ask THREE questions, one at a time

Seven questions is where this skill used to start, and it did not survive
contact: an agent running it decided five were too many, defaulted them, and
reported "answered: all seven" — including the one that decides who may
approve a document. A process the tool executing it shortcuts is too long.

So three are asked, and they are the three that cannot be defaulted:

1. **Scope** — "What should this record be the _final word_ on? Finish the
   sentence: when someone here disagrees with this corpus, the corpus wins
   about ___."
2. **Boundary** — "What is just _outside_ that — the near-miss topics people
   will ask about here that the record should refuse rather than guess at?"
3. **Authority** — "Who may approve a document for publication, and who may
   withdraw one?"

Scope and Boundary are asked because the abstention gate is meaningless
without an edge: a record authoritative for everything has no outside, so an
agent asked something the owner never wrote about reaches for its training
instead of declining. Authority is asked because a governance act names its
actor and the tool never guesses one — the scaffold ships `human:you` in
both authority lists, and a placeholder that survives this conversation is a
person who was never there.

Follow up until each is concrete. "Our engineering docs" is not yet an
answer; "our leave, expense and conduct policies — the current ones, not
historical versions" is.

## Then STATE the defaults; do not ask them

Show these as a block, say they are defaults, and invite a correction. Do not
walk them one at a time — they are near-constant, and asking makes the
interview feel like a form.

|           | default                                           |
| --------- | ------------------------------------------------- |
| read by   | people and agents both                            |
| declines  | firmly — "not in this corpus" is a correct answer |
| audiences | one, `public` — every reader sees every document  |
| sources   | none yet — the corpus is still the samples        |

Each is written only if the owner does not object, and the write-back names
which were answered and which were defaulted. **Never report a default as an
answer.** Two answered and four defaulted is an honest sentence; "all seven
answered" is not, and it is what happened the first time this skill ran.

**If the owner says NOT every reader sees every document**, then and only
then: register each audience in `.ksor/governance.yaml` under `audiences:`
with a one-line `description:` of who is in it — `public` is reserved and
never registered. There is no ranking and no default: a document lists the
audiences that may read it, a reader holds a list that always includes
`public`, and the document is visible when the two lists OVERLAP. Tell them
what this does and does not do: builds are made per audience, but anyone who
can clone the repository reads everything in it — if someone must not read a
document and can clone, that document belongs in a different repository.

## What the answers become

Scope and Boundary become the BODY of `instance.md`, which `ksor serve` wires
into the MCP server's instructions — so it is read by every agent that
connects, and vague prose there is vague instructions everywhere.

Authority becomes `approval_authorities` and `takedown_authorities` in
`.ksor/governance.yaml`. Names, not roles-in-the-abstract: the checker refuses
an approval or a takedown by anyone the policy does not name. An actor is
`human:<handle>`, `process:<name>` or `<producer>/<version>`; handles are
published with the record, so use the handle the owner would put in a commit,
never an email address.

## Then write

- Rewrite `instance.md` from the answers. `title:` is the record's
  **display title**, the human name every page leads with ("Acme Operations
  Handbook", not the slug); `description:` is one sentence, and it seeds
  `llms.txt` and the MCP discovery document; the BODY is the authority
  sentence, boundary, audience and strictness — plain prose, handed in full
  to every connecting agent as the MCP server's instructions, so write it
  for a reader who must act on it. There is no `# H1`: the title is a key.
  Leave `name:` and `toolchain:` alone. One block is added here only when
  the owner stands up the served MCP rung — `database:`/`embedding:`/
  `retrieval:` (see `AGENTS.md` → "Serving to agents"; that is a later
  climb, not part of this interview). The strictness answer from question 5
  is the intent behind the `retrieval.vector_floor` on that climb, measured
  by `ksor calibrate` — capture it in the prose now so it is ready.
- Write `.ksor/governance.yaml` from questions 6 and 7: `version: "0.1"`,
  the `audiences:` registry if there is one, and the two authority sets with
  real actors. That file is the root of authority — every approval, every
  deprecation and every ledger entry is checked against it. **Keep
  `ksor-starter/KSOR-STAMP-VERSION` in `approval_authorities` while any starter
  document is still in `knowledge/`.** Those five are approved by it, so a
  policy rewritten without it refuses the next build by name
  (`ksor-approver-unauthorised`). It leaves when the last sample does.
- **Offer to start replacing the starter documents — they are already
  published.** All five ship `status: stable`, approved by
  `ksor-starter/KSOR-STAMP-VERSION`, so the site and `llms.txt` carry them from
  the first build. They describe KSoR itself rather than the owner's
  organisation. Say it plainly: "Five sample documents about KSoR are published
  on your record right now. The tool that wrote them approved them — nobody has
  reviewed them, which is what the _unverified_ tier on each page says. Shall we
  start replacing them with yours?" Replacing means deleting the sample and
  writing a real document at `status: draft`; the owner approves it afterwards,
  and that act is theirs. When the last sample is gone, delete
  `ksor-starter/KSOR-STAMP-VERSION` from `approval_authorities` in the same
  change — nothing of theirs should be approved by a tool. Never record an
  approval nobody gave, and never write a `verified` entry: the approval is not
  a review, and inventing one would retire the tier that exists to say nobody
  has checked this.
- Run `ksor build` afterwards: it regenerates every folder's `index.md` from
  the new title and refuses anything the profile does not accept.
- Restart `pnpm dev` afterwards so the site picks the new title up, and
  show the owner their name on the page.
- Offer to capture the source list from question 4 as the first real
  documents (the add-sources skill takes it from there).
- Read the result back to the owner and get an explicit yes before
  finishing. Their words, tightened — never your invention.
