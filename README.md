<p align="center">
  <img src="https://raw.githubusercontent.com/panaversity/ksor/main/repo-image.png" alt="KSoR — open, vendor-neutral knowledge infrastructure for AI-native organizations" width="100%">
</p>

# KSoR

**Open, vendor-neutral knowledge infrastructure for AI-native organizations.**

A **Knowledge System of Record (KSoR)** is an open, vendor-neutral knowledge infrastructure framework. It gives an organization **one governed, authoritative knowledge record** and open, replaceable ways to publish, retrieve, discover, exchange, secure, verify, and observe that knowledge.

Traditional Systems of Record establish what is true about the current state of a business. A KSoR establishes **what the organization knows and how it should operate**.

The framework reduces to three commitments:

> **One authoritative record.**  
> **One governance boundary.**  
> **Many open projections.**

And one operating principle:

> **Govern knowledge once. Project it many ways.**

Humans, AI systems, agents, and other knowledge systems reach the same institutional truth through different governed surfaces. Development tooling such as `AGENTS.md` and reusable skills can help maintain that record, but it never becomes a competing source of truth.

The result is not merely a documentation site, knowledge base, vector database, RAG system, or MCP wrapper.

> **KSoR is an open knowledge infrastructure framework for the AI-native organization.**

---

## Start here

All you need is Node 24 or newer. Use whichever package manager you already
have — npm, pnpm, or bun — and the project it creates will use that same
manager everywhere:

**npm**

```bash
npx @panaversity/ksor@latest init my-knowledge-sor
cd my-knowledge-sor && npm install && npm run dev
```

**pnpm**

```bash
pnpm dlx @panaversity/ksor@latest init my-knowledge-sor
cd my-knowledge-sor && pnpm install && pnpm dev
```

**bun**

```bash
bunx @panaversity/ksor@latest init my-knowledge-sor
cd my-knowledge-sor && bun install && bun run dev
```

Open `http://localhost:3000`. Your knowledge site is running, and it reloads
as you edit the Markdown files in `knowledge/`. What you have is a complete,
ordinary project — your knowledge, a working website, a CI workflow, and
instructions for coding agents — and it is entirely yours: nothing is
downloaded at build time, and nothing phones home.

**Next, open the project in the coding agent you already use** (Claude Code,
Cursor, Copilot — any of them) **and tell it what this knowledge base is
for.** That is how you work with KSoR day to day: you write plain Markdown,
in whatever language you write in, and the agent handles the checks and
structure around it. The project ships `AGENTS.md` with the working rules,
and the agent will interview you to replace the placeholder in `instance.md`
— the file that says what this knowledge base covers.

