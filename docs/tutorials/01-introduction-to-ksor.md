# Tutorial 1: KSoR — One Governed Knowledge Record for Humans and AI Agents

A **Knowledge System of Record (KSoR)** gives an organization one governed place to define the knowledge that people and AI agents are expected to follow.

That sounds simple, but it solves an important problem:

> **AI can find information. It cannot decide which information your organization has declared authoritative unless you define that authority.**

This tutorial explains that idea from the beginning. We will use one hospital example throughout, introduce the eight core KSoR concepts, look at enterprise and education use cases, and then run a KSoR locally.

You do not need to understand vector databases, MCP, OAuth, or knowledge standards before starting. We will introduce those terms only when they become useful.

> 🎥 This tutorial follows the live introduction session:  
> [KSoR — Introduction and the Eight Concepts (YouTube)](https://www.youtube.com/watch?v=EeTGuQJbHCg)

---

## What you will learn

By the end of this tutorial, you should understand:

- why AI agents can give different answers to the same question,
- why this is often an **authority problem**, not just a search problem,
- the difference between a traditional System of Record and a Knowledge System of Record,
- the eight core KSoR concepts,
- what belongs in a KSoR and what does not,
- how governance, provenance, citation, and abstention fit together,
- how one governed record can serve people and AI systems through different interfaces,
- and how to create your first KSoR project.

---

# 1. Start with the problem: three AI helpers, three answers

Imagine a hospital introduces three AI helpers.

A nurse asks all three the same question:

> **"How much medicine is safe for a six-year-old?"**

The three helpers give different answers.

- **Helper A** uses an old book.
- **Helper B** finds something on the web.
- **Helper C** uses an old message or its model memory.

All three answers sound confident.

But the nurse has a problem: **which answer is the hospital's approved answer?**

The AI helpers cannot tell her.

Why?

Because each helper found information, but nobody told them which source was official.

Maybe the old book is outdated.

Maybe the web page describes another hospital.

Maybe the message was never approved.

Maybe the model remembers a general medical answer that does not match this hospital's policy.

The computers are not necessarily broken.

**The hospital is missing a rule about authority.**

This is the key idea behind KSoR.

The problem is not only:

> "Can the AI find relevant information?"

The more important question is:

> **"Which knowledge has this organization approved as the knowledge we operate from?"**

That is an authority problem.

A search engine can rank documents.

A language model can explain them.

But the organization still has to decide which policy, procedure, version, or rule is authoritative.

> **A computer can guess what looks useful. It cannot guess what your organization has made official.**

A Knowledge System of Record exists to make that authority explicit.

---

# 2. Why AI helpers can disagree

Several things can cause AI systems to answer the same question differently.

## 2.1 Language models are probabilistic

Large language models do not behave like calculators.

They generate likely responses from the context they receive. The wording, reasoning path, and even the conclusion can vary between runs.

You may ask the same model the same question twice and receive two different explanations.

That variability is normal.

## 2.2 Training data can be wrong or outdated

Models are trained on very large collections of material.

Some of that material may be:

- correct,
- incorrect,
- old,
- incomplete,
- or in conflict with other sources.

A model can repeat incorrect information confidently because confident wording is not proof of correctness.

## 2.3 Models can hallucinate

When a model does not have enough reliable information, it may still generate an answer.

The answer may sound reasonable even when it is unsupported.

For an informal conversation, that may be inconvenient.

For medicine, finance, compliance, education, or business operations, it can be dangerous.

## 2.4 The model cannot be assumed to know your current institutional knowledge

Your organization may have private or local knowledge such as:

- company policies,
- internal procedures,
- approval limits,
- hospital protocols,
- course curricula,
- grading rules,
- engineering standards,
- or operating methods.

A foundation model cannot be assumed to know the current, approved version of those rules.

Even if it has seen an older or public version, it still does not know which version **your organization currently treats as authoritative**.

So the real requirement is not simply "give the AI more documents."

It is:

> **Give the AI a governed source of institutional truth.**

---

# 3. AI workers need two kinds of record

Organizations already understand the idea of a **System of Record**.

A System of Record is the system that wins when different copies of operational data disagree.

For example:

- the accounting system is authoritative for financial transactions,
- the CRM is authoritative for customer records,
- the HRIS is authoritative for employee records,
- the student information system is authoritative for enrollments and grades.

These systems answer questions such as:

- What is the customer's balance right now?
- Which invoices are unpaid?
- How much inventory is available?
- Which students are enrolled?

These are questions about **current state**.

But people inside organizations have always needed another kind of information: **knowledge about how to operate**.

That knowledge may live in:

- policy manuals,
- procedure guides,
- textbooks,
- standards,
- training material,
- internal documents,
- or the experience of senior employees.

For example, an accountant may know:

- which accounting policy applies,
- what approval is required,
- how a special transaction is handled,
- and when an exception must be escalated.

That is not the current state of the business.

It is **operating knowledge**.

| | Traditional System of Record | Knowledge System of Record |
| --- | --- | --- |
| Holds | Current operational state | Governed knowledge |
| Examples | Customers, orders, balances, inventory | Policies, methods, procedures, definitions |
| Main question | **What is true right now?** | **How should we operate?** |
| Typical consumers | Applications, reports, people | People, AI agents, software |

When AI agents begin doing work that people used to do, they need both.

> **A traditional System of Record tells the agent what is happening. A Knowledge System of Record tells the agent how the organization says it should operate.**

For example, an accounting agent may need:

- the invoice amount from the accounting system,
- the current project status from an operational system,
- and the capitalization policy from the KSoR.

The operational systems provide the facts.

The KSoR provides the governed rule.

The agent uses both.

---

# 4. Education has the same problem

The same idea applies to education.

A capable AI model may know a great deal about mathematics, programming, accounting, medicine, or history.

But capability is not authority.

A model can create a reasonable course.

It cannot decide which course is **this institution's course**.

The institution still has to define:

- the learning objectives,
- the approved concepts and definitions,
- the course sequence,
- the required source material,
- the assessment rules,
- the grading rules,
- and the current course version.

This matters when several AI tutors teach students in the same program.

Without an authoritative academic record, different tutors may teach:

- different definitions,
- different topic sequences,
- different source material,
- or different versions of the course.

Personalization can then turn into curricular inconsistency.

A KSoR solves the academic-authority problem.

The tutor may still personalize:

- explanations,
- examples,
- pacing,
- language,
- difficulty,
- practice,
- and remediation.

But it should not independently change the institution's approved curriculum.

> **Personalization should change the teaching path, not the authoritative curriculum.**

An education system may therefore use two different records:

1. a **Knowledge System of Record** for the approved curriculum and teaching knowledge,
2. a **learner System of Record** for the student's progress, history, and current state.

One tells the tutor **what should be taught**.

The other tells the tutor **where this learner currently is**.

---

# 5. The eight concepts behind KSoR

The introductory KSoR presentation explains the framework through eight simple ideas.

We will keep using the hospital example.

Each concept answers one question.

---

## Concept 1 — One official book

### The question

**Which page is the real one?**

The hospital may have many sources:

- an old manual,
- a PDF,
- a wiki,
- a chat message,
- a website,
- and model memory.

The hospital now makes one important decision:

> **This is our official record.**

Every AI helper must use that governed record when answering questions about hospital policy.

If the model remembers something different, the hospital's authoritative record wins.

The phrase **"one official book"** is a metaphor.

It does not mean everything must be stored in one giant document.

It means there is **one authoritative governed record**.

### In KSoR

The authoritative record is stored as plain Markdown under:

```text
knowledge/
```

The files can be read by people, reviewed in Git, checked by software, and used by AI agents.

### Remember

> **A computer cannot choose which page is official. The organization has to decide.**

---

## Concept 2 — What goes in the book?

### The question

**What kind of information belongs in a KSoR?**

Not every fact belongs there.

Consider the hospital again.

These belong in the KSoR:

- How do we treat a fever?
- What dosage rule is approved?
- Who may approve this procedure?
- What is the hospital's escalation policy?

These are governed rules and methods.

Now consider:

- How many beds are free right now?
- Who is currently in room 4?
- How much medicine is left in inventory?

These facts change constantly.

They belong in operational Systems of Record.

A useful test is:

> **Is this something the organization deliberately decides, reviews, approves, versions, and expects people or agents to follow?**

If yes, it is a strong candidate for the KSoR.

If it is rapidly changing operational state, it usually belongs somewhere else.

| Question | Where it belongs |
| --- | --- |
| What is our medication dosage policy? | KSoR |
| How many beds are available right now? | Operational SoR |
| What is our capitalization policy? | KSoR |
| What is the current ledger balance? | Accounting SoR |
| What is the grading policy for this course? | KSoR |
| Which students are enrolled today? | Student information system |

The important distinction is not **Markdown versus database**.

It is:

> **Governed knowledge versus operational state.**

### Remember

> **The KSoR holds what we have decided. Operational systems hold what is happening.**

---

## Concept 3 — Stamps

### The question

**How do I know a page can be trusted?**

Suppose the hospital has a page called:

> **Safe amounts for children**

The words on the page are not enough.

We also want to know:

- Who owns this knowledge?
- Who approved it?
- When did it become effective?
- Which version is current?
- Who may read it?
- What source supports it?

The presentation calls these facts **stamps**.

Think of the difference between:

> "Someone wrote this."

and:

> "Dr Sana Malik owns this policy. The Medicines Committee approved it. Version 4 is current. It took effect on 3 March 2026. Nurses and doctors may read it."

The second statement tells us why the page should be trusted.

### In KSoR

These "stamps" are represented by governance and provenance metadata.

KSoR can validate that metadata against the governance rules for the knowledge system.

A useful security principle is:

> **If access has not been explicitly allowed, do not assume that it is allowed.**

In the presentation this is summarized as:

> **Quiet never means yes.**

### Remember

> **No authority information, no institutional trust.**

---

## Concept 4 — The door

### The question

**Should this knowledge be allowed out?**

Knowing an answer and being allowed to disclose it are different things.

A nurse asks:

> "What is the approved dosage rule?"

The rule exists.

The nurse is allowed to read it.

The answer may be returned.

Now a visitor asks for restricted information.

The information may also exist in the system.

But the visitor is not allowed to see it.

So nothing should be returned.

This is why KSoR needs a **governance boundary**.

The system checks not only:

> "Do we have this knowledge?"

but also:

> **"May this requester receive this knowledge?"**

### In KSoR

The KSoR architecture separates identity from governance.

Identity answers:

> **Who is asking?**

Technologies such as OAuth/OIDC can provide identity.

KSoR governance then answers:

> **What is this identity allowed to receive?**

The current beta does not necessarily implement every part of the full architecture. [`docs/status.md`](../status.md) is the authority on what is implemented today.

### Remember

> **Knowledge should cross a serving or publication boundary only after the applicable governance check passes.**

---

## Concept 5 — "I don't know"

### The question

**What if the answer is not in the KSoR?**

Suppose the hospital has an approved dosage rule for children over two years old.

But it has no approved rule for infants.

An unsafe AI might say:

> "It is probably about this much."

That sounds helpful.

But it is unsupported.

A governed system should instead say something like:

> **"The Knowledge System of Record does not contain an approved answer for this case."**

It can then:

- ask for human review,
- escalate the case,
- request more information,
- or stop.

This behavior is called **abstention**.

Abstention means the system deliberately refuses to invent an answer when the governed record does not support one.

That is not a weakness.

It is an important safety property.

### Remember

> **A confident guess can be more dangerous than an honest "I don't know."**

---

## Concept 6 — Show the page

### The question

**How can I check the answer?**

Imagine the AI says:

> "This expense requires CFO approval."

A useful next question is:

> **"Which policy says that?"**

The AI should be able to point back to the governed knowledge that supports its answer.

For the hospital example, the answer might say:

> "Medicine Rules, version 4."

You should be able to follow the trail back to:

- the retrieved passage,
- the knowledge document,
- the version,
- the source,
- and the approval history.

This trail is called **provenance**.

Provenance means:

> **Where did this come from?**

A citation tells you where to look.

Provenance lets you trace the answer back through the governed record.

### Remember

> **Citation before confidence.**

A fluent answer sounds good.

A traceable answer can be checked.

---

## Concept 7 — Getting a page into the book

### The question

**How does new knowledge become authoritative?**

A document does not become an official rule merely because someone created a file.

Imagine one hospital policy moving through a week.

**Monday:** Dr Sana writes a draft.

It is not yet authoritative.

**Tuesday:** the head nurse reviews it.

It is still not authoritative.

**Friday:** the authorized committee approves it.

Now it may become part of the governed record according to the lifecycle rules.

The important point is that **storage is not authority**.

Putting a document in a folder is easy.

Making it an approved institutional rule requires governance.

A simple lifecycle might look like:

```text
draft
  ↓
review
  ↓
approval
  ↓
stable
```

In KSoR, approval and lifecycle state are deliberately separate concepts.

Imported knowledge also does not automatically become authoritative.

If another hospital sends you its approved policy, that policy was approved **there**.

Your organization must still decide whether to adopt it **here**.

### Remember

> **Knowledge becomes authoritative through governance, not through storage.**

---

## Concept 8 — Many doors, one book

### The question

**How do different users and systems reach the same governed knowledge?**

People and machines do not all need the same interface.

A person may want a website.

An AI system may need a machine-readable discovery file.

An AI agent may need a query interface.

Another knowledge system may need a portable exchange format.

KSoR therefore supports different **projections** of the same governed record.

Think of them as different doors into the same building.

In the KSoR architecture:

| Consumer | Reference interface |
| --- | --- |
| Humans | Fumadocs website |
| AI discovery | `llms.txt` |
| AI agents | MCP |
| Other knowledge systems | OKF exchange |

The important point is that these should not become four independently maintained knowledge stores.

You update the authoritative record.

The different projections are then rebuilt, refreshed, or served from that governed source.

### Remember

> **Not four books. Four doors into one book.**

And the operating principle is:

> **Govern knowledge once. Project it many ways.**

---

# 6. Not every door gives the same guarantee

The four doors do not provide the same level of control.

KSoR describes this as a **trust ladder**.

You do not need to memorize the terminology yet. Just understand the trade-off.

## Rung 1 — Discovery

Examples:

- the public website,
- `llms.txt`,
- published Markdown.

These have wide reach.

The content can be governed before publication, but after an external AI system reads it, KSoR cannot control what that external system does with it.

It may:

- cache it,
- summarize it,
- forget to cite it,
- or use an older copy later.

So the reach is broad, but the runtime guarantee is limited.

## Rung 2 — Governed interaction

Example:

- MCP.

Here the agent queries KSoR at interaction time.

This allows stronger controls around:

- what may be retrieved,
- who may retrieve it,
- which published generation is being used,
- citations,
- and abstention.

## Rung 3 — Computation attestation

This is a proposed and experimental part of the architecture.

It is intended for cases where a critical value must be tied to a sanctioned computation and mechanically checked.

Most beginners do not need this rung on day one.

### Remember

> **Different access paths provide different guarantees. Know which one you are using.**

---

# 7. KSoR does not make the language model deterministic

This point is important.

KSoR does **not** turn an LLM into a deterministic program.

The model may still:

- explain the same idea differently,
- choose different examples,
- use different wording,
- take different reasoning paths,
- or personalize the answer.

That is expected.

What KSoR makes more controlled is the **knowledge environment around the model**.

It helps define:

- which source is authoritative,
- which version is current,
- who owns it,
- who approved it,
- who may see it,
- what the system may retrieve,
- what evidence supports the answer,
- and when the system should abstain.

So think of KSoR this way:

> **The model may vary in how it reasons and explains. The institution should not vary arbitrarily in which policy or curriculum it treats as authoritative.**

---

# 8. Where can KSoR be used?

KSoR is general-purpose knowledge infrastructure.

It can be used anywhere an organization wants humans and AI agents to operate from the same governed knowledge.

## Enterprise

An accounting agent must decide whether a $42,000 implementation cost can be capitalized.

The agent needs two kinds of information.

From operational systems:

- the invoice,
- the project facts,
- the ledger,
- the current balances.

From KSoR:

- the capitalization policy,
- definitions,
- approval criteria,
- exceptions,
- and relevant procedures.

The operational systems tell the agent **what happened**.

The KSoR tells it **which governed rule to apply**.

If the policy does not cover the case, the agent should abstain or escalate.

## Education

An education KSoR can govern:

- curriculum,
- learning objectives,
- canonical definitions,
- approved teaching material,
- topic sequence,
- assessment rules,
- grading rules,
- and course versions.

Different AI tutors can still personalize how they teach while using the same academic truth.

## Vertical or domain KSoRs

A KSoR can focus on one profession or industry.

Examples:

- Accounting KSoR
- Government Contracting KSoR
- Healthcare KSoR
- Legal KSoR
- Banking KSoR
- Insurance KSoR
- Supply Chain KSoR
- Sales KSoR

A Vertical KSoR is not a different product.

It is simply a KSoR whose authoritative scope is a particular domain.

## Method KSoRs

A KSoR can also govern a reusable method, such as:

- an architecture method,
- a design system,
- API standards,
- an implementation method,
- or an operating model.

An agent can then use more than one KSoR.

For example:

- a **Method KSoR** tells the agent how to work,
- a **Banking KSoR** tells the agent what is authoritative in banking.

This allows knowledge systems to be composed instead of copied.

---

# 9. What KSoR is — and is not

Beginners often confuse KSoR with several existing technologies.

The differences are important.

## KSoR is not just RAG

RAG asks:

> **How can I retrieve relevant information and put it into model context?**

KSoR asks a broader question:

> **What knowledge is authoritative enough that the organization allows people and AI agents to operate from it?**

RAG can help retrieve information from a KSoR.

But retrieval alone does not establish:

- ownership,
- approval,
- lifecycle,
- audience,
- provenance,
- version,
- or abstention rules.

So:

> **RAG can be part of a KSoR. RAG by itself is not a KSoR.**

See [KSoR and RAG](../../README.md#ksor-and-rag).

## KSoR does not replace your ERP, CRM, HRIS, or accounting system

Those systems remain authoritative for operational state.

KSoR adds the governed knowledge layer.

AI agents often need both.

## KSoR is not a proprietary knowledge silo

KSoR is designed as open, vendor-neutral knowledge infrastructure.

The architecture separates responsibilities instead of making one product the owner of everything.

At a high level:

> **Markdown is the authoritative medium.**  
> **OKF makes the record open and portable.**  
> **KSoR governance makes it authoritative.**  
> **Postgres + pgvector make it retrievable.**  
> **Fumadocs serves humans.**  
> **`llms.txt` helps AI discover it.**  
> **MCP lets agents interact with it.**  
> **OAuth/OIDC establishes identity; KSoR governs access.**  
> **SLSA/Sigstore can prove what was published.**  
> **OpenTelemetry can record what happened.**

You do **not** need to learn all of these technologies before using KSoR.

They are separate responsibilities in the architecture.

The named technologies are reference choices where applicable. The important KSoR principle is:

> **One governance policy across every surface.**

For the current beta implementation, always check [`docs/status.md`](../status.md).

For the full architectural explanation, see [The KSoR Framework: Nine Responsibilities](../../README.md#the-ksor-framework-nine-responsibilities).

## Knowledge as Code

KSoR stores the authoritative record in Markdown and works naturally with Git.

That gives institutional knowledge useful engineering properties:

- history,
- authorship,
- diffs,
- review,
- pull requests,
- approvals,
- releases,
- rollback,
- and reproducible builds.

The knowledge is still knowledge.

"Knowledge as Code" means that the organization can manage knowledge with some of the same discipline used to manage software.

---

# 10. Run your first KSoR

Now that the mental model is clear, run the framework.

You need:

- **Node.js 24 or newer**
- npm, pnpm, or bun

Check your Node version:

```bash
node --version
```

The examples below use pnpm.

Create a project:

```bash
pnpm dlx @panaversity/ksor@latest init my-knowledge-sor
cd my-knowledge-sor
pnpm install
pnpm dev
```

Then open:

```text
http://localhost:3000
```

You should now see a working knowledge site.

The site reloads when you edit Markdown files under:

```text
knowledge/
```

Your generated project is an ordinary project that you own.

Nothing needs to be downloaded at build time, and the generated project does not phone home.

---

## Let your coding agent help

Open the project in the coding agent you already use, for example:

- Claude Code,
- Cursor,
- Copilot,
- or another coding agent.

Tell the agent what this KSoR is for.

For example:

> "This KSoR will contain the approved expense policies and approval rules for Example Corporation."

The generated project includes `AGENTS.md`, which gives coding agents instructions for working with the KSoR safely.

The agent can then help you replace the placeholder in `instance.md` and work with the governed structure.

You do not need to memorize every file format before starting.

---

## Two commands to know

Before sharing a change, validate the knowledge:

```bash
pnpm check
```

To build the human-readable site:

```bash
pnpm build
```

The static output is written to:

```text
system/site/out/
```

---

## Orient yourself in the project

A generated project looks roughly like this:

```text
my-knowledge-sor/
│
├── knowledge/              # authoritative governed record
├── .ksor/
│   └── governance.yaml     # governance policy
├── system/
│   └── site/               # human-readable projection
├── .agents/
│   └── skills/             # skills for coding agents
├── AGENTS.md               # instructions for coding agents
└── instance.md             # what this KSoR is authoritative for
```

You only need to understand a few things at first.

### `knowledge/`

This contains the authoritative knowledge.

### `instance.md`

This explains what this KSoR is for and what its authoritative scope is.

### `.ksor/governance.yaml`

This contains governance rules such as audiences, ownership, approval, and takedown authority.

### `system/site/`

This is the reference human-readable projection.

It displays the governed knowledge.

It is not a second source of truth.

### `AGENTS.md` and `.agents/`

These help coding agents maintain the project correctly.

They are maintenance infrastructure, not the institution's authoritative knowledge.

---

# 11. Your first exercise

Do not start by trying to model an entire company.

Choose one small area.

For example:

> **Employee Expense Approval KSoR**

First, edit `instance.md` so the scope is clear.

Then choose three to five pieces of knowledge.

For example:

- meal expense limit,
- hotel limit,
- travel approval rule,
- manager approval threshold,
- exception procedure.

For each piece of knowledge, ask:

1. **Who owns it?**
2. **What source supports it?**
3. **Who may approve it?**
4. **Who may read it?**
5. **When does it take effect?**
6. **What happens when it changes?**
7. **What should the agent do if the rule does not cover the situation?**

Then use the generated project's agent instructions to add the knowledge in the format expected by the current KSoR release.

Validate it:

```bash
pnpm check
```

Build the site:

```bash
pnpm build
```

At this point, something important has changed.

You no longer have:

> "some documents an AI might read."

You have started defining:

> **the knowledge your organization declares authoritative.**

That is the beginning of a Knowledge System of Record.

---

# 12. Later: let AI agents query the KSoR

The website is only one way to reach the governed record.

Later, you can let AI agents query the KSoR directly through MCP.

The reference retrieval implementation uses Postgres + pgvector.

When you are ready, the basic flow is:

```bash
pnpm provision
pnpm refresh
pnpm serve
```

Think of the commands this way:

- `provision` prepares the retrieval infrastructure,
- `refresh` publishes the current governed corpus,
- `serve` makes the published record available to agents.

The separation is deliberate.

> **Publishing institutional truth should be an intentional action, not an accidental side effect of starting a server.**

After changing governed knowledge, publish a new generation with:

```bash
pnpm refresh
```

The detailed walkthrough is in [Serve to AI Agents](../../README.md#serve-to-ai-agents).

KSoR is under active development, so always check [`docs/status.md`](../status.md) for what the current release supports.

---

# 13. The mental model to remember

If you remember only four things from this tutorial, remember these:

1. **Decide which pages are the real ones.**
2. **Make AI helpers operate from those pages instead of choosing their own institutional truth.**
3. **Make important answers traceable to the page that supports them.**
4. **Let the system say "I don't know" when the governed record does not contain the answer.**

Now return to the hospital.

At the beginning, three AI helpers gave three different answers.

After the hospital defined:

- one authoritative record,
- governance,
- approval,
- access rules,
- provenance,
- citations,
- and abstention,

the helpers no longer had to choose their own source of institutional truth.

> **Nothing had to make the model magically smarter. The hospital decided which knowledge was authoritative.**

The architecture can be summarized in one line:

> **One authoritative record. One governance boundary. Many open projections.**

And the operating principle is:

> **Govern knowledge once. Project it many ways.**

---

# 14. Where to go next

This tutorial introduced the idea.

The next tutorials can move from the mental model to implementation.

1. **Build a Real Governed KSoR**  
   Create a small real corpus, add governed concepts, validate them, and publish the human-readable site.

2. **KSoR Governance in Practice**  
   Work with ownership, audiences, approvals, lifecycle states, effective dates, takedown, and fail-closed behavior.

3. **Serve a KSoR to AI Agents with MCP**  
   Provision the retrieval layer, publish a generation, connect an MCP client, retrieve citations, and test abstention.

4. **Combine KSoR with Traditional Systems of Record**  
   Build an agent that combines governed policy from KSoR with current facts from an ERP, CRM, accounting system, or application database.

5. **Exchange Governed Knowledge with OKF**  
   Move governed knowledge between knowledge systems without creating another independent source of truth.

---

## Related material

- [Repository README](../../README.md)
- [Current implementation status](../status.md)
- [KSoR Standard Proposal (KSP-001)](../../research/ksor-standard-proposal-001-v0.1-draft9.md)
- [KSoR repository](https://github.com/panaversity/ksor)
- [KSoR — Introduction and the Eight Concepts (YouTube)](https://www.youtube.com/watch?v=EeTGuQJbHCg)

---

## Final thought

AI models can reason over enormous amounts of information.

But reasoning ability and institutional authority are different things.

The model can help decide:

> **What follows from this rule?**

The organization must still decide:

> **Which rule is the rule?**

That is the role of a Knowledge System of Record.
