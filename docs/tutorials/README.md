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

## Start here

### [Tutorial 1 — KSoR: One Governed Knowledge Record for Humans and AI Agents](./01-introduction-to-ksor.md)

The introduction. No technical background required.

You will follow one hospital story the whole way through, and come out understanding: why AI helpers give different answers to the same question, the difference between a traditional System of Record and a Knowledge System of Record, the **eight concepts** behind KSoR (one official book, what goes in it, stamps, the door, "I don't know", show the page, getting a page in, many doors), the trust ladder, and where KSoR applies in education and enterprise. It ends with your first running KSoR and a small governed-knowledge exercise.

> 🎥 Companion session: [KSoR — Introduction and the Eight Concepts (YouTube)](https://www.youtube.com/watch?v=EeTGuQJbHCg)

**Prerequisites:** none for the concepts; Node.js 24+ for the hands-on part.

---

## Coming next in this series

2. **Build a Real Governed KSoR** — grow the Tutorial 1 exercise into a real corpus: scope, governance metadata, resolving a conflict between two concepts, publishing the human site.
3. **KSoR Governance in Practice** — ownership, audiences, approvals, lifecycle states, effective dates, takedown, and fail-closed behavior.
4. **Serve a KSoR to AI Agents with MCP** — provision Postgres + pgvector, publish a generation, connect an MCP client, retrieve citations, and test abstention.
5. **Combine KSoR with Traditional Systems of Record** — an agent that applies governed policy to current operational facts from an ERP, CRM, or accounting system.
6. **Exchange Governed Knowledge with OKF** — package and move governed knowledge between systems without creating a second source of truth.

---

## Conventions

- Tutorials are numbered `NN-title.md`; each tutorial's images live in a matching `NN-assets/` directory (e.g. `01-assets/` for Tutorial 1).
- Tutorials teach the KSoR **architecture**; where the beta differs, they say so and point to [`docs/status.md`](../status.md).
- Follow the tutorials in order if you are new — each builds on the last.

## Contributing a tutorial

Tutorials are contributions like any other — see [`CONTRIBUTING.md`](../../CONTRIBUTING.md). A good KSoR tutorial teaches one thing, tells a story before it names a technology, maps every metaphor to the real framework term, and ends with the reader having *done* something. Tutorial 1 is the reference for the style.

---

*KSoR is open source under Apache 2.0 — [github.com/panaversity/ksor](https://github.com/panaversity/ksor).*