Two commands are worth knowing on day one (shown with pnpm here and for the
rest of this page; your own project's README uses your manager):

```bash
pnpm check    # validates your knowledge files — run it before sharing a change
pnpm build    # builds a fully static site into system/site/out/, hostable anywhere
```

**Later, when you want AI agents to query your knowledge directly**, you add
a Postgres database and an embedding API key, then run three commands:
`pnpm provision` once, `pnpm refresh` to publish, and `pnpm serve`. The full
path is in [Serve to AI Agents](#serve-to-ai-agents) below.

The rest of this page explains _why_ KSoR is built this way. To go straight
to the practical reference, jump to [Requirements](#requirements).

---

## Why KSoR Exists

Enterprises have relied on **Systems of Record** for decades.

An accounting system is authoritative for financial transactions.
A CRM is authoritative for customer records.
An HRIS is authoritative for employee records.

When a spreadsheet disagrees with the accounting ledger, the ledger wins.

These systems answer an important question:

> **What is the authoritative operational state of the business?**

AI agents introduce a second problem.

Agents also need to know:

- What policies apply?
- What rules govern this decision?
- Which procedure should be followed?
- What does this organization mean by this term?
- Which thresholds are approved?
- Which methodology should be used?
- What exceptions exist?
- What sources support this answer?
- What should the agent do when the answer is not known?

That knowledge is usually fragmented across:

- documents,
- wikis,
- PDFs,
- slide decks,
- websites,
- policies,
- manuals,
- repositories,
- employee experience,
- prompts,
- RAG indexes,
- and model context.

There is often no authoritative answer to:

> **Which knowledge should the AI trust?**

KSoR exists to solve that problem.

---

## The KSoR Framework: Nine Responsibilities

KSoR is an **open, vendor-neutral knowledge infrastructure framework**,
built around three commitments:

> **One authoritative record.**  
> **One governance boundary.**  
> **Many open projections.**

That model in one picture:

```text
                      KSoR FRAMEWORK
      open, vendor-neutral knowledge infrastructure
                             │
                    AUTHORITATIVE CORE
                     Governed Markdown
                   (KSoR Profile of OKF)
                             │
                    GOVERNANCE BOUNDARY
                             │
      ┌──────────────┬───────┴───────┬──────────────┐
      │              │               │              │
      ▼              ▼               ▼              ▼
  Human site    AI discovery   Agent surface    Exchange
   Fumadocs       llms.txt          MCP       governed OKF
                                     │           bundles
                                     ▼
                              Retrieval layer
                            Postgres + pgvector
```

Identity (OAuth/OIDC), publication integrity (SLSA/Sigstore), and
observability (OpenTelemetry) cut across every surface without becoming
knowledge stores.

### The nine responsibilities

The framework separates **nine responsibilities**, so that no single product
becomes the knowledge authority. Wherever an open format, convention, or
protocol already owns a boundary, KSoR adopts it rather than competing with
it:

| Responsibility        | Open standard / reference binding   | What it means                                                                 |
| --------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| Authoritative record  | Markdown in the KSoR Profile of OKF | Markdown is the durable medium; the profile gives it open, portable structure |
| Retrieval             | Postgres + pgvector                 | structured, lexical, and semantic search over the governed record             |
| Human publication     | Fumadocs                            | the reference human-readable site                                             |
| AI discovery          | `llms.txt`                          | tells AI systems what knowledge exists and where machine-readable pages are   |
| Agent interaction     | MCP                                 | search, retrieval, citation, and abstention for agents                        |
| Knowledge exchange    | OKF                                 | the same native representation moves governed knowledge between systems       |
| Identity              | OAuth / OIDC                        | who is asking — KSoR governance then decides what they may see                |
| Publication integrity | SLSA / Sigstore                     | proof of which source and build produced a published artifact                 |
| Observability         | OpenTelemetry                       | what the infrastructure did, without becoming another knowledge store         |

The same model as a stack, each line resting on the one beneath it — which
is why OKF sits _under_ KSoR, not beside it:

> **Markdown is the authoritative medium.**  
> **OKF makes that record open and portable.**  
> **KSoR governance makes it authoritative.**  
> **Postgres + pgvector make it retrievable.**  
> **Fumadocs serves humans.**  
> **`llms.txt` lets AI discover it.**  
> **MCP lets agents interact with it.**  
> **OAuth/OIDC establishes identity; KSoR governs access.**  
> **SLSA/Sigstore proves what was published.**  
> **OpenTelemetry tells us what happened.**

Governance is deliberately not one of the nine. It is the **boundary** the
nine are arranged around: no knowledge crosses a serving or publication
boundary without first passing the applicable governance decision. For a
static build that decision runs once per audience-specific build; for dynamic
retrieval it runs per request; the policy is the same either way.

The governance boundary is what turns a set of useful technologies into a
Knowledge System of Record. Without it, the components above would merely
form another knowledge stack.

And the boundaries — not the products — are the standard. Postgres + pgvector
and Fumadocs are reference implementation choices; a conformant alternative
may replace them. What may not vary is the governance semantics: one policy,
every surface.

The full specification — the profile, the conformance classes, the
governance requirements — is the **[KSoR Standard Proposal
(KSP-001)](research/ksor-standard-proposal-001-v0.1-draft10.md)**, an open
standard written so that anyone can implement a conformant KSoR. It defines
five conformance classes — a corpus (A), a publisher (B), a retrieval layer
(C), an agent surface (D), and exchange (E) — plus optional profiles for
identity, publication integrity, and computation attestation. A complete
KSoR implements all five classes; a partial implementation (a corpus linter,
say) is valid too, and states its class.

Which of the nine responsibilities the shipped tool implements today is
recorded in [`docs/status.md`](docs/status.md) — always the authority, never
inferred from this section.

---

## What Is a Knowledge System of Record?

A **Knowledge System of Record — KSoR — is the authoritative, governed knowledge layer that humans, AI agents, and software use to understand, decide, and act.**

It can contain:

- domain knowledge,
- policies,
- procedures,
- rules,
- standards,
- methods,
- definitions,
- decision criteria,
- thresholds,
- specifications,
- controls,
- examples,
- exceptions,
- workflows,
- provenance,
- and supporting source material.

The goal is not merely to make information searchable.

The goal is to establish:

> **This is the knowledge we operate from.**

---

### Traditional SoR vs. KSoR

A traditional System of Record and a Knowledge System of Record solve different problems.

|                  | Traditional System of Record                            | Knowledge System of Record                                   |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| Primary purpose  | Record operational state                                | Record institutional knowledge                               |
| Typical contents | Transactions, balances, customers, employees, inventory | Rules, policies, methods, procedures, standards, definitions |
| Typical systems  | ERP, CRM, HRIS, accounting system                       | KSoR                                                         |
| Core question    | **What is true right now?**                             | **What do we know and how should we operate?**               |
| Optimized for    | Applications and business processes                     | Humans, AI agents, and software                              |
| Authority        | Operational data                                        | Governed knowledge                                           |
| Change mechanism | Transactions                                            | Review, governance, versioning                               |
| AI role          | Tool consumer                                           | First-class knowledge consumer                               |

AI-native organizations need both.

```text
                         AI Agent
                            │
             ┌──────────────┴──────────────┐
             │                             │
             ▼                             ▼
     Knowledge System                Traditional
       of Record                       Systems
        (KSoR)                        of Record
             │                             │
       "How should I                  "What is true
         operate?"                     right now?"
             │                             │
      Rules · Policies            Customers · Orders
      Methods · Standards         Balances · Inventory
      Procedures · Specs          Transactions · State
```

A capable enterprise agent may read policy from a KSoR, retrieve current account data from a CRM, apply the governed rule, execute an action, and record the resulting state back into the traditional SoR.

---

## KSoR Is More Than a Knowledge Base

A knowledge base stores information.

A KSoR establishes **authority**.

That distinction matters.

A conventional knowledge base may optimize for:

- storage,
- search,
- retrieval,
- similarity,
- document discovery,
- or question answering.

A Knowledge System of Record must additionally answer:

- Who owns this knowledge?
- Where did it come from?
- Which version is authoritative?
- Has it been reviewed?
- What is its scope?
- What happens when sources conflict?
- Can an AI distinguish evidence from inference?
- Can an answer be traced back to its source?
- What should happen when the KSoR does not contain the answer?

KSoR therefore treats **governance, provenance, citations, versioning, and abstention** as architectural concerns rather than optional features.

---

## Retrieval Is Not the Product

KSoR may use search, indexing, embeddings, full-text retrieval, structured lookup, or other retrieval techniques.

Those mechanisms are implementation details.

KSoR is not fundamentally:

- a vector database,
- an embedding service,
- a RAG framework,
- a chatbot,
- a document search engine,
- or an MCP wrapper.

Those technologies can help deliver a KSoR.

They do not make something a KSoR.

The defining property is **authoritative governed knowledge**.

Retrieval is one responsibility of nine ([The KSoR
Framework](#the-ksor-framework-nine-responsibilities)); the record, and the
governance boundary around it, are what define a KSoR.


---

## One Source. Multiple Projections.

KSoR follows a simple principle:

> **Humans, AI agents, software, and other knowledge systems should not operate from different versions of organizational knowledge.**

The governed record is the authority. Every outward surface is a projection or controlled interface over that record rather than a separately maintained knowledge store.

```text
                         Governed Record
                  Markdown + KSoR Profile of OKF
                                │
                                ▼
                       GOVERNANCE BOUNDARY
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
       Humans              AI Discovery            Agents
      Fumadocs               llms.txt                MCP
                                                        │
                                                        ▼
                                                Retrieval layer
                                              Postgres + pgvector
                                │
                                ▼
                         Knowledge Exchange
                                OKF
```

OAuth/OIDC establishes identity for protected surfaces, KSoR governance controls access, SLSA/Sigstore can attest what was published, and OpenTelemetry records what the infrastructure did.

These surfaces have different jobs:

- **Fumadocs** serves people.
- **`llms.txt`** helps AI systems discover the record.
- **MCP** lets agents search, retrieve, cite, and abstain against governed knowledge.
- **OKF** gives the authoritative record its open, portable structure and lets knowledge systems exchange governed knowledge.
- **Postgres + pgvector** is the reference retrieval implementation behind the agent surface.

A KSoR can also carry an **agent-first maintenance context** such as `AGENTS.md` and reusable skills. That context tells coding agents how to work on the governed record safely. It is development infrastructure, not a projection and not authoritative knowledge.

The human experience is not maintained as a separate knowledge source.

The MCP interface is not an invisible copy of the website.

Machine-readable outputs are not another knowledge store.

They are different ways of reaching the **same governed source**.

---

## The Trust Ladder

Not every way of serving knowledge gives the same guarantee, and a KSoR
refuses to pretend otherwise. The trade is explicit, as a ladder: **wider
reach means weaker guarantees.**

| Rung | Channel                                                 | Reach                               | Guarantee                                                                                                                                          |
| ---- | ------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Discovery** — the site, `llms.txt`, per-page Markdown | any AI system can read them         | content passed the governance filter when published; nothing after that — no citation discipline, no abstention, no freshness check at answer time |
| 2    | **Governed interaction** — MCP                          | AI agents doing organizational work | retrieval filtered by governance before ranking, results cited and traceable to a generation, abstention enforced                                   |
| 3    | **Computation attestation** — proposed, experimental    | specific critical numbers           | a reported value was produced by the sanctioned computation and mechanically checked, or it is not shown at all                                     |

The ladder, not any single rung, is the product. It also answers an honest
objection: a system built on citation-before-confidence can still ship a
corpus file that is downloaded once and never checked again — because that
file's rung is stated and its limits are not hidden. Which knowledge needs
which rung is a decision the organization makes, not the tooling.

---

## Core Principles

### 1. One Authoritative Source

Knowledge should have one canonical location.

Different consumers may receive different representations, but those representations must derive from the same source.

---

### 2. Humans, Agents, and Software Are First-Class Consumers

Knowledge architecture can no longer assume that only people will read documentation.

Every important piece of institutional knowledge should be usable by:

- humans,
- AI assistants,
- autonomous agents,
- agent workflows,
- applications,
- and machine-readable tooling.

Different consumers may require different representations, but those representations should derive from the same governed record.

---

### 3. Provenance Matters

An answer is much more useful when you can determine:

- what document it came from,
- which version was used,
- when it was built,
- and what source supported the claim.

KSoR preserves the chain from source knowledge to generated projections.

---

### 4. Citation Before Confidence

An AI sounding confident is not evidence.

KSoR is designed around traceable answers.

The agent should be able to identify the knowledge that supports its answer rather than relying on model memory.

---

### 5. Abstention Is a Feature

A governed AI system needs to know the boundary of its knowledge.

When the KSoR does not contain enough information to support an answer, the correct behavior is:

> **The Knowledge System of Record does not contain enough information to answer this.**

—not improvisation.

---

### 6. Governance Before Retrieval

Retrieval technology is not the hard part.

A perfectly optimized search system over ungoverned knowledge simply retrieves ungoverned knowledge faster.

The more important questions are:

- What belongs in the KSoR?
- Who can change it?
- What constitutes an authoritative source?
- How are conflicts resolved?
- How are changes reviewed?
- What is obsolete?
- What requires human judgment?

KSoR treats those questions as fundamental.

And one rule binds every surface: **no knowledge crosses a serving or
publication boundary without first passing the applicable governance
decision.**

---

### 7. Vendor Neutrality

Your institutional knowledge should not belong to an AI model vendor.

KSoR keeps the knowledge layer independent from the model layer.

The mechanism is open standards at every boundary — OKF for the record, MCP
for agents, OAuth/OIDC for identity, SLSA/Sigstore for provenance — with the
reference components behind each boundary replaceable. KSoR invents no
format and no protocol where an open one exists.

The same governed knowledge should be usable from:

- ChatGPT,
- Claude,
- coding agents,
- agent frameworks,
- custom applications,
- Digital FTEs,
- and future AI runtimes.

Models can change.

Your institutional truth should remain yours.

---

## What Can You Build with KSoR?

KSoR is intentionally not limited to a particular industry or type of knowledge.

### Organizational KSoRs

Examples:

```text
Agent Factory KSoR
Engineering KSoR
Product Management KSoR
Company Operations KSoR
Security KSoR
AI Governance KSoR
```

### Domain KSoRs

Examples:

```text
Accounting KSoR
Government Contracting KSoR
Healthcare KSoR
Legal KSoR
Banking KSoR
Insurance KSoR
Supply Chain KSoR
Sales KSoR
```

### Product or Method KSoRs

Examples:

```text
Design System KSoR
API Standards KSoR
Architecture KSoR
Implementation Method KSoR
Compliance Framework KSoR
Operating Model KSoR
```

The SDK does not impose verticality.

A **Vertical KSoR** is simply one application of KSoR: an authoritative knowledge layer for a particular profession, industry, or domain.

---

## Example

Imagine an Accounting KSoR containing:

```text
knowledge/
├── accounting-policies/
│   ├── revenue-recognition.md
│   ├── capitalization.md
│   └── bad-debt.md
├── procedures/
│   ├── month-end-close.md
│   └── journal-entry-review.md
├── controls/
│   ├── segregation-of-duties.md
│   └── approval-thresholds.md
├── definitions/
│   └── glossary.md
└── examples/
    └── revenue-recognition-examples.md
```

An employee can browse those documents through the generated website.

An accounting agent can access the same governed knowledge through MCP.

If asked:

> Can this $42,000 software implementation cost be capitalized?

the agent should retrieve the organization's capitalization policy, apply the relevant criteria, cite the governing source, and distinguish between what the KSoR states and any reasoning required to apply it.

If the capitalization policy does not address the situation, the system should not invent a policy.

---

## Quick Start

> **Status:** `ksor init` works, and `ksor serve` runs the MCP server over a
> built record (with `ingest`/`schema`/`calibrate`/`gc` — the climbed rung,
> needing Postgres and a provider key). Only `dev` and `build` remain designed,
> not yet implemented — each prints an honest notice and exits `2` today; the
> scaffold's own `pnpm dev` / `pnpm build` cover local work until they land.
> [`docs/status.md`](docs/status.md) is authoritative on the released version.

### Requirements

Node.js 24 or newer, and the package manager you already use — pnpm, npm, or
bun. `ksor init` emits the scaffold for whichever one runs it; nobody
installs a second package manager to open their own knowledge base.

```bash
node --version
```

Creating a project, running the site locally, and building it are covered in
[Start here](#start-here) at the top of this page — this section continues
where it leaves off.

---

### Serve to AI Agents

First tell `instance.md` which environment variable holds your DSN — never the
DSN itself. This block is the one piece of configuration the served rung needs:

```yaml
database:
  dsn_env: KSOR_DB_URL
```

Then fill in the environment and bring it up — three steps, deliberately
separate:

```bash
cp .env.example .env   # KSOR_DB_URL, GEMINI_API_KEY, KSOR_AUTH=disabled-local

pnpm provision         # ONCE: apply the schema, authorize this tenant to ingest
pnpm refresh           # PUBLISH: ingest knowledge/ into a generation, collect old ones
pnpm serve             # SERVE: the MCP server, over what you just published
```

They are separate on purpose. Applying DDL and granting ingest are acts an
operator performs once; **publishing is the act a system of record exists to
make deliberate**, not a side effect of starting a server. Re-run `pnpm refresh`
whenever you have edited `knowledge/` — everything is re-runnable, and an
unchanged corpus costs nothing.

That serves MCP at `http://127.0.0.1:8080/mcp`, announcing its posture as it
boots (`auth: disabled, abstain gate: OFF (no floor)`).

Skip `pnpm refresh` and the server comes up with nothing published: every search
answers `ok: false, reason: "unpublished"` — the record is empty, which is a
different answer from "not in the record".

The agent projection exposes the governed KSoR through MCP: `search`, `outline`,
and `read` over stateless Streamable HTTP, with cited passages, snapshot
generation-pinning, and honest abstention. `serve` reads `./instance.md` and
runs the MCP server in-process — the climbed rung, so it needs a Postgres store
(pgvector) and an embedding provider key. It **refuses to boot
unauthenticated** — a local run declares `KSOR_AUTH=disabled-local` (which
`.env.example` already carries) and binds loopback, where auth off is the
intended development shape. A public bind needs a configured SSO door instead,
or an explicit `KSOR_AUTH=disabled-public`.

`pnpm serve` is the only command this rung needs: run it the first time, after
editing `knowledge/`, or to bring the server back. Every step reports the state
it found instead of failing, and a rerun on an unchanged record costs nothing —
ingest compares what it read against the generation already serving and, when
they match at the same commit, writes no rows at all. The abstention gate stays
off until you measure a floor with `ksor calibrate` and paste it into
`instance.md` — never copied from another corpus.

---

## Project Structure

A KSoR project is intentionally understandable without proprietary tooling.

KSP-001 defines the target structure below. The released scaffold is still converging on this profile, so [`docs/status.md`](docs/status.md) remains authoritative for exactly what `ksor init` emits today.

```text
my-ksor/
│
├── knowledge/                 ← authoritative governed record
│   ├── what-is-a-ksor.md      ← concept documents: Markdown in the
│   ├── governance-ladder.md      KSoR Profile of OKF
│   └── surfaces/
│       ├── for-people.md
│       └── for-agents.md
│
├── .ksor/
│   └── governance.yaml        ← audiences, ownership, approval,
│                                  and takedown authority
│
├── system/
│   └── site/                  ← reference human surface (Next.js + Fumadocs)
│
├── .agents/
│   └── skills/                ← agent skills (+ byte-identical .claude/ copies)
│
├── AGENTS.md                  ← project constitution agents read first
├── instance.md                ← what this KSoR is authoritative for
│
└── ...
```

Under the KSoR Profile of OKF, `index.md` and `log.md` are reserved OKF files rather than ordinary concept documents. Publishers generate or manage those files according to the pinned OKF contract instead of using `index.md` as a normal content page.

### `knowledge/`

The authoritative governed record.

In the KSP-001 architecture, concept documents are Markdown conforming to the **KSoR Profile of OKF**:

- **Markdown** is the durable, human-readable medium.
- **OKF** gives the record an open, portable knowledge structure.
- **KSoR governance metadata** adds institutional authority: ownership, audience, approval, effectivity, and related controls.

Documents remain:

- portable,
- diffable,
- reviewable,
- version-controlled,
- readable by humans,
- readable by AI coding agents,
- and independent of a proprietary database.

Every concept carries an explicit `ksor.audience`. Public knowledge says `ksor.audience: [public]` rather than relying on omission. Stable concepts carry the authority and lifecycle evidence required by KSP-001.

Subdirectories naturally organize the knowledge hierarchy.

---

### `.ksor/governance.yaml`

The portable **Governance Policy** for the KSoR instance.

It is the root of authority behind the governance facts carried on individual concepts. KSP-001 defines four governance families:

- the **audience registry** names non-public audiences,
- the **ownership map** defines who is accountable for knowledge by scope,
- **approval authorities** define who may approve knowledge for publication,
- **takedown authorities** define who may withdraw knowledge.

A simplified policy can look like:

```yaml
version: "0.1"

audiences:
  finance:
    description: Finance staff and authorized auditors

ownership:
  - scope:
      paths: ["finance/"]
      types: [Policy, Procedure, Control]
    owner: team:finance-controller
    escalation: human:cfo@example

approval_authorities:
  - scope:
      paths: ["finance/"]
      types: [Policy, Procedure, Control]
    actors: [human:cfo@example]

takedown_authorities:
  actors: [human:ciso@example, human:cfo@example]
```

A conformant publisher validates the corpus against this policy before publication. Governance is therefore mechanically checkable rather than only descriptive.

---

### `instance.md`

Describes the identity and purpose of this KSoR instance.

For example:

```markdown
# Accounting KSoR

This Knowledge System of Record contains the governed accounting
policies, procedures, definitions, controls, and decision criteria
used by Example Corporation.
```

---

### `system/site/`

The reference **human projection** — a real Next.js + Fumadocs app that renders the
record, shipped as ordinary source code you own outright rather than an
opaque hosted service. It is replaceable behind a five-clause surface
contract (`specs/ksor/init/spec.md`): any shell that renders the record,
degrades directives to readable text, serves `llms.txt`, passes the browser
smoke, and never emits a document outside the audience it was built for is
equally conformant.

The reference site also exposes machine-readable output such as `llms.txt`.
That output is another projection of the same governed record, not a separately
maintained AI corpus.

---

### `.agents/`

Instructions and reusable skills for AI coding agents working on the KSoR.

KSoR is designed to be **agent-first**.

The agent-maintenance context is not itself authoritative knowledge. It tells coding agents **how to work on the authoritative record safely**.

Instead of forcing users to manually perform repetitive repository operations, the project can carry the instructions an AI coding agent needs for recurring tasks such as:

- adding knowledge,
- importing source material,
- validating structure,
- creating learning material,
- checking provenance,
- building,
- testing,
- and deployment.

---

## Knowledge as Code

KSoR treats institutional knowledge increasingly like software teams treat source code.

That means knowledge can be:

```text
authored
   ↓
reviewed
   ↓
version controlled
   ↓
validated
   ↓
tested
   ↓
built
   ↓
published
   ↓
consumed by humans + agents
```

Git becomes more than storage.

It provides useful primitives for knowledge governance:

- history,
- authorship,
- diffs,
- branches,
- pull requests,
- approvals,
- releases,
- rollback,
- and reproducible builds.

This makes an important shift possible:

> **Institutional knowledge becomes governed infrastructure.**

---

## Build Provenance

Every production answer should be traceable to the knowledge that produced it.

KSoR builds record the exact corpus used to produce a release.

For example:

```text
build.lock.json
```

can capture information such as:

- included documents,
- document hashes,
- source commit,
- KSoR version,
- build version,
- and other reproducibility metadata.

This creates a chain:

```text
AI Answer
    ↓
Retrieved Passage
    ↓
Knowledge Document
    ↓
KSoR Build
    ↓
Git Commit
    ↓
Reviewed Source
```

When someone asks:

> Why did the agent say that?

the architecture should make the answer discoverable.

KSoR binds this responsibility to **SLSA and Sigstore**: provenance
attestation proving which governed source and build produced a published
artifact. The published `@panaversity/ksor` package already ships with npm
provenance attached; corpus-level attestation will land with `ksor build`.

---

## The Agent Projection

KSoR uses the **Model Context Protocol (MCP)** as the agent surface: the governed interaction boundary through which agents search, retrieve, cite — and abstain.

`llms.txt` helps an AI _find_ the knowledge. MCP helps an agent _work with_ it. Moving governed knowledge _between systems_ is OKF's job ([KSoR and OKF](#ksor-and-okf)).

MCP is an interface to the KSoR, not the KSoR itself.

The goal is not to create another model-specific knowledge plugin.

Instead:

```text
                      KSoR
                       │
                      MCP
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
     ChatGPT         Claude       AI Agents
                                      │
                           ┌──────────┼──────────┐
                           ▼          ▼          ▼
                        Custom     Agent      Digital
                         Apps    Frameworks     FTEs
```

The knowledge stays independent.

The model or runtime becomes replaceable.

---

## The Machine Projection

AI-native systems increasingly need knowledge in forms that software can consume directly, without scraping a human documentation interface.

A KSoR can therefore expose representations such as:

- canonical governed Markdown,
- `llms.txt`,
- structured metadata,
- build manifests,
- indexes,
- and other machine-readable artifacts.

These outputs are derived from the same governed record. They do not become independent sources of truth.

One more machine surface completes the set: **governed OKF exchange
bundles** — the same representation the record itself is written in,
filtered by governance and packaged for another knowledge system to import.
Because the record _is_ OKF, exchange is selection and packaging, not
translation. (Specified; not yet shipped.)

The durable asset remains the governed knowledge; each representation is replaceable.

---


## KSoR and OKF

The [Open Knowledge Format
(OKF)](https://github.com/GoogleCloudPlatform/open-knowledge-format) is an
open format for portable knowledge, published by Google Cloud under
Apache-2.0: Markdown documents with YAML frontmatter carrying a trust
vocabulary — sources, verification, freshness, lifecycle — that travels with
the content. OKF is deliberately a format and not a service. Serving,
storage, and query are outside its scope, and its own specification calls its
trust fields "advisory signals, not access control."

**KSoR is built on OKF, and therefore uses OKF for interoperability** — not
the other way around. The authoritative record is not
converted to OKF at the edge; it _is_ an OKF bundle, constrained by the KSoR
Profile. KSoR invents no knowledge serialization of its own, and exchange
between knowledge systems is governed selection and packaging of the same
native representation — never translation into a proprietary exchange schema.

The division of labor is exact:

- **OKF describes knowledge**: representation, portable metadata, sources,
  verification, freshness, production history.
- **KSoR makes that knowledge authoritative and operational**: ownership,
  approval, audiences, takedown, governed retrieval and serving, abstention,
  publication integrity, operations.

Or in two lines:

> **OKF makes KSoR knowledge open, portable, and interoperable.**  
> **KSoR governance makes that knowledge institutionally authoritative and operational.**

Where OKF ends is where KSoR begins. A format can make knowledge portable; it
cannot make it governed. OKF makes knowledge portable. **KSoR makes knowledge
governable.**

The shipped scaffold does not yet emit the KSoR Profile —
[`docs/status.md`](docs/status.md) is the authority on what runs today.

---

## KSoR and RAG

RAG answers:

> How can relevant information be retrieved and placed into model context?

KSoR answers a broader question:

> What knowledge is authoritative enough that an organization permits humans, AI agents, and software to operate from it?

A useful relationship is:

```text
KSoR
│
├── Governance
├── Authority
├── Provenance
├── Versioning
├── Review
├── Scope
├── Human Projection
├── Agent Projection
├── Machine Projection
├── Agent-First Maintenance Context
│
└── Retrieval
     ├── Search
     ├── Structured lookup
     ├── Embeddings
     └── RAG
```

**RAG can be part of a KSoR.**

A KSoR is not merely a RAG system.

---

## KSoR and a CMS

A Content Management System asks:

> How do we create and publish content?

A KSoR asks:

> Which knowledge is authoritative, governed, traceable, and safe for humans, agents, and software to rely upon?

Content is an input.

Institutional knowledge is the asset.

Authority is the differentiator.

---

## Governance Model

A KSoR must govern both sides of authority:

- the **write side** determines how knowledge becomes authoritative,
- the **read side** determines whether that knowledge may cross a serving or publication boundary.

KSP-001 defines the write-side lifecycle this way:

```text
source material
      │
      ▼
draft            authored by a human or agent
      │
      ▼
review           under the authority of the named owner
      │
      ▼
approval         granted by an authorized actor and recorded in change control
      │
      ▼
stable           authoritative knowledge that may be served
      │
      ├── change      re-approve in the same reviewed change,
      │               or return to draft
      │
      ├── deprecated  under owner or takedown authority
      │
      └── takedown    governed withdrawal, then removal from every current surface
```

**Approval is an authority event. `stable` is the lifecycle state.** They are deliberately separate. A concept does not become authoritative merely because someone changed its status text.

Imported knowledge enters as candidate knowledge at `draft`. External trust signals can be preserved as evidence, but they do not become local approval.

The Governance Policy in `.ksor/governance.yaml` defines the audience registry, ownership rules, approval authorities, and takedown authority used to validate these events.

For regulated or high-risk knowledge, organizations can add controls appropriate to their domain, including:

- named knowledge owners,
- approval requirements,
- effective dates,
- source citations,
- mandatory review periods,
- change records,
- conflict resolution,
- separation of duties,
- and audit history.

The organization remains responsible for its governance policy. KSoR makes that policy explicit, portable, and enforceable across every surface.

---

## Knowledge Boundaries

A trustworthy KSoR has a boundary.

The existence of an AI model does not remove that boundary.

Consider three questions:

### In scope

> What approval threshold applies to purchases over $50,000?

If an approved purchasing policy answers the question, KSoR should provide the answer and source.

### Requires reasoning

> Does this particular purchase require CFO approval?

The system may need to combine the governed rule with operational facts from another System of Record.

### Outside the KSoR

> What approval policy will the company adopt next year?

If that information has not been approved and entered into the KSoR, the system should decline rather than speculate.

This distinction is essential for trustworthy agentic systems.

---

## KSoR in an AI-Native Architecture

An AI-native organization cannot rely on model memory, scattered documents, or an ungoverned RAG index as its institutional knowledge layer.

KSoR becomes especially important when AI agents begin performing real organizational work because it gives humans, agents, and software a shared, governed basis for interpretation and action.

```text
                   Human / AI Worker
                          │
                          ▼
                       Agent
                          │
             ┌────────────┴────────────┐
             │                         │
             ▼                         ▼
           KSoR                 Operational SoRs
             │                         │
        Knowledge                  Current State
             │                         │
     Policies / Methods          CRM / ERP / HRIS
     Rules / Procedures          Ledger / Database
     Standards / Specs           Orders / Inventory
             │                         │
             └────────────┬────────────┘
                          │
                          ▼
                       Decision
                          │
                          ▼
                        Action
```

The KSoR tells the agent **how the organization operates**.

Traditional Systems of Record tell the agent **what is currently true**.

Together they provide the context required for reliable enterprise action.

---

## Agent-First Development

KSoR is designed for a development world in which coding agents perform much of the mechanical work.

A scaffolded KSoR can carry machine-readable instructions for tasks such as:

```text
"Add this policy to the KSoR."

"Convert these source documents into governed Markdown."

"Check every page for missing provenance."

"Build a quiz from this section."

"Validate the KSoR."

"Run the test suite."

"Prepare this release."

"Deploy the human surface."
```

The repository therefore becomes both:

1. the knowledge artifact, and
2. the working context for the agents that maintain it.

This allows subject-matter experts and software engineers to collaborate around the same governed source.

---

## Human-Readable by Default

KSoR does not require organizational knowledge to disappear into a vector database.

The canonical source remains inspectable.

A person should be able to:

- open it,
- read it,
- diff it,
- review it,
- copy it,
- migrate it,
- and understand what the AI is being allowed to use.

This is an intentional architectural property.

---

## Vendor-Neutral by Design

Your KSoR should survive changes in:

- LLM providers,
- embedding models,
- vector stores,
- agent frameworks,
- cloud providers,
- AI applications,
- and user interfaces.

The durable asset is the governed knowledge.

Everything around it should be replaceable.

---

## Deployment

The human surface generated by `pnpm build` in a scaffolded project (and by
`ksor build` once that verb ships) is a fully static site.

That makes it suitable for hosts such as:

- Vercel,
- Netlify,
- GitHub Pages,
- static object storage,
- internal web servers,
- nginx,
- and private infrastructure.

Hosting under a sub-path (like `user.github.io/repo`) is the one build-time
setting: `KSOR_BASE_PATH=/repo pnpm build`.

Detailed deployment guidance can live with each generated project so the instructions remain version-aligned with the KSoR release being used.

---

## Working Behind the Firewall

A Knowledge System of Record frequently contains internal organizational knowledge.

KSoR therefore aims to support architectures in which:

- the knowledge remains under organizational control,
- the website can be self-hosted,
- external runtime dependencies are minimized,
- and the agent interface can be deployed inside the organization's security boundary.

A KSoR should not require an organization to publish its institutional knowledge to a third-party SaaS platform simply to make it usable by AI.

---

## Example Applications

### Agent Factory KSoR

Agent Factory illustrates the transition KSoR is designed to support: from a human-readable book plus retrieval service toward an **AI-native knowledge platform** where humans and AI agents learn, reason, and operate from the same governed source of truth.

The Agent Factory KSoR can define the shared methodology used across many AI-native implementations:

```text
Agent Factory KSoR
├── architecture
├── principles
├── FDE methodology
├── governance
├── agent patterns
├── evaluation standards
├── implementation methods
└── operating model
```

It acts as a shared methodological System of Record.

---

### Vertical KSoR

A Vertical KSoR captures knowledge specific to a profession or industry.

For example:

```text
Government Contract Accounting KSoR
├── accounting rules
├── FAR requirements
├── contract structures
├── indirect rates
├── revenue recognition
├── billing procedures
├── compliance controls
├── workflows
└── decision criteria
```

Agents can combine the **Agent Factory KSoR** with the appropriate **Vertical KSoR** when performing domain work.

```text
              Agent Factory KSoR
                  Shared Method
                       │
                       │
                       ▼
                    AI Agent
                       ▲
                       │
                       │
                  Vertical KSoR
                  Domain Truth
```

Both can be built using the same `ksor` SDK.

---

## What KSoR Does Not Replace

KSoR is complementary to existing enterprise systems.

It does **not** replace:

- your CRM,
- ERP,
- accounting system,
- HRIS,
- transactional database,
- data warehouse,
- lakehouse,
- document source systems,
- or operational APIs.

Those systems remain authoritative for their respective operational state.

KSoR adds the authoritative **knowledge layer** agents need in order to understand how to interpret that state and what to do with it.

---

## Design Goals

KSoR is being designed around the following goals.

### Authoritative

There should be a clear canonical source.

### Governed

Knowledge should have ownership and controlled change.

### Traceable

Important answers should lead back to evidence.

### Inspectable

Humans must be able to see what agents are reading.

### Portable

Knowledge should not be trapped inside one vendor. An open format under the
record (OKF) and open protocols over it are how.

### Agent-readable

AI agents must be able to consume the corpus programmatically.

### Human-readable

People must be able to browse and understand the same knowledge.

### Versioned

Changes to institutional truth should have history.

### Reproducible

A deployed KSoR should be traceable to a particular corpus and version.

### Composable

Multiple KSoRs should be usable together — and exchange governed knowledge in
the same open representation, without a proprietary conversion.

### Extensible

Organizations should be able to adapt the framework to their requirements.

---

## Project Status

KSoR is under active development.

The MCP-based agent projection (`ksor serve`) is implemented — the climbed rung,
needing Postgres and a provider key; see [`docs/status.md`](docs/status.md) for
the released version.

See:

- [`CHANGELOG.md`](packages/ksor/CHANGELOG.md) — what has shipped
- [`docs/status.md`](docs/status.md) — current implementation status
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contributing
- [`SECURITY.md`](SECURITY.md) — security policy

Do not infer production readiness of a capability from this conceptual README alone. The status document and released package version are authoritative for implemented functionality.

---

## CLI

The intended CLI vocabulary is deliberately small:

```bash
ksor init
ksor dev
ksor build
ksor serve
# corpus operations for the served rung:
ksor ingest
ksor schema
ksor grant
ksor takedown
ksor calibrate
ksor gc
```

### `ksor init` — implemented

Create a new Knowledge System of Record.

```bash
ksor init accounting-ksor
```

### `ksor dev`

Run the human surface locally with development tooling.

```bash
ksor dev
```

### `ksor build`

Validate and build the deployable KSoR projections.

```bash
ksor build
```

### `ksor serve` — implemented (the climbed rung)

Expose the agent-readable KSoR interface: the MCP server over your built record,
reading `./instance.md`. Needs a Postgres store (pgvector) and an embedding
provider key; ingest with `ksor ingest` first.

```bash
ksor serve
```

### `ksor ingest` / `schema` / `grant` / `takedown` / `calibrate` / `gc` — implemented

The corpus operations behind the served rung: apply the schema (or migrate an
existing one forward), authorize a tenant to ingest, ingest `knowledge/` into a
generation, withdraw a document from every surface (and export the manifest the
site build reads), calibrate the abstention floor, and collect withdrawn
generations. Each needs the same Postgres store.

`grant` is the one to read twice: who may WRITE a tenant's corpus is decided by
a row in the database that row-level security checks, never by a flag on a
command line.

The npm package is
[`@panaversity/ksor`](https://www.npmjs.com/package/@panaversity/ksor) — the
unscoped name `ksor` is blocked by npm's similarity guard — but the command it
installs is plain `ksor`.

The installed release's help lists the commands it supports:

```bash
ksor --help
```

---

## Contributing

Contributions are welcome.

Before contributing, read:

```text
AGENTS.md
docs/status.md
CONTRIBUTING.md
```

The project is intentionally agent-friendly, so coding agents should also read `AGENTS.md` before making changes.

The development gate is defined in [`CONTRIBUTING.md`](CONTRIBUTING.md):
lint, format check, typecheck, guard invariants, corpus checks, unit and
integration tests, build, and publint. Browser and deployment acceptance will
join it when a site surface exists.

Do not weaken provenance, abstention, governance, or reproducibility guarantees merely to simplify an implementation.

Those are part of the product.

---

## Security

Knowledge Systems of Record can contain sensitive institutional information and can influence AI agent behavior.

Treat security issues involving the following as particularly important:

- unauthorized corpus access,
- provenance bypass,
- malicious source ingestion,
- prompt injection through knowledge content,
- privilege escalation,
- unsafe MCP exposure,
- build tampering,
- dependency compromise,
- and the ability to make ungoverned knowledge appear authoritative.

See [`SECURITY.md`](SECURITY.md) for reporting instructions.

---

## License

KSoR is licensed under the **Apache License 2.0**.

See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

---

## The Idea in One Sentence

> **A traditional System of Record tells an AI system what is true about the business; a Knowledge System of Record tells humans, agents, and software what the organization knows and how it should operate.**

KSoR makes that knowledge **authoritative, governed, traceable, human-readable, agent-readable, machine-readable, and vendor-neutral**.

---

## KSoR

**Govern knowledge once. Let humans and AI operate from the same truth.**

---
