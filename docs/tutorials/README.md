# KSoR Tutorials

Hands-on, beginner-first guides to the **Knowledge System of Record (KSoR)** — learn the concepts through stories and examples, then build one yourself.

Each document in the KSoR project has a distinct job. Tutorials are the **explanatory and experiential** layer:

| Document | Role |
| --- | --- |
| [Repository README](../../README.md) | The full framework reference — responsibilities, architecture, trust ladder |
| [KSP-001 Standard Proposal](../../research/) | The normative open specification |
| [`docs/status.md`](../status.md) | The implementation authority — what the current release supports |
| **`docs/tutorials/`** (you are here) | Learn it, understand it, run it |

If a tutorial and `docs/status.md` ever disagree about what runs today, `docs/status.md` wins.

---

## Start here — in reading order

### [Introduction — KSoR: One Governed Knowledge Record for Humans and AI Agents](./00-introduction-to-ksor.md)

Read this if you want to understand why this exists. No technical background
required. You will follow one hospital story the whole way through, and come
out understanding: why AI helpers give different answers to the same question,
the difference between a traditional System of Record and a Knowledge System
of Record, the **eight concepts** behind KSoR (one official book, what goes in
it, stamps, the door, "I don't know", show the page, getting a page in, many
doors), the trust ladder, and where KSoR applies in education and enterprise.

> 🎥 Companion session: [KSoR — Introduction and the Eight Concepts (YouTube)](https://www.youtube.com/watch?v=EeTGuQJbHCg)

### [Hello world — a governed record, in about fifteen minutes](./01-hello-world.md)

Hands on the keyboard from the first line. You write one document, watch the
record refuse to publish it until a human approves it, then ask your own coding
agent a question and get an answer that names which document and which
publication it came from.

Two parts, matching the two surfaces a record serves. **Part 1 needs nothing but
Node** — no database, no key, no account. Part 2 adds the agent surface and
needs two more things, both free. Every command and output in it was run and
pasted as it appeared.

Read this if you want to see it work. Skip the introduction and come back to
it — the tutorial stands on its own.

### [Make it yours — your knowledge, your record, in about half an hour](./02-make-it-yours.md)

Picks up where hello world leaves off. You run the intake interview, bring in
one policy that already exists as a PDF — and watch a shipped check catch the
one number the conversion got wrong — then write down one procedure that only
ever lived in someone's head, with the thing they were not sure of recorded as
an open question rather than smoothed into prose. Then the samples go, and
nothing left in the record was approved by anything but a person.

Two refusals do work for you on the way, and the tutorial says exactly which
state each one fires on. Every output was run and pasted as it appeared.

### [Governance in practice — who may read, who decided, and what the record refuses](./03-governance-in-practice.md)

Picks up where make-it-yours leaves off, with no database and no key. You
restrict one document to a second audience and watch the public build leave it
out of `llms.txt` while the employee build carries it; record a second person's
review and see the trust tier move; give a policy an effective date and build
the same record at two instants; replace a document and withdraw another
through the takedown ledger, then lift it. Eleven refusals fire along the way,
each stopping something the record could not stand behind — a takedown with no
name on it, a deleted ledger line, an approved document edited after its
approval. Every output was run and pasted as it appeared.

---

## Coming next in this series

2. ~~Build a Real Governed KSoR~~ — shipped as [Make it yours](./02-make-it-yours.md).
3. ~~KSoR Governance in Practice~~ — shipped as [Governance in practice](./03-governance-in-practice.md).
4. **Serve a KSoR to AI Agents with MCP** — provision Postgres + pgvector, publish a generation, connect an MCP client, retrieve citations, and test abstention.
5. **Combine KSoR with Traditional Systems of Record** — an agent that applies governed policy to current operational facts from an ERP, CRM, or accounting system.
6. **Exchange Governed Knowledge with OKF** — package and move governed knowledge between systems without creating a second source of truth.

---

## Conventions

- Tutorials are numbered `NN-title.md`; each tutorial's images live in a matching `NN-assets/` directory (e.g. `00-assets/` for the introduction).
- Tutorials teach the KSoR **architecture**; where the beta differs, they say so and point to [`docs/status.md`](../status.md).
- Follow the tutorials in order if you are new — each builds on the last.

## Contributing a tutorial

Tutorials are contributions like any other — see [`CONTRIBUTING.md`](../../CONTRIBUTING.md). A good KSoR tutorial teaches one thing, tells a story before it names a technology, maps every metaphor to the real framework term, and ends with the reader having *done* something. The introduction is the reference for the style.

---

*KSoR is open source under Apache 2.0 — [github.com/panaversity/ksor](https://github.com/panaversity/ksor).*
