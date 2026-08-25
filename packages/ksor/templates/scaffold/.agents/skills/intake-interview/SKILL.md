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

## The first six questions

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
   not, what are the audiences?" A yes is the common answer and the whole
   answer: register none, and every document says `ksor.audience: [public]`.
   Anything else means registering each audience in
   `.ksor/governance.yaml` under `audiences:`, with a one-line
   `description:` of who is in it — `public` is reserved and never
   registered. There is no ranking and no default: a document lists the
   audiences that may read it, a reader holds a list that always includes
   `public`, and the document is visible when the two lists OVERLAP. Tell
   the owner what this does and does not do: builds are made per audience,
   but anyone who can clone the repository reads everything in it — if
   someone must not read a document and can clone, that document belongs in
   a different repository.

## Then ask the seventh, because a policy cannot be guessed

7. **Authority** — "Who may approve a document for publication, and who may
   withdraw one?" Names, not roles-in-the-abstract: they become
   `approval_authorities` and `takedown_authorities` in
   `.ksor/governance.yaml`, and the checker refuses an approval or a
   takedown by anyone the policy does not name. The scaffold ships
   `human:you` in both — a placeholder that must not survive this
   conversation. An actor is `human:<handle>`, `process:<name>` or
   `<producer>/<version>`; handles are published with the record, so use the
   handle the owner would put in a commit, never an email address.

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
