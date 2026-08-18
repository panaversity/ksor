<p align="center">
  <img src="https://raw.githubusercontent.com/panaversity/ksor/main/repo-image.png" alt="KSoR — Knowledge System of Record: authoritative knowledge for humans and AI agents" width="100%">
</p>

# KSoR

**The Knowledge System of Record for humans and AI agents.**

KSoR turns governed knowledge into a single authoritative source that both people and AI agents can use.

Write and govern your knowledge once. KSoR publishes it through two synchronized surfaces:

- a **human-readable knowledge site**, and
- an **agent-readable interface** through MCP.

Both come from the same source, so humans and agents operate from the same institutional truth.

---

> ### ⚠️ `0.0.0` is a name reservation, not a release.
>
> **Nothing described below is implemented in this package yet.** The commands in this README
> describe the design being built; running them today prints a status notice and exits 2. This
> version exists only to hold the name and state the intent in public.
>
> Do not install it as a dependency, and do not infer any capability from this page. The first
> working release will say so in its changelog and its version number.

---

```bash
npm install -g @panaversity/ksor

ksor init my-knowledge-sor
cd my-knowledge-sor

ksor dev
```

Or run it without installing globally:

```bash
npx @panaversity/ksor init my-knowledge-sor
```

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

# What Is a Knowledge System of Record?

A **Knowledge System of Record — KSoR — is the authoritative, governed source of knowledge that humans and AI agents use to understand, decide, and act.**

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

## Traditional SoR vs. KSoR

A traditional System of Record and a Knowledge System of Record solve different problems.

|                  | Traditional System of Record                            | Knowledge System of Record                                   |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| Primary purpose  | Record operational state                                | Record institutional knowledge                               |
| Typical contents | Transactions, balances, customers, employees, inventory | Rules, policies, methods, procedures, standards, definitions |
| Typical systems  | ERP, CRM, HRIS, accounting system                       | KSoR                                                         |
| Core question    | **What is true right now?**                             | **What do we know and how should we operate?**               |
| Optimized for    | Applications and business processes                     | Humans and AI agents                                         |
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

# KSoR Is More Than a Knowledge Base

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

# One Source. Two Surfaces.

KSoR follows a simple principle:

> **Humans and AI agents should not operate from different versions of organizational knowledge.**

Your governed source produces two surfaces.

```text
                     Governed Knowledge
                           Markdown
                              │
                              │
                        ┌─────┴─────┐
                        │   KSoR    │
                        └─────┬─────┘
                              │
               ┌──────────────┴──────────────┐
               │                             │
               ▼                             ▼
        Human Surface                  Agent Surface
        Knowledge Site                      MCP
               │                             │
        Search / Browse               Search / Retrieve
        Read / Learn                  Cite / Reason
        Review / Share                Abstain / Act
               │                             │
               └──────────────┬──────────────┘
                              │
                         Same Truth
```

The website is not maintained separately from the agent corpus.

The agent corpus is not an invisible copy of the website.

They are projections of the **same governed source**.

---

# Core Principles

## 1. One Authoritative Source

Knowledge should have one canonical location.

Different consumers may receive different representations, but those representations must derive from the same source.

---

## 2. Humans and Agents Are Both First-Class Consumers

Knowledge architecture can no longer assume that only people will read documentation.

Every important piece of institutional knowledge should be usable by:

- humans,
- AI assistants,
- autonomous agents,
- agent workflows,
- and applications.

---

## 3. Provenance Matters

An answer is much more useful when you can determine:

- what document it came from,
- which version was used,
- when it was built,
- and what source supported the claim.

KSoR preserves the chain from source knowledge to generated surface.

---

## 4. Citation Before Confidence

An AI sounding confident is not evidence.

KSoR is designed around traceable answers.

The agent should be able to identify the knowledge that supports its answer rather than relying on model memory.

---

## 5. Abstention Is a Feature

A governed AI system needs to know the boundary of its knowledge.

When the KSoR does not contain enough information to support an answer, the correct behavior is:

> **The Knowledge System of Record does not contain enough information to answer this.**

—not improvisation.

---

## 6. Governance Before Retrieval

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

---

