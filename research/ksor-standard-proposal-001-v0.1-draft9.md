---
issue: recorded via the readme-ksp-001 branch (set to the PR URL when it opens; the proposal's own Discussion issue is still TBD)
status: proposed
last_updated: 2026-08-24
---

# KSoR Standard Proposal 001: KSoR as an Open, Vendor-Neutral Knowledge Infrastructure Framework

| Field      | Value                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------- |
| Proposal   | KSoR Standard Proposal 001                                                                   |
| Title      | KSoR as an Open, Vendor-Neutral Knowledge Infrastructure Framework                           |
| Version    | 0.1                                                                                          |
| Status     | Draft Proposal                                                                               |
| Category   | Standards Track                                                                              |
| Editors    | Zia Khan (Panaversity)                                                                       |
| Created    | 2026-08-24                                                                                   |
| Discussion | panaversity/ksor#TBD                                                                         |
| Licence    | Apache License 2.0                                                                           |
| Supersedes | Working notes on OKF conformance and the three projections. Consolidates decision draft D25. |

---

## Executive Brief

_This section is non-normative and assumes no technical background. It exists so that leaders can evaluate the proposal without reading the specification. Implementers and reviewers can begin at the Abstract._

### The problem in one story

Ask an AI agent whether a large software cost can be capitalised. It finds an old wiki page, a slide deck with a different number, and the current policy, and nothing tells it which one wins. It picks the best match and answers with complete confidence and a correct-looking citation. The error surfaces months later, in an audit.

The model did not fail. The organisation failed to decide which knowledge is authoritative. Every company already made this decision once, for money: when a spreadsheet disagrees with the ledger, the ledger wins. Almost no company has made the same decision for knowledge. AI agents make that gap expensive because they read everything, trust what they read, and act at scale.

### What KSoR establishes

**KSoR is an open, vendor-neutral knowledge infrastructure framework.**

It gives an organisation **one governed, authoritative knowledge record** and open, replaceable ways to publish, retrieve, discover, exchange, secure, verify, and observe that knowledge.

The framework reduces to three lines:

> **One authoritative record.**  
> **One governance boundary.**  
> **Many open projections.**

And to one operating principle:

> **Govern knowledge once. Project it many ways.**

A **Knowledge System of Record (KSoR)** applies the System-of-Record idea to institutional knowledge: one governed, authoritative record of the organisation's policies, procedures, definitions, decisions, controls, and rules, which humans and AI systems both operate from.

### The architecture in nine responsibilities

The architecture separates nine jobs so that no single product becomes the knowledge authority:

1. **Authoritative record.** Keep institutional knowledge in one durable, open, portable record.
2. **Retrieval.** Find the relevant governed knowledge efficiently.
3. **Human publication.** Serve the record clearly to people.
4. **AI discovery.** Let AI systems discover what knowledge exists and where to find it.
5. **Agent interaction.** Let agents search, retrieve, cite, and abstain against governed knowledge.
6. **Knowledge exchange.** Use the same open knowledge representation to move governed knowledge between systems without a proprietary conversion.
7. **Identity and access.** Establish who is asking, then apply local KSoR policy to decide what they may see.
8. **Publication integrity.** Prove which governed source and build produced a published artefact.
9. **Observability.** Record what the infrastructure did without creating another knowledge store.

Section 3 gives the reference technical bindings for these responsibilities. The responsibilities and governance boundaries define KSoR. The named implementations remain replaceable where the conformance rules permit substitution.

### What managers should take from the trust ladder

Not every way of serving knowledge gives the same guarantee, and this proposal refuses to pretend otherwise.

| Channel               | Reach                               | Guarantee                                                                                                                  |
| --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Open web files        | Any AI system can read them         | Content passed the applicable governance filter when published. Nothing after that.                                        |
| Governed agent access | AI agents doing organisational work | Answers are filtered, cited, and traceable, and the agent must say "the record does not contain this" instead of guessing. |
| Attested computation  | Specific critical numbers           | The figure was produced by the approved calculation, mechanically checked, or it is not shown at all.                      |

Wider reach means weaker guarantees. Leadership decides which knowledge needs which rung.

### How authority gets in

Serving knowledge safely is only half the problem. The other half is how anything becomes authoritative in the first place, and the answer is a workflow every manager already runs for spending. Knowledge starts as a draft, whether a person or an AI wrote it. It is reviewed by its named owner. It is approved by someone with the authority to approve it. Only then is it published, and if the content changes afterwards, the approval must be renewed or the knowledge drops back to draft. An AI can write drafts. An AI can never approve its own work or sign a human's name. Every approval is checkable against the review system, so a claimed sign-off can always be traced to a real one.

### What this protects against, and what it costs

It protects against confident wrong answers with plausible citations, against restricted knowledge leaking through AI channels, against agent decisions no one can audit, and against institutional knowledge becoming trapped inside one vendor's platform. The cost is not a product purchase. It is discipline: knowledge kept in one reviewed repository, named owners, an approval workflow, and automated checks that refuse to publish anything that breaks the rules. Organisations that already run code review have every habit this requires.

### The decision being asked

Review and adopt this proposal as the standard for how the organisation's knowledge is governed and served to people and AI systems. Because it is an open standard with defined conformance, independent teams and suppliers can build against it, and nothing about the organisation's knowledge depends on any single vendor, including the authors of this proposal.

A leader who reads only three more things should read the Motivation (1.1), the Write-Side Lifecycle (4.3), and the Trust Ladder (Section 7).

---

## Status of This Document

This document is a **draft proposal** for community review. It is not a finished standard. It has no formal standing until it is reviewed, revised, and adopted through the process described in Section 13.

Comments are invited through the discussion issue listed above. The editors intend this proposal to be implementable by parties other than Panaversity, and feedback from independent implementers is weighted accordingly.

Distribution of this document is unlimited.

---

## Abstract

This document proposes **KSoR as an open, vendor-neutral knowledge infrastructure framework**: a governed architecture for establishing one authoritative institutional knowledge record and making that same record usable by humans, AI systems, agents, and other knowledge systems without creating competing sources of truth.

The framework is built around three ideas: **one authoritative record, one governance boundary, and many open projections**. The authoritative record is Markdown in the KSoR Profile of the Open Knowledge Format (OKF). This makes OKF foundational to the record itself, not merely an export format. The same OKF representation is then reused for governed interchange between knowledge systems. Retrieval, human publication, AI discovery, agent interaction, identity, publication integrity, and observability are separate responsibilities around that record. The reference architecture uses Postgres + pgvector, Fumadocs, `llms.txt`, MCP, OAuth/OIDC, SLSA/Sigstore, and OpenTelemetry for those responsibilities. The boundaries and governance semantics define KSoR, and the underlying components remain replaceable where the conformance rules permit substitution.

The proposal defines conformance classes for corpora, publishers, retrieval layers, agent surfaces, and exchange, states twenty-seven normative governance requirements spanning both disclosure and authoring, and specifies a **trust ladder** that makes explicit what each projection guarantees and what it does not. The intent is that any organisation can implement a conformant KSoR with open components, and that conformant systems can exchange knowledge without a proprietary protocol.

---

## Table of Contents

Executive Brief (non-normative)

1. Introduction
2. Conformance and Terminology
3. Architecture Overview
4. The Authoritative Record
5. The Retrieval Layer
6. Projection Surfaces
7. The Trust Ladder
8. Cross-Cutting Capabilities
9. Governance Requirements
10. Out of Scope
11. Security Considerations
12. Privacy Considerations
13. Versioning and Process
14. Implementation Guidance (Non-Normative)
15. Open Issues
16. References

Appendix A. Example Concept Document

Appendix B. Requirement Summary Table

---

## 1. Introduction

_This section is non-normative._

### 1.1 Motivation

Ask an AI agent whether a 42,000 dollar software implementation cost can be capitalised, and watch what it does. It finds the finance wiki page from 2023. It finds a slide deck with a different threshold. It finds the policy PDF that superseded both, but nothing tells it that this one wins. So it picks the page that matches the question best and answers with complete confidence. The answer is wrong, the citation looks right, and nobody discovers the difference until the auditor does.

The failure is not in the model. The failure is that the organisation never decided which knowledge is authoritative, so every consumer decides for itself.

Organisations increasingly need the same body of knowledge to serve several kinds of consumers. A person may want to read a policy. An AI model may need to discover that the policy exists. An agent may need to retrieve the exact paragraph relevant to a task, with a citation. Another knowledge system may need to import the policy together with its provenance and trust metadata. An enterprise identity system may need to restrict the policy to a particular audience. An auditor may need to establish exactly which approved source revision produced a published artefact. An operator may need to understand why an agent received a particular result, or an abstention.

These are different concerns. Solving them today usually means maintaining separate copies of the same knowledge for the documentation site, the vector database, the agent interface, the AI context files, the interoperability exports, and the security systems. Separate copies drift, and drift creates competing versions of institutional truth. The result is that no one, human or agent, can say with confidence which knowledge the organisation actually operates from.

This proposal takes the opposite approach, stated as one principle:

> **Govern knowledge once. Project it many ways.**

The projections may change. The authoritative record must remain stable.

### 1.2 Relationship to Existing Standards

This proposal defines an architecture, not a new format or protocol. Wherever an open standard already owns a boundary, this proposal adopts it rather than competing with it.

The **Open Knowledge Format (OKF)** [okf-v01] [okf-v02] defines portable knowledge at rest: Markdown concepts with YAML frontmatter, including an optional trust vocabulary (`sources`, `generated`, `verified`, `status`, `stale_after`, and the `Attested Computation` concept type). OKF is deliberately a format and not a service. KSoR is built on that format: the canonical KSoR record is an OKF bundle constrained by the KSoR Profile in Section 4. Because the record is already OKF, KSoR also reuses OKF as its knowledge-interchange representation instead of translating the record into a proprietary exchange model. KSP-001 version 0.1 normatively targets the immutable OKF v0.2 specification revision identified by [okf-spec], rather than a moving repository branch.

The **`llms.txt` v2 convention** [llmstxt-spec] defines open-web discovery for AI systems. It specifies a Markdown index at `/llms.txt` and Markdown versions of individual pages, in either the appended (`page.html.md`) or replaced (`page.md`) URL form. It allows path-scoped `llms.txt` files, where the most specific file applies. And it defines two standard discovery link relations: `rel="alternate" type="text/markdown"` points to a page's Markdown version, and `rel="describedby"` points to the `llms.txt` file that covers it. This proposal adopts the convention as the discovery surface and adds governance semantics (Section 6.2). The widely deployed `/llms-full.txt` concatenation is an ecosystem convention rather than part of v2, and this proposal treats it accordingly.

The **Model Context Protocol (MCP)** [mcp-spec] defines agent-to-tool interaction. This proposal adopts it as the agent surface (Section 6.3).

**OAuth 2.x and OIDC**, **SLSA and Sigstore** [slsa] [sigstore], and **OpenTelemetry** [otel] are adopted for identity, publication integrity, and observability respectively (Section 8).

The relationship between this proposal and OKF reduces to two lines:

> **OKF makes KSoR knowledge open, portable, and interoperable.**  
> **KSoR governance makes that knowledge institutionally authoritative and operational.**

### 1.3 What Distinguishes a KSoR

A knowledge base stores information. A KSoR establishes **authority**. A conformant KSoR can answer, for any served piece of knowledge: who owns it, where it came from, which version is authoritative, whether it has been reviewed, whether it is current, which audience may see it, and what the system should do when the record does not contain the answer. The last of these, abstention, is a required behaviour of the agent surface, not an optional feature.

---

## 2. Conformance and Terminology

### 2.1 Normative Language

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and OPTIONAL in this document are to be interpreted as described in RFC 2119 [rfc2119] and RFC 8174 [rfc8174] when, and only when, they appear in all capitals.

Sections 4, 5, 6, 7, 8, and 9 contain normative requirements. Sections 1, 3, 14, and the appendices are non-normative except where they restate a requirement by its identifier.

### 2.2 Definitions

**Authoritative Record.** The canonical, governed OKF bundle of Markdown concept documents from which all projections derive.

**Concept.** One Markdown file in the record, whose path is its identity, as defined by OKF.

**Governance Boundary.** The point at which policy determines which concepts are approved, visible, and current for a given audience. No knowledge crosses a serving or publication boundary without first passing the applicable governance decision. For static publication the decision is evaluated once per audience-specific generation. For dynamic retrieval it is evaluated per request, using the effective audience of that request.

**Projection.** Any derived surface or artefact produced from the record: the human site, discovery files, retrieval rows, agent responses, or exchange bundles.

**Generation.** One complete, identified publication of the record, recorded in a build lock file and connecting all projections produced from it.

**Instance Document.** The concept document `instance.md` at the bundle root, describing the identity and purpose of the KSoR instance. Its `title` and `description` seed the generated bundle-root `index.md` and the discovery index (6.2.2).

**Governance Policy.** The change-controlled YAML artefact at `.ksor/governance.yaml`, defined in 4.2.5, that names the instance's audience registry, ownership map, approval authorities, and takedown authority. It is the root of authority for every governance fact carried on individual concepts.

**Candidate Knowledge.** Content present in the repository that has not passed local governance, always `status: draft` and never carrying `ksor.approval` (R26). Imports enter as candidate knowledge.

**Takedown.** A governed decision, issued under the Governance Policy's takedown authority and recorded per R27, that overrides publication status and triggers the removal obligations of R9.

**Audience.** The set of identities entitled to a given subset of the record.

**Trust Tier.** An advisory quality level derived from a concept's `verified` field: unverified, machine-confirmed, or human-reviewed.

**Publication Attestation.** Evidence, per SLSA/Sigstore, about which source and process produced a published artefact.

**Computation Attestation.** Runtime evidence that a reported value was produced by a sanctioned computation, per the OKF `Attested Computation` concept type. Publication attestation and computation attestation are distinct and the terms are not interchangeable in this document.

**Abstention.** The behaviour of declining to answer because the governed record does not contain sufficient authoritative support.

### 2.3 Conformance Classes

This proposal defines five core conformance classes and three optional profiles. An implementation declares which classes it conforms to.

**Class A: Conformant Corpus.** A directory of concepts satisfying the KSoR Profile of OKF (Section 4).

**Class B: Conformant Publisher.** A build system that projects a Class A corpus into surfaces while satisfying the governance requirements applicable to publication and authoring (Section 9, R1 to R6, R9 to R14, R21, and R22 to R27), including validation of the corpus against the Governance Policy (4.2.5.3).

**Class C: Conformant Retrieval Layer.** A retrieval implementation satisfying the filter-before-disclosure requirements (R7) and supporting trust-tier and lifecycle predicates (Section 5).

**Class D: Conformant Agent Surface.** An implementation of the KSoR agent surface contract satisfying citation, abstention, and disclosure requirements (Sections 6.3 and 9). MCP is the normative binding of this contract in version 0.1.

**Class E: Conformant Exchange.** An OKF import/export implementation satisfying R15 to R18 and, on the import path, R26.

**Optional Profile P-Protected.** Adds identity-aware deployment per Section 8.1 (R8 applies).

**Optional Profile P-Verified.** Adds publication integrity per Section 8.2 (R19 applies).

**Optional Profile P-Attested (Experimental).** Adds computation attestation per Section 7, rung 3. This profile is experimental in version 0.1. OKF v0.2 deliberately defers the attestation runtime protocol: receipt and verdict wire formats, the attester ABI, portability, sandboxing, and caching [okf-spec]. Until those exist, no interoperable conformance test for this profile is possible, and standardising one here would mean inventing a proprietary runtime protocol, against the principle of this proposal. The profile's full normative definition is deferred to a follow-on proposal in this series, informed by the reference implementation described in Section 14.

A complete KSoR implementation conforms to classes A through E. Partial implementations (for example, a corpus linter conforming only to Class A) are valid and useful, and SHOULD state their class explicitly.

---

## 3. Architecture Overview

_This section is non-normative. The requirements it summarises are stated normatively in later sections._

### 3.1 The framework

KSoR is an **open, vendor-neutral knowledge infrastructure framework**.

It does not define one monolithic application. It defines a governed authoritative core and the boundaries through which that knowledge is retrieved, published, discovered, exchanged, protected, verified, and observed.

The framework is built around three architectural commitments:

> **One authoritative record.**  
> **One governance boundary.**  
> **Many open projections.**

The operating principle is:

> **Govern knowledge once. Project it many ways.**

KSoR is a framework because it specifies architecture, governance semantics, conformance classes, and interoperability boundaries. A deployed KSoR occupies the knowledge infrastructure layer between governed institutional knowledge and its consumers.

### 3.2 Nine responsibilities

The reference architecture assigns nine responsibilities to open formats, protocols, and reference components. One binding may serve more than one responsibility. OKF is the important example: it shapes the authoritative record and also carries governed exchange between knowledge systems.

| Responsibility        | Reference component or binding      | Architectural meaning                                                                                                                  |
| --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Authoritative record  | Markdown in the KSoR Profile of OKF | Markdown is the durable medium. The KSoR Profile of OKF gives the record its open, portable structure and baseline knowledge metadata. |
| Retrieval             | Postgres + pgvector                 | The operational retrieval projection for structured, lexical, and semantic search.                                                     |
| Human serving         | Fumadocs                            | The reference human-readable publication surface.                                                                                      |
| AI discovery          | `llms.txt` v2                       | The open-web discovery surface that tells AI systems what knowledge exists and where machine-readable pages are.                       |
| Agent interaction     | MCP                                 | The governed interaction boundary for search, retrieval, citation, and abstention.                                                     |
| Knowledge exchange    | OKF                                 | The same native OKF representation, after KSoR governance filtering, moves knowledge between systems without a proprietary conversion. |
| Identity              | OAuth/OIDC                          | The standards-based identity boundary. KSoR governance converts identity evidence into access decisions.                               |
| Publication integrity | SLSA/Sigstore                       | The provenance and signing boundary for proving what build produced a published artefact.                                              |
| Observability         | OpenTelemetry                       | The operational evidence boundary for traces, metrics, and logs without becoming another knowledge store.                              |

The same model can be remembered in nine lines:

> **Markdown, in the KSoR Profile of OKF, is the authoritative record.**  
> **Postgres + pgvector provide retrieval.**  
> **Fumadocs serves humans.**  
> **`llms.txt` lets AI discover it.**  
> **MCP lets agents interact with it.**  
> **The same OKF representation lets knowledge systems exchange the record.**  
> **OAuth/OIDC establishes identity. KSoR governance controls access.**  
> **SLSA/Sigstore proves what was published.**  
> **OpenTelemetry tells us what happened.**

The OKF relationship is therefore intentionally dual. KSoR does not maintain one internal knowledge model and convert it to OKF at the edge. The authoritative record is already an OKF bundle with additional KSoR governance semantics. Exchange reuses that open representation after the applicable governance filter has selected what may cross the boundary.

### 3.3 Boundaries are the standard

These nine responsibilities must not be read as a proprietary product stack.

The **responsibilities, governance semantics, and interoperability boundaries define KSoR**. Where an open format, convention, or protocol already owns a boundary, this proposal binds to it. Named products such as Postgres + pgvector and Fumadocs are reference implementation choices rather than vendor requirements. A conformant alternative may replace them if it satisfies the applicable class requirements.

This distinction is what makes the architecture vendor-neutral:

```text
                      KSoR FRAMEWORK
          open, vendor-neutral knowledge infrastructure
                              |
                    AUTHORITATIVE CORE
                              |
                     Governed Markdown
                 (native KSoR Profile of OKF)
                              |
                     GOVERNANCE BOUNDARY
                              |
       +----------------------+----------------------+----------------------+
       |                      |                      |                      |
       v                      v                      v                      v
   Human site            AI discovery          Agent surface           Exchange
    Fumadocs               llms.txt                 MCP            Governed OKF bundle
                                                     |
                                                     v
                                              Retrieval layer
                                           Postgres + pgvector

Cross-cutting capabilities:
  Identity and access      OAuth / OIDC
  Publication integrity    SLSA / Sigstore
  Observability            OpenTelemetry
```

The four outward surfaces are parallel governed boundaries. The retrieval layer supports dynamic agent interaction in the reference architecture. Identity, publication integrity, and observability cut across the surfaces without becoming knowledge stores.

### 3.4 One governance decision before every disclosure

The one rule the whole architecture depends on is that **no knowledge crosses a serving or publication boundary without first passing the applicable governance decision**.

For a static build, that decision runs once per audience-specific generation. For dynamic retrieval, it runs per request. In both cases the policy semantics are identical, and no downstream surface decides independently whether something should have been published.

This is what turns a set of useful technologies into a Knowledge System of Record. Without the shared governance boundary, the components would merely form another knowledge stack. With it, every surface is a controlled projection of the same institutional authority.

---

## 4. The Authoritative Record

### 4.1 Markdown as the Record

**4.1.1** The authoritative record MUST be a directory of Markdown concept documents with YAML frontmatter, forming a valid OKF bundle. This is a deliberate choice of the stronger coupling model: the record does not merely export OKF, it is OKF, constrained by the profile below. As a result, KSoR interoperability begins from the native record format rather than from a later translation into a separate exchange schema.

**4.1.2** Because the record is literally an OKF bundle, OKF's filesystem contract applies in full. `index.md` and `log.md` are reserved at every directory level and MUST NOT be used as concept documents [okf-spec]. An `index.md` follows OKF's progressive-disclosure listing format and carries no frontmatter, except that the bundle-root `index.md` MAY carry `okf_version`. A `log.md` follows OKF's date-grouped history format. A consequence for the human surface is that directory landing pages MUST be rendered from, or generated alongside, the OKF `index.md` files rather than authored as ordinary content pages under those names. Publishers SHOULD generate `index.md` files mechanically at build time, which satisfies both the OKF contract and the discovery surface with one artefact. The bundle-root `index.md` takes its heading and summary from the instance document, so instance identity is authored once, in `instance.md`, and projected into both the OKF listing and the discovery index.

**4.1.3** The record MUST be maintainable in ordinary version control, and a conformant implementation MUST NOT require a proprietary database or service to read, diff, review, or migrate the record.

**4.1.4** The canonical direction of data flow MUST be from the record, through governance, to projections. An implementation MUST NOT treat any database, index, or serving layer as the source from which the record is exported.

_Note (non-normative)._ Postgres may disappear, the site framework may change, an embedding model may be swapped, and the governed Markdown remains usable. This property is the foundation of vendor neutrality.

### 4.2 The KSoR Profile of OKF

The profile constrains OKF for governed use. It is stricter than OKF and permitted by it, since OKF preserves custom conventions rather than rejecting them.

#### 4.2.1 Reserved Concept Types

The profile reserves the following `type` values with defined governance meaning:

```text
Policy
Procedure
Control
Standard
Definition
Decision Record
Example
Attested Computation

```

**4.2.1.1** Implementations MAY define additional types. Governance tooling MUST key its type-specific rules off reserved types only, so that custom types remain safe to introduce.

#### 4.2.2 Required Fields

**4.2.2.1** Every concept MUST carry `type`, `title`, `description`, and `status`.

**4.2.2.2** Every concept of a reserved type MUST carry `sources`.

**4.2.2.3** Every concept with `status: stable` MUST carry `generated`, at least one `verified` entry, and `ksor.approval`. `generated.at` MUST identify the most recent substantive content change.

**4.2.2.4** Every concept MUST carry an explicit `ksor.audience`. Public knowledge MUST say `ksor.audience: [public]`. Omission is invalid and MUST fail the build.

**4.2.2.5** A Class B publisher MUST fail the build when these requirements, or the governance extension requirements of 4.2.4, are violated.

#### 4.2.3 Trust Vocabulary

The profile adopts the OKF v0.2 trust vocabulary without modification [okf-v02]:

| Governance concern                | OKF field                                                            |
| --------------------------------- | -------------------------------------------------------------------- |
| Lifecycle                         | `status: draft \| stable \| deprecated`                              |
| Provenance and per-claim citation | `sources`, with footnotes keyed to source ids                        |
| Review evidence                   | `verified: [{ by, at }]`                                             |
| Review period                     | `stale_after` (`YYYY-MM-DD` date, stale when `today >= stale_after`) |
| Production history                | `generated: { by, at }`                                              |
| Sanctioned computation            | `type: Attested Computation`, with `executor` and `attester`         |

**4.2.3.1** Trust tiers MUST be derived from `verified` as follows: absent means unverified, machine actors only means machine-confirmed, any `human:<id>` actor means human-reviewed.

**4.2.3.2** Trust tiers are advisory quality filters. They MUST NOT be used as access control. Access control is governed by audience policy (Sections 8.1 and 9).

_Compatibility note (non-normative)._ KSP-001 version 0.1 follows the immutable OKF v0.2 specification revision identified by [okf-spec]. Upstream reference code and later edits on moving branches are informative until a KSP revision adopts them. In that pinned revision, `stale_after` is a `YYYY-MM-DD` date and staleness is evaluated as `today >= stale_after`.

#### 4.2.4 The `ksor` Governance Extension

OKF supplies provenance, trust, freshness, and lifecycle. A System of Record must additionally carry **institutional authority**: who owns the knowledge, who approved it for publication, and who may see it. These are the fields that make KSoR more than a well-annotated wiki, so they are normative, not optional. They live under a single `ksor` frontmatter key, which OKF consumers preserve as an unknown extension.

```yaml
ksor:
  owner: team:finance-controller
  audience: [finance, audit]
  approval: { by: "human:cfo@example", at: 2026-08-20T14:00:00Z }
  effective_from: 2026-09-01T00:00:00Z
```

**4.2.4.1** `ksor.owner` names the party accountable for the concept. It uses the OKF actor convention (`human:<id>`, `process:<id>`, or `<producer>/<version>`), which this profile extends with `team:<id>` for accountable groups, a form OKF itself uses in examples but does not define. Every concept of a reserved type MUST carry `ksor.owner`.

**4.2.4.2** `ksor.audience` is a required list of audience identifiers naming who may see the concept. `public` is a reserved identifier denoting the unrestricted audience, and a policy document MUST NOT redefine it. Public knowledge MUST state `ksor.audience: [public]` explicitly. Absence of `ksor.audience` is invalid and MUST fail a Class B build. Implementations MUST NOT infer public visibility from omission. This field is the canonical audience representation. Retrieval predicates (Section 5), publication filters (R5, R6), and exchange bundles (R15) MUST all derive from it. All other audience identifiers are defined in the Governance Policy's audience registry (4.2.5), and mapping identity claims onto them is local policy (8.1.2).

**4.2.4.3** `ksor.approval` records the authority decision to publish: `{ by, at }` in the actor convention. Every concept with `status: stable` MUST carry `ksor.approval`. Approval is distinct from OKF `verified` and the two MUST NOT be conflated (R17): approval asserts institutional authority, verification asserts an independent check. A publisher MUST NOT copy one into the other. Who may grant approval, and how status transitions interact with it, is governed by the Governance Policy (4.2.5) and R23.

**4.2.4.4** `ksor.effective_from` is an optional ISO 8601 instant before which the concept, although approved, is not yet in force. Retrieval and serving surfaces MUST NOT treat the concept as currently applicable before this instant. Human surfaces MAY display it as approved-but-not-yet-effective, while open-web discovery SHOULD exclude it until it becomes effective.

_Note (non-normative)._ This extension is what answers the fair question "if OKF already provides sources, verification, status, and freshness, what does KSoR add to the record itself?" OKF supplies the open, portable knowledge representation. KSoR adds institutional authority and governed operation. The `ksor` block makes the record accountable to the organisation that uses it.

#### 4.2.5 The Governance Policy

The profile puts governance facts directly in each concept's frontmatter. The authorities behind those facts live in one place: the **Governance Policy**, a change-controlled YAML artefact at `.ksor/governance.yaml`. Its location and top-level structure are normative so that independent KSoR implementations can validate the same corpus without a proprietary policy service.

A version 0.1 Governance Policy has this portable shape:

```yaml
version: "0.1"

audiences:
  finance:
    description: Finance staff and authorised auditors
  audit:
    description: Internal and external audit users

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

The four named governance families and the keys shown above are normative. Implementations MAY preserve additional extension keys, but MUST NOT assign conflicting meaning to the standard keys.

Within a `scope`, `paths` contains bundle-relative directory prefixes and `types` contains reserved or custom concept types. A rule matches only when both dimensions match. The path dimension matches when `paths` is omitted or the concept path begins with at least one listed prefix. The type dimension matches when `types` is omitted or the concept type equals one listed type.

Rule resolution is deterministic. For each matching rule, compute a specificity tuple `(path_depth, type_specificity)`. `path_depth` is the number of path segments in the longest matching prefix, or `0` when `paths` is omitted. `type_specificity` is `1` when `types` is present and matched, otherwise `0`. Compare tuples lexicographically, so the deepest matching path wins first and an explicit type constraint breaks a path-depth tie.

For **ownership**, only rules at the highest specificity are effective. If more than one highest-specificity ownership rule remains, their `owner` and `escalation` values MUST be identical. Otherwise the Governance Policy is invalid and the build MUST fail.

For **approval authorities**, only rules at the highest specificity are effective. If one rule remains, its `actors` list is the effective authority set. If several equally specific rules remain, the effective authority set is the intersection of their `actors` lists. An empty intersection is a policy error and the build MUST fail. Less-specific approval rules MUST NOT widen a more-specific authority set.

`takedown_authorities` is instance-wide in version 0.1 and therefore has no scope-resolution step. A future proposal MAY add scoped takedown rules, but version 0.1 implementations MUST NOT infer them.

**4.2.5.1** A conformant corpus MUST include `.ksor/governance.yaml`. The **audiences** map names every audience identifier used in `ksor.audience` other than the reserved `public`. Each entry MUST have a human-readable `description`. The **ownership** list resolves which owner governs each applicable scope and MUST provide `owner`. `escalation` names the authority for ownership changes under R24. The **approval_authorities** list names which actors may grant `ksor.approval` for each scope and MUST provide a non-empty `actors` list. The **takedown_authorities** mapping MUST provide a non-empty `actors` list naming actors who may issue takedowns under R27.

**4.2.5.2** The Governance Policy is itself part of the authoritative record even though it is not an OKF concept document. Every change to it MUST pass through the repository's change-control system, and SHOULD require stricter review than ordinary concepts, because it is the root of authority for everything else: an attacker who changes the policy owns every downstream decision. Authority assertions introduced by the policy remain subject to the actor-truthfulness and review principles of R22 through R25 where applicable.

**4.2.5.3** A Class B publisher MUST validate the corpus against the Governance Policy and fail the build on violations: missing or unreadable `.ksor/governance.yaml`, audience identifiers absent from the registry, approvals granted by unauthorised actors, and changes that bypassed the ownership map.

#### 4.2.6 The Adapter Boundary

**4.2.6.1** Implementations MUST isolate OKF parsing and serialisation behind an adapter. Internal storage schemas, agent surface contracts, and site templates MUST NOT depend directly on OKF field names.

_Note (non-normative)._ OKF is young and has already renamed fields between versions (`timestamp` became `generated.at`). The adapter boundary means a specification change costs an adapter update, not a migration.

### 4.3 The Write-Side Lifecycle

_This subsection is a non-normative summary. The binding rules are R22 to R27._

The read side of this proposal asks whether knowledge may leave the record. The write side asks whether authority ever entered it. Both are needed, because every disclosure requirement guards only what the authoring rules made trustworthy in the first place.

```text
source material
      |
      v
draft            authored by human or agent, generated.by truthful (R25)
      |
      v
review           under owner authority per the ownership map (R24)
      |
      v
approval         granted by an authorised actor, change-controlled (R23, R22)
      |
      v
stable           served per Sections 5 to 7
      |
      +--> change      re-approve in the same reviewed change,
      |                or fall back to draft (R23)
      |
      +--> deprecated  under owner or takedown authority (R23)
      |
      +--> takedown    governed write (R27), then removal everywhere (R9)

```

Candidate knowledge from imports enters this lifecycle at draft, stripped of external approval (R26). Nothing reaches stable except through review and authorised approval, and nothing stays stable through a content change without renewed approval. The publisher enforces the whole lifecycle mechanically at build time, which is why the rules are written as comparisons a build can make.

---

## 5. The Retrieval Layer

**5.1** A Class C retrieval layer MUST support filtering on lifecycle (`status`), freshness (`stale_after`), effectivity (`ksor.effective_from`), trust tier, and audience (`ksor.audience`, 4.2.4.2) as predicates evaluated before ranking and before any content is considered a candidate for disclosure.

**5.2** The retrieval layer MUST evaluate governance predicates within the retrieval operation itself. Post-hoc removal of unauthorised content from generated prose does not satisfy this requirement (see R7).

**5.3** The retrieval layer SHOULD support both lexical and semantic retrieval over the authorised set.

**5.4** Abstention decisions MUST be computed from the governed, filtered result set, not from the unfiltered corpus.

_Note (non-normative)._ In the reference implementation, frontmatter is parsed into Postgres columns at build time and the predicates run as SQL before pgvector similarity:

```sql
WHERE status = 'stable'
  AND (stale_after IS NULL OR stale_after > CURRENT_DATE)
  AND (effective_from IS NULL OR effective_from <= CURRENT_TIMESTAMP)
  AND trust_tier >= :min_tier
  AND audience && :effective_audiences
ORDER BY embedding <=> :query_vec
LIMIT :k

```

`audience` is never NULL for a valid concept because `ksor.audience` is explicit and required on every concept (4.2.2.4 and 4.2.4.2). `&&` is array overlap: the concept is visible when any of its audiences matches any audience the requester holds. A request to an open surface includes the reserved `public` audience. Containment is the wrong test here, because a requester holding several audiences must not be denied a concept that any one of them entitles them to.

This is the operational meaning of OKF's design intent: frontmatter exists so a consumer can decide something about a concept before reading it. In a KSoR that decision is a query predicate, not a prompt instruction.

---

## 6. Projection Surfaces

### 6.1 The Human Surface

**6.1.1** A conformant KSoR MUST provide a human-readable projection of the authorised record.

**6.1.2** The human surface SHOULD render the trust signals present in frontmatter: status, verifying identity and date, and staleness date.

**6.1.3** The human surface MUST NOT hold content absent from the record, and MUST NOT apply a visibility policy different from the canonical governance decision (R3, R4).

_Note (non-normative)._ The reference implementation uses Fumadocs. Any documentation framework satisfying these requirements may be substituted.

### 6.2 The Discovery Surface (`llms.txt` v2)

**6.2.1** A conformant KSoR MUST publish `/llms.txt` following `llms.txt` v2 [llmstxt-spec], which defines conventions rather than conformance clauses, and MUST publish per-page raw Markdown routes in one of the two v2 URL forms, applied consistently across the site.

**6.2.1.1** Each HTML page SHOULD carry the v2 discovery link relations, as HTML `<link>` elements or an HTTP `Link:` header: `rel="alternate" type="text/markdown"` pointing to the page's Markdown version, and `rel="describedby"` pointing to the `llms.txt` file that covers it.

**6.2.1.2** A KSoR MAY publish path-scoped `llms.txt` files, with the most specific file applying, for example when several KSoR instances share one domain or an instance controls only a path.

**6.2.1.3** A KSoR MAY publish `/llms-full.txt` as a compatibility artefact for consumers that ingest a whole corpus in one fetch. It is a KSoR extension, not a v2 requirement, and every governance rule applicable to discovery artefacts applies to it.

**6.2.2** All discovery artefacts MUST be generated mechanically from the authorised record. The index title MUST derive from the instance document, and per-link descriptions MUST derive from concept `description` fields. Hand-authored discovery content is prohibited (R4).

**6.2.3** Discovery artefacts MUST contain only concepts admitted by the governance filter. The default filter MUST exclude `status: draft` and concepts that have not yet reached `ksor.effective_from`, and SHOULD exclude `status: deprecated` and concepts past `stale_after`. Operators MAY tighten the filter. Operators MUST NOT admit drafts to open-web artefacts (R13).

**6.2.4** Per-page Markdown routes MUST serve concept frontmatter intact, so that trust signals travel with the content over plain HTTP.

**6.2.5** Every discovery artefact MUST carry the generation identifier, corpus commit hash, and implementation version (R14).

_Note (non-normative)._ Publication-side support for this convention is widespread, including in the reference site framework [fumadocs-llms], and v2 reflects the shift from speculation to routine agent use: agents view or search the index, then follow links to LLM-friendly content. The dependable value remains strongest for agents directed at the site. Implementers should treat broad crawler ingestion as upside, not as the design justification.

### 6.3 The Agent Surface (MCP)

**6.3.1** Class D specifies the KSoR agent surface contract. MCP [mcp-spec] is its normative binding in version 0.1 of this proposal, and a Class D surface MUST expose the governed record over MCP. A future revision of this proposal may define additional bindings without changing the contract.

**6.3.2** Search operations MUST accept a minimum trust tier parameter and MUST return frontmatter trust signals with each result.

**6.3.3** Responses that assert knowledge MUST be traceable to concepts in the record, and SHOULD carry citations resolvable to concept paths.

**6.3.4** When the authorised, filtered record does not contain sufficient support for an answer, the agent surface MUST abstain rather than improvise. The abstention SHOULD state that the Knowledge System of Record does not contain enough information to answer.

**6.3.5** The agent surface MUST NOT maintain knowledge state of its own. It is an interaction boundary, not a store.

_Note (non-normative)._ The distinction between the two machine surfaces is deliberate. `llms.txt` helps an AI find the knowledge. MCP helps an agent work with the knowledge.

### 6.4 The Exchange Surface (OKF)

The Class A record is already an OKF bundle. Exchange is therefore primarily a governed selection and packaging operation, not a translation from a proprietary KSoR knowledge model into OKF.

**6.4.1** A Class E exporter MUST produce valid OKF bundles containing only the authorised set for the target audience (R15). Different audiences require different bundles.

**6.4.2** A Class E importer MUST treat imported knowledge as candidate knowledge outside the authoritative set until it passes local governance (R16). Imported trust signals MUST be preserved as evidence under an import evidence key and MUST NOT be adopted as local approval or verification (R26).

**6.4.3** Export MUST preserve the distinction between approval and verification (R17). An importer MUST NOT synthesise `verified` entries.

---

## 7. The Trust Ladder

This section is normative in one specific sense: a conformant implementation MUST NOT claim, in documentation or in served metadata, guarantees for a surface beyond those defined for its rung.

**Rung 1: Discovery (`llms.txt`, per-page Markdown).** Guarantees: the projection passed the applicable governance filter when published (6.2.3) and is provenance-stamped (6.2.5). Beyond publication, the KSoR enforces nothing. No citation discipline, no abstention, and no freshness check at answer time. Widest reach, weakest guarantees.

**Rung 2: Governed interaction (MCP).** Guarantees: retrieval filters on governance and trust before ranking (Section 5), results carry trust signals (6.3.2), answers are citable (6.3.3), abstention is enforced (6.3.4), and responses are traceable to a generation (R21). Narrower reach, real guarantees.

**Rung 3: Computation attestation (Profile P-Attested, experimental).** Guarantees: for concepts of type `Attested Computation`, a consumer executes only the sanctioned computation with declared parameters, obtains a receipt, and a deterministic attester verifies the receipt against the sanctioned definition. A reported value that fails attestation MUST NOT be displayed as an answer. Narrowest scope, strongest guarantee.

**7.1** Verification and computation attestation are distinct and MUST NOT be conflated. `verified` confirms a definition still matches policy: document-level, stored in the record. Computation attestation confirms a single run produced a value correctly: per-call, at runtime, never stored in the record. [okf-v02]

**7.2** Approval and verification are distinct and MUST NOT be conflated (R17).

_Note (non-normative)._ Each rung trades reach for guarantees. The ladder, not any single rung, is the product. The ladder also answers the obvious objection honestly: a system built on citation before confidence can still ship a corpus file that is downloaded once and never checked again, because the file's rung is stated and its limits are not hidden.

---

## 8. Cross-Cutting Capabilities

### 8.1 Identity and Access (Profile P-Protected)

**8.1.1** Protected deployments MUST obtain identity from standard OAuth 2.x / OIDC infrastructure. A KSoR MUST NOT act as an identity provider.

**8.1.2** Identity claims are evidence for governance, not governance itself. The effective audience MUST be computed by local KSoR policy from the claims (R8), using the audience registry of the Governance Policy (4.2.5).

**8.1.3** Where an authorisation decision cannot be made confidently, access MUST fail closed.

**8.1.4** Trust tiers and audiences are orthogonal. A human-reviewed concept may be restricted, and a public concept may be unverified. Neither signal substitutes for the other (4.2.3.2).

### 8.2 Publication Integrity (Profile P-Verified)

**8.2.1** Builds MUST record a generation lock (included documents, hashes, source commit, versions).

**8.2.2** Implementations conforming to P-Verified MUST produce SLSA provenance for published artefacts and SHOULD sign artefacts via Sigstore [slsa] [sigstore].

**8.2.3** Publication attestation proves facts about artefacts and their production. It MUST NOT be presented as evidence of factual correctness, review status, or authority (R19).

**8.2.4** Together with R22, publication attestation closes an evidence chain: SLSA ties the published artefact to a commit, and R22 ties the commit to the authority claims it introduced. A consumer holding both can trace an artefact to a reviewed authority decision without trusting any intermediate assertion.

### 8.3 Observability

**8.3.1** Operational instrumentation SHOULD use OpenTelemetry [otel] with operational attributes such as:

```text
ksor.generation
ksor.operation
ksor.retrieval_strategy
ksor.min_trust_tier
ksor.result_count
ksor.abstained
ksor.audience

```

**8.3.2** Telemetry MUST NOT capture restricted document bodies, retrieved passages, complete prompts, or generated answers by default. Content-level tracing REQUIRES an explicit deployment policy (R20).

---

## 9. Governance Requirements

The following requirements are the normative core of this proposal. A Class B, C, D, or E implementation MUST satisfy every requirement applicable to its class.

### Authority and Projection

**R1. No bypass of the record.** All published and served knowledge MUST originate from the authoritative record or a generation derived from it. Every page, row, entry, result, and bundle MUST be traceable back to the record.

**R2. Governance precedes projection.** The order MUST be record, governance, authorised set, projection. An implementation MUST NOT project first and conceal afterwards.

**R3. One policy, all surfaces.** All projections MUST apply the same canonical governance decision. Implementation code MAY differ. Policy semantics MUST NOT.

**R4. No shadow authority.** A projection MUST NOT contain authoritative substantive knowledge that does not originate in the governed record. Projection-specific selection, summarisation, indexing, or omission MAY occur where required by the surface, provided it neither creates new authoritative claims nor widens access. A separately authored AI knowledge base that can introduce or override institutional knowledge is prohibited.

### Disclosure

**R5. Absence means absence.** For an unauthorised audience, a projection MUST NOT expose a restricted concept's body, title, identifier, path, URL, navigation entry, search result, backlink, asset, description, citation, exchange record, or discovery entry.

**R6. Static filtering before build output.** Public static artefacts MUST be built from the authorised corpus. Concealment via client-side code is prohibited.

**R7. Dynamic filtering before disclosure.** Retrieval MUST enforce governance within the retrieval operation. An unauthorised chunk MUST NOT become an answer candidate. This applies to vector retrieval, lexical retrieval, lookup, outlines, citations, and related-document queries.

**R8. Identity is evidence, not authority.** Identity claims are inputs to local policy. No identity-provider claim bypasses local governance. Uncertain decisions fail closed.

**R9. Takedown outranks everything.** A takedown decision (issued and recorded per R27) MUST remove the concept from every projection and every newly produced artefact. Older revisions in version control confer no retrieval entitlement.

**R10. Assets inherit authority.** Document-linked assets MUST be included only where the authorised corpus makes them reachable.

**R11. Links can disclose.** Cross-audience references MUST be validated. A public link to a restricted concept discloses its existence, name, subject, and route, and is a governance violation.

### Machine Surfaces

**R12. Discovery is downstream of governance.** Discovery artefacts MUST index only the authorised machine-readable corpus. Visibility metadata addressed to the consumer is not a substitute for filtering.

**R13. Lifecycle and effectivity on the open web.** Drafts and not-yet-effective concepts MUST NOT enter open-web machine artefacts. Deprecated and stale concepts MUST be excluded from the default open-web projection. Operators MAY tighten these rules and MUST NOT admit drafts or not-yet-effective concepts.

**R14. Artefacts carry their generation.** Every generated machine artefact MUST carry generation identifier, corpus commit hash, and implementation version.

### Exchange

**R15. Export is downstream of governance.** Restricted content MUST NOT be exported with an expectation that the receiver enforces the sender's policy. Different audiences receive different bundles.

**R16. Import confers no authority.** Imported knowledge enters as candidate knowledge and MUST pass local governance before publication. R26 defines the mechanics of entry.

**R17. Approval is not verification.** A verification event MUST NOT be manufactured from publication approval. The two facts MUST remain distinct in storage and interchange.

**R18. Trust tiers never cross downward.** A filter demanding human-reviewed knowledge MUST NOT be satisfied by machine-confirmed knowledge under any configuration. Configuration MAY tighten tiers and MUST NOT loosen them past a requester's stated floor.

### Integrity and Observation

**R19. Signatures prove integrity, not truth.** Publication attestation MUST NOT alter or substitute for `status`, visibility, takedown, factual correctness, source quality, or local authority.

**R20. Telemetry inside governance.** Observability MUST NOT create a shadow knowledge store. Content-level capture REQUIRES explicit deployment policy.

**R21. One generation per publication.** All projections of a publication MUST belong to one identified generation, and a consumer SHOULD be able to establish which generation it is using.

### Authoring and Change Control

_Requirement numbering is append-only, so this later group extends rather than reorders the series._

**R22. Authority claims are change-controlled.** An approval (`ksor.approval`) or verification (`verified`) event recorded in frontmatter MUST correspond to an event in the change-control system governing the record, and a Class B publisher MUST validate that correspondence before publication: at minimum, that the commit introducing the event reached the record through the repository's review process by, or on behalf of, the asserted actor. Frontmatter asserts authority. Change control is what makes the assertion checkable. Without this rule, every disclosure requirement in this section guards knowledge whose authority was never established.

**R23. Status transitions are governed events.** A transition to `stable` MUST carry both `generated` and a valid `ksor.approval` granted by an actor the Governance Policy authorises for that concept's path or type. A reviewed change that alters a stable concept MUST update `generated.at` and either renew `ksor.approval` within the same change or set `status: draft`. The check is mechanical: a publisher MUST fail a stable concept when `generated` is absent or when `generated.at` postdates `ksor.approval.at`. A transition to `deprecated` MUST be made under owner or takedown authority.

**R24. Ownership binds review.** A change to a concept of a reserved type MUST be reviewed under the authority of its `ksor.owner`, as resolved by the Governance Policy's ownership map. A change to `ksor.owner` itself MUST be authorised by the outgoing owner or by the escalation authority named in the Governance Policy. Ownership that binds nothing is decoration. This rule is what makes it governance.

**R25. Recorded actors are truthful.** `generated.by`, `verified[].by`, and `ksor.approval.by` MUST record the actor that actually performed the action. An agent MUST NOT record a `human:` actor for an action it performed, and MUST NOT grant `ksor.approval` on its own authority. Where the change-control platform exposes the committing or reviewing identity, a publisher MUST fail the build when that identity contradicts the asserted actor.

**R26. Import lands as draft.** Imported knowledge MUST enter the record with `status: draft` and without `ksor.approval`. External `verified` events and trust signals MUST be preserved as evidence, relocated under an import evidence key such as `ksor.imported`, and MUST NOT remain as local `verified` entries. This is the mechanism behind R16.

**R27. Takedown is a governed write.** A takedown decision MUST be issued by an actor the Governance Policy's takedown authority names and MUST be recorded in the change-controlled record, so that the removal obligation of R9 has an auditable trigger and an auditable author.

---

## 10. Out of Scope

_This section is non-normative in its rationale and normative in its exclusions._

A component belongs in this standard only when it owns a distinct architectural boundary. The following are explicitly not required for conformance:

**A2A or other agent-to-agent protocols.** A KSoR is not an agent. Agents using a KSoR may use such protocols elsewhere.

**A REST/OpenAPI surface.** Discovery, direct Markdown consumption, MCP, and OKF cover the defined boundaries. A REST contract MAY be added by an implementation when a real integration requires it, outside this standard.

**A graph database.** The corpus already forms a graph through ordinary Markdown links, which OKF treats as first-class relationships. Requiring Neo4j, RDF, OWL, or SPARQL is out of scope.

**W3C PROV and schema.org JSON-LD.** Both are compatible optional projections and MAY be standardised in a future proposal in this series if implementation experience warrants it.

---

## 11. Security Considerations

The threat model of a KSoR is unusual in that the protected asset can influence AI agent behaviour. Implementers should treat the following as first-order risks.

**Prompt injection through knowledge content.** The record is served to agents as trusted context. Ingestion and import pipelines (Section 6.4) are the primary defence: candidate knowledge passes local governance before it can reach an agent surface. Implementations SHOULD additionally sanitise or flag imperative content in imported material.

**Making ungoverned knowledge appear authoritative.** This is the attack the entire governance section exists to prevent. R1, R2, and R16 are the controls. Any path by which content reaches a projection without crossing the governance boundary is a critical vulnerability.

**Disclosure through secondary channels.** R5, R10, and R11 exist because titles, navigation, assets, embeddings, and links leak knowledge even when bodies are protected. Embedding stores deserve particular attention: a restricted document whose vector still produces search results is not restricted.

**Approval forgery through ordinary commits.** `ksor.approval` and `verified` are frontmatter, and frontmatter is text: anyone or anything with write access can assert them, including an agent maintaining the corpus. R22 through R25 are the controls: authority events must be validated against change control, status transitions demand authorised approval, review runs under the ownership map, and asserted actors must match platform identities. The cheapest attack therefore shifts from editing a file to subverting repository review. Branch protection, required review, and ownership rules on governance-bearing paths are part of the KSoR security boundary even though they live in the version-control layer, and the Governance Policy deserves the strictest protection of all (4.2.5.2), because owning it means owning every downstream decision.

**Build and supply-chain tampering.** Profile P-Verified (Section 8.2) is the control. Without it, a consumer cannot distinguish a legitimate publication from a tampered one.

**Identity spoofing and confused-deputy access.** R8 and fail-closed behaviour (8.1.3) are the controls. The agent surface must never forward an upstream identity's authority to a downstream request without local policy evaluation.

**Telemetry as an exfiltration path.** R20 is the control. Observability pipelines are often less protected than serving paths, and content captured into them silently becomes a shadow store.

---

## 12. Privacy Considerations

A KSoR may contain personal data inside institutional knowledge (named verifiers in `verified` entries, approvers in `ksor.approval`, authors in `generated`, identities in audit history). Implementations SHOULD support redaction workflows that respect R9 (takedown) and SHOULD treat `verified.by`, `ksor.approval.by`, and `generated.by` identifiers as personal data where applicable law requires it. Takedown under R9 applies to newly produced artefacts and current projections. Handling of historical version-control data is a deployment policy matter outside this standard.

---

## 13. Versioning and Process

**13.1** This proposal is versioned independently of any implementation. Breaking changes to normative requirements increment the major version. Additive requirements and clarifications increment the minor version.

**13.2** The proposal advances through the stages: Draft Proposal, Candidate (two independent implementations of classes A and B exist), Adopted (accepted by the maintainers with community review), Superseded.

**13.3** KSP-001 version 0.1 normatively targets the OKF v0.2 specification in `okf/SPEC.md` at Git commit `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96` [okf-spec]. A corpus MUST also declare `okf_version: "0.2"` in the bundle-root `index.md`, using the mechanism OKF defines for this purpose. Later edits to an upstream branch, reference implementation, or documentation do not change KSoR conformance. Adopting different OKF semantics requires a revision of this proposal. The adapter boundary (4.2.6) localises the implementation cost.

**13.4** Extensions SHOULD be proposed as separate proposal documents in this series rather than amendments, so that the core remains small.

---

## 14. Implementation Guidance (Non-Normative)

A reference implementation is being built at `github.com/panaversity/ksor` in the order below, from the inside outward.

**P0, knowledge infrastructure.** Write the profile conformance document and the `.ksor/governance.yaml` schema. Make the build validate both and fail on violations. Parse frontmatter into retrieval columns and enforce lifecycle, freshness, effectivity, trust, and audience predicates in SQL. Render trust badges on the human surface. Expose `min_trust_tier` on the agent surface and return frontmatter with results. Generate discovery artefacts under the governance filter with generation stamping. Ship OKF export as governed bundle selection. Validate the Governance Policy and R22 through R25 against repository history as part of the build gate, since authority claims are worthless until they are checkable, and the `generated.at` versus `approval.at` comparison of R23 is the cheapest high-value check in the suite. Test every projection against R5 and R13 first, since those two rules catch the most damaging failure modes.

**P1, enterprise trust and operation.** OAuth/OIDC for protected surfaces with fail-closed behaviour. OpenTelemetry with the operational attribute set. SLSA provenance and Sigstore signing. One end-to-end `Attested Computation` in a real vertical. Bank reconciliation in an accounting KSoR is a natural first target: the record holds the reconciliation policy at rung 2 and the sanctioned reconciliation computation at rung 3, so a Digital FTE's reported figures are mechanically checked rather than trusted.

**P2, broader interoperability.** OKF import as candidate knowledge. W3C PROV export if external provenance exchange requires it. JSON-LD where public web discovery benefits. Further interfaces only where a demonstrated gap exists.

The architecture reduces to three lines that implementers should be able to recite:

> **One authoritative record.**
> **One governance boundary.**
> **Many open projections.**

---

## 15. Open Issues

1. Chunking or truncation policy for `/llms-full.txt` on very large corpora.
2. Whether per-page Markdown routes should honour a future `.okfignore` convention if the OKF community adopts one.
3. The numeric encoding of trust tiers in retrieval stores. R18 fixes the ordering constraint. The encoding is unspecified.
4. Whether computation attestation receipts may be exported as evidence artefacts alongside publication attestations, or remain strictly runtime-only as OKF currently prescribes. To be resolved in the attestation follow-on proposal.
5. A conformance test suite: the requirement identifiers in this document are written to be mechanically testable, and a companion proposal defining the test suite is anticipated.

Three issues from earlier drafts are resolved in this draft: OKF specification pinning (now an immutable v0.2 release revision plus `okf_version`, 13.3), canonical audience representation (now explicit `ksor.audience` on every concept, 4.2.2.4 and 4.2.4.2), and Governance Policy serialisation (now `.ksor/governance.yaml`, 4.2.5).

---

## 16. References

### Normative

[okf-spec] Open Knowledge Format, Version 0.2, `okf/SPEC.md`, GoogleCloudPlatform/knowledge-catalog, commit `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`, 2026-07-24.
[llmstxt-spec] The /llms.txt file, v2. Answer.AI, September 2024, revised August 2026. llmstxt.org.
[mcp-spec] Model Context Protocol specification. modelcontextprotocol.io.
[rfc2119] Bradner, S. Key words for use in RFCs to Indicate Requirement Levels. RFC 2119.
[rfc8174] Leiba, B. Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words. RFC 8174.

### Informative

[okf-v01] Introducing the Open Knowledge Format. Google Cloud Blog, June 2026.
[okf-v02] Open Knowledge Format v0.2 tackles agentic trust. Google Cloud Blog, July 2026.
[fumadocs-llms] Fumadocs AI and LLMs integration documentation. fumadocs.dev.
[slsa] Supply-chain Levels for Software Artifacts. slsa.dev.
[sigstore] Sigstore. sigstore.dev.
[otel] OpenTelemetry. opentelemetry.io.

---

## Appendix A. Example Concept Document

A conformant `Policy` concept in the KSoR Profile of OKF:

```markdown
---
type: Policy
title: Capitalisation of Software Implementation Costs
description: Criteria for capitalising software implementation costs under the organisation's accounting standards.
status: stable
tags: [accounting, capitalisation]
generated: { by: "human:jsmith@example", at: 2026-05-10T09:00:00Z }
verified:
  - { by: "human:kliu@example", at: 2026-05-12T14:00:00Z }
stale_after: 2027-01-31
sources:
  - id: ias38
    resource: https://www.ifrs.org/issued-standards/list-of-standards/ias-38-intangible-assets/
    title: IAS 38 Intangible Assets
ksor:
  owner: team:finance-controller
  audience: [finance, audit]
  approval: { by: "human:cfo@example", at: 2026-05-14T10:00:00Z }
---

# Criteria

An implementation cost may be capitalised when all of the following hold. [^ias38]

1. The cost creates an identifiable intangible asset.
2. Future economic benefits are probable.
3. The cost can be measured reliably.

# Exclusions

Training and data migration costs are expensed as incurred. [^ias38]

[^ias38]: IAS 38, Intangible Assets.
```

The concept satisfies 4.2.2 (all required fields, `sources` present on a reserved type, and `generated`, `verified`, `ksor.approval`, and explicit `ksor.audience` present where required) and 4.2.4 (`ksor.owner` present on a reserved type, `ksor.approval` present on a stable concept). Its trust tier is human-reviewed, and its approval is a separate fact recorded by a different actor, illustrating R17. Under `ksor.audience` it is excluded from open-web artefacts for any audience other than `finance` and `audit` per R5 and R12.

## Appendix B. Requirement Summary Table

| Req | Short name                             | Classes            |
| --- | -------------------------------------- | ------------------ |
| R1  | No bypass of the record                | B, C, D, E         |
| R2  | Governance precedes projection         | B, C, D, E         |
| R3  | One policy, all surfaces               | B, C, D, E         |
| R4  | No shadow authority                    | B                  |
| R5  | Absence means absence                  | B, C, D, E         |
| R6  | Static filtering before build          | B                  |
| R7  | Dynamic filtering before disclosure    | C, D               |
| R8  | Identity is evidence, not authority    | C, D (P-Protected) |
| R9  | Takedown outranks everything           | B, C, D, E         |
| R10 | Assets inherit authority               | B                  |
| R11 | Links can disclose                     | B                  |
| R12 | Discovery downstream of governance     | B                  |
| R13 | Lifecycle and effectivity on open web  | B                  |
| R14 | Artefacts carry their generation       | B, E               |
| R15 | Export downstream of governance        | E                  |
| R16 | Import confers no authority            | E                  |
| R17 | Approval is not verification           | A, E               |
| R18 | Tiers never cross downward             | C, D               |
| R19 | Signatures prove integrity, not truth  | B (P-Verified)     |
| R20 | Telemetry inside governance            | C, D               |
| R21 | One generation per publication         | B, C, D, E         |
| R22 | Authority claims are change-controlled | B                  |
| R23 | Status transitions are governed events | B                  |
| R24 | Ownership binds review                 | B                  |
| R25 | Recorded actors are truthful           | B                  |
| R26 | Import lands as draft                  | E, B               |
| R27 | Takedown is a governed write           | B                  |

Normative requirements also appear as numbered clauses outside the R-series. The table below maps the clause groups to conformance classes so that a test-suite author working from this appendix misses nothing.

| Clauses            | Subject                                                          | Classes                      |
| ------------------ | ---------------------------------------------------------------- | ---------------------------- |
| 4.1.1 to 4.1.4     | Record as OKF bundle, reserved filenames, canonical flow         | A                            |
| 4.2.1 to 4.2.3     | Reserved types, required fields, trust vocabulary                | A (build gate: B)            |
| 4.2.4.1 to 4.2.4.4 | Governance extension: owner, audience, approval, effective\_from | A (build gate: B)            |
| 4.2.5.1 to 4.2.5.3 | `.ksor/governance.yaml`: registry, ownership, authorities        | A (validation: B)            |
| 4.2.6.1            | Adapter boundary                                                 | B, C, D, E                   |
| 5.1 to 5.4         | Retrieval predicates and abstention basis                        | C                            |
| 6.1.1 to 6.1.3     | Human surface                                                    | B                            |
| 6.2.1 to 6.2.5     | Discovery surface                                                | B                            |
| 6.3.1 to 6.3.5     | Agent surface contract                                           | D                            |
| 6.4.1 to 6.4.3     | Exchange                                                         | E                            |
| Section 7          | Guarantee claims per rung                                        | A to E                       |
| 8.1.1 to 8.1.4     | Identity                                                         | P-Protected                  |
| 8.2.1 to 8.2.4     | Publication integrity                                            | B (8.2.2 onward: P-Verified) |
| 8.3.1 to 8.3.2     | Observability                                                    | C, D                         |
| 13.3               | Immutable OKF v0.2 specification pinning                         | A                            |

---

## Acknowledgements

This proposal consolidates working drafts produced with the assistance of Claude (Anthropic) and ChatGPT (OpenAI), and builds directly on the Open Knowledge Format published by the Google Cloud Data Cloud team, the `llms.txt` convention proposed by Jeremy Howard, and the Model Context Protocol. The governance-first framing draws on the KSoR concept developed in _The AI Agent Factory_.

## Change Log

| Version     | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 draft 9 | 2026-08-24 | Clarified OKF's dual architectural role. The canonical KSoR record is now described consistently as Markdown in the KSoR Profile of OKF, making OKF foundational to the authoritative record rather than only an exchange format. The same native OKF representation is reused for governed interoperability, so Class E exchange is described as selection and packaging rather than translation into a separate knowledge model. Updated the Executive Brief, Abstract, relationship-to-standards section, terminology, Section 3 responsibility table and diagram, Section 4 authoritative-record language, Section 6.4 exchange explanation, and the KSoR-versus-OKF differentiation without changing the conformance model or governance requirements. |
| 0.1 draft 8 | 2026-08-24 | Publication and conformance repair pass: restored story-first ordering in the Executive Brief and kept the nine responsibilities there in plain language, corrected the Section 3 diagram so human serving, AI discovery, MCP, and OKF are parallel outward boundaries, made `ksor.audience` mandatory for every concept, defined deterministic Governance Policy scope resolution, removed semicolons from editable prose, repaired the `llms.txt` wording, restored the leadership reading path to the Write-Side Lifecycle and Trust Ladder, and pinned KSP-001 v0.1 to the immutable OKF v0.2 release specification at commit `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`. The pinned specification defines `stale_after` as a `YYYY-MM-DD` date.        |
| 0.1 draft 7 | 2026-08-24 | Reframed the proposal around KSoR as an open, vendor-neutral knowledge infrastructure framework. Moved the three-line model and nine responsibilities to the front of the Executive Brief, clarified framework versus deployed infrastructure layer, strengthened the Abstract, expanded Section 3 so the responsibilities and boundaries, rather than a technology list, are the organising architecture, distinguished open protocol bindings from reference implementation choices, and made vendor-neutrality explicit from page one. No normative governance requirements changed.                                                                                                                                                                     |
| 0.1 draft 6 | 2026-08-24 | Specification-hardening pass: made `ksor.audience` explicit and fail-closed, standardised the Governance Policy at `.ksor/governance.yaml` with portable rule semantics, added `ksor.effective_from` to retrieval and open-web gating, required `generated` for stable concepts and strengthened R23, narrowed R4 from no omission to no shadow authority, changed `stale_after` to the date semantics defined by the OKF v0.2 release specification later pinned in draft 8, aligned the Executive Brief with publication-time guarantees, and repaired tables and the table of contents.                                                                                                                                                                  |
| 0.1 draft 5 | 2026-08-24 | Added the non-normative Executive Brief ahead of the Abstract, so that decision-makers without technical background can evaluate the proposal: the problem story, the one-line principle, the trust ladder as a risk table, the write-side lifecycle as an approval workflow, protections, costs, and the decision being asked. No normative content changed.                                                                                                                                                                                                                                                                                                                                                                                               |
| 0.1 draft 4 | 2026-08-24 | Write-side governance completed: added the Governance Policy (4.2.5) as the normative root of authority, the write-side lifecycle summary (4.3), and requirements R23 to R27 covering status transitions, ownership-bound review, actor truthfulness, import mechanics, and governed takedown. Consistency pass: conformance class descriptions updated for R22 to R27, cross-references added between R9 and R27, R16 and R26, 4.2.4 and 4.2.5, and 8.1.2, adapter boundary renumbered to 4.2.6, abstract count corrected to twenty-seven, terminology extended with Governance Policy, candidate knowledge, and takedown, Appendix B extended, Open Issue 4 narrowed to serialisation only.                                                               |
| 0.1 draft 3 | 2026-08-24 | Second review revision: added R22 requiring authority claims to correspond to change-control events, with the matching security paragraph and the evidence chain in 8.2.4. Corrected the actor convention attribution (`team:` is a profile extension, not OKF). Fixed the reference SQL audience predicate to overlap semantics with NULL as public. Defined the instance document and its relationship to the bundle-root `index.md`. Reserved `public` as an audience identifier. Changed "conformant to" to "following" for `llms.txt` v2. Extended Appendix B with the clause-level requirement map and R22.                                                                                                                                           |
| 0.1 draft 2 | 2026-08-24 | Review revision: added the `ksor` governance extension (owner, audience, approval, effective\_from), documented the OKF reserved-filename contract, restated the governance boundary as governance before every disclosure, updated the discovery surface to `llms.txt` v2 with `llms-full.txt` as a KSoR extension, changed `stale_after` to an ISO 8601 instant, marked Profile P-Attested experimental pending an attestation follow-on proposal, fixed the Class D binding to MCP for version 0.1, and revised the identity line to "OAuth/OIDC establishes identity. KSoR governance controls access."                                                                                                                                                 |
| 0.1 draft 1 | 2026-08-24 | Initial draft proposal, consolidating decision draft D25.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