## 7. Vendor Neutrality

Your institutional knowledge should not belong to an AI model vendor.

KSoR keeps the knowledge layer independent from the model layer.

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

# What Can You Build with KSoR?

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

# Example

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

# Quick Start

## Requirements

Install a current Node.js LTS release with npm.

Check your installation:

```bash
node --version
npm --version
```

---

## Create a KSoR

```bash
npx @panaversity/ksor init my-ksor
```

Then:

```bash
cd my-ksor
```

The scaffold gives you a working KSoR project containing the knowledge source, site configuration, and agent instructions needed to work with it.

---

## Start Development

```bash
npx @panaversity/ksor dev
```

KSoR starts the local knowledge site and watches for changes while you work.

Edit the Markdown source and the human-readable surface updates from the same corpus that will ultimately serve agents.

---

## Build

```bash
npx @panaversity/ksor build
```

The build produces the deployable human surface and records information needed to identify what knowledge went into that build.

---

## Serve to AI Agents

```bash
npx @panaversity/ksor serve
```

The agent surface exposes the governed KSoR through MCP.

> **Project status:** in the predecessor vsor implementation the human website surface is the more mature part; in this package neither surface has shipped yet. See [`docs/status.md`](docs/status.md) — it is the only authority on implemented functionality.

See [`docs/status.md`](docs/status.md) for current implementation status.

---

# Project Structure

A KSoR project is intentionally understandable without proprietary tooling.

A typical project looks like:

```text
my-ksor/
│
├── knowledge/
│   ├── about.md
│   ├── principles.md
│   ├── policies/
│   │   ├── policy-a.md
│   │   └── policy-b.md
│   └── procedures/
│       └── procedure-a.md
│
├── site/
│   └── docusaurus.config.ts
│
├── .agents/
│   └── skills/
│
├── instance.md
│
└── ...
```

## `knowledge/`

The authoritative knowledge corpus.

Documents are plain Markdown so they are:

- portable,
- diffable,
- reviewable,
- version-controlled,
- readable by humans,
- readable by AI coding agents,
- and independent of a proprietary database.

Subdirectories naturally organize the knowledge hierarchy.

---

## `instance.md`

Describes the identity and purpose of this KSoR instance.

For example:

```markdown
# Accounting KSoR

This Knowledge System of Record contains the governed accounting
policies, procedures, definitions, controls, and decision criteria
used by Example Corporation.
```

---

## `site/`

Configuration and customization for the human-readable surface.

The website layer will remain ordinary source code rather than an opaque hosted service; the concrete site framework is an open decision (see `research/primitives-proposal.md` §4).

---

## `.agents/`

Instructions and reusable skills for AI coding agents working on the KSoR.

KSoR is designed to be **agent-first**.

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

# Knowledge as Code

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

# Build Provenance

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

---

# The Agent Surface

KSoR uses the **Model Context Protocol (MCP)** as the interoperability boundary between governed knowledge and AI runtimes.

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

# Retrieval Is Not the Product

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

---

# KSoR and RAG

RAG answers:

> How can relevant information be retrieved and placed into model context?

KSoR answers a broader question:

> What knowledge is authoritative enough that an organization permits humans and AI agents to operate from it?

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
├── Human Surface
├── Agent Surface
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

# KSoR and a CMS

A Content Management System asks:

> How do we create and publish content?

A KSoR asks:

> Which knowledge is authoritative, governed, traceable, and safe for humans and agents to rely upon?

Content is an input.

Institutional knowledge is the asset.

Authority is the differentiator.

---

# Governance Model

A production KSoR should make knowledge ownership explicit.

A simple governance lifecycle might be:

```text
Source
  │
  ▼
Draft
  │
  ▼
Review
  │
  ▼
Approved
  │
  ▼
Authoritative KSoR
  │
  ├──────────────► Human Surface
  │
  └──────────────► Agent Surface
  │
  ▼
Superseded / Retired
```

Organizations can impose additional controls appropriate to their domain.

For regulated or high-risk knowledge, those controls may include:

- named knowledge owners,
- approval requirements,
- effective dates,
- source citations,
- mandatory review periods,
- change records,
- conflict resolution,
- separation of duties,
- and audit history.

KSoR provides the architectural foundation; governance policy remains the responsibility of the organization operating the KSoR.

---

# Knowledge Boundaries

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

# KSoR in an AI-Native Architecture

KSoR becomes especially useful when AI agents begin performing real organizational work.

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

# Agent-First Development

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

# Human-Readable by Default

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

# Vendor-Free by Design

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

# Deployment

The human surface generated by:

```bash
npx @panaversity/ksor build
```

is deployable as a static site.

That makes it suitable for hosts such as:

- Vercel,
- Netlify,
- GitHub Pages,
- static object storage,
- internal web servers,
- nginx,
- and private infrastructure.

Before production deployment, configure the canonical site URL in the site configuration.

Detailed deployment guidance can live with each generated project so the instructions remain version-aligned with the KSoR release being used.

---

# Working Behind the Firewall

A Knowledge System of Record frequently contains internal organizational knowledge.

KSoR therefore aims to support architectures in which:

- the knowledge remains under organizational control,
- the website can be self-hosted,
- external runtime dependencies are minimized,
- and the agent interface can be deployed inside the organization's security boundary.

A KSoR should not require an organization to publish its institutional knowledge to a third-party SaaS platform simply to make it usable by AI.

---

# Example Applications

## Agent Factory KSoR

An Agent Factory KSoR can define the shared methodology used across many AI-native implementations:

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

## Vertical KSoR

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

# What KSoR Does Not Replace

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

# Design Goals

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

Knowledge should not be trapped inside one vendor.

### Agent-readable

AI agents must be able to consume the corpus programmatically.

### Human-readable

People must be able to browse and understand the same knowledge.

### Versioned

Changes to institutional truth should have history.

### Reproducible

A deployed KSoR should be traceable to a particular corpus and version.

### Composable

Multiple KSoRs should be usable together.

### Extensible

Organizations should be able to adapt the framework to their requirements.

---

# Project Status

KSoR is under active development.

The project is evolving from the original VSOR implementation into the more general **Knowledge System of Record** architecture.

The predecessor (vsor) implementation — reference material for this rebuild, not its authority — already proved out several foundations that inform this package's design, including:

- Markdown-based authoritative source content,
- generated human-readable documentation sites,
- project scaffolding,
- local development,
- static builds,
- build provenance,
- agent-oriented repository instructions,
- automated testing,
- and deployment workflows.

The MCP-based agent surface is designed, not implemented — see [`docs/status.md`](docs/status.md).

See:

- [`CHANGELOG.md`](packages/ksor/CHANGELOG.md) — what has shipped
- [`docs/status.md`](docs/status.md) — current implementation status
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contributing
- [`SECURITY.md`](SECURITY.md) — security policy

Do not infer production readiness of a capability from this conceptual README alone. The status document and released package version are authoritative for implemented functionality.

---

# CLI

The intended CLI vocabulary is deliberately small:

```bash
ksor init
ksor dev
ksor build
ksor serve
```

### `ksor init`

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

Validate and build the deployable KSoR surfaces.

```bash
ksor build
```

### `ksor serve`

Expose the agent-readable KSoR interface.

```bash
ksor serve
```

The installed release's help will list the commands it supports:

```bash
ksor --help
```

---

# npm Package

The canonical npm package is:

```text
@panaversity/ksor
```

The unscoped name `ksor` is blocked by npm's similarity guard, so the package is
scoped. The **command** installed by it is still `ksor`.

Install it:

```bash
npm install @panaversity/ksor
```

Install globally:

```bash
npm install -g @panaversity/ksor
```

Or execute without a global installation:

```bash
npx @panaversity/ksor
```

---

# Contributing

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

# Security

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

# License

KSoR is licensed under the **Apache License 2.0**.

See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

---

# The Idea in One Sentence

> **A traditional System of Record tells an AI agent what is true about the business; a Knowledge System of Record tells it what the organization knows and how it should operate.**

KSoR makes that knowledge **authoritative, governed, traceable, human-readable, agent-readable, and vendor-neutral**.

---

## KSoR

**Knowledge you can govern. Answers you can trace. Boundaries agents can respect.**

---
