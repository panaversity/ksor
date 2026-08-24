---
title: The agent surface
description: MCP for retrieval with citations, and machine-readable files beside it.
status: approved
owner: Product
order: 2
effective: 2026-08-22
provenance:
  - KSoR README, "an agent interface through MCP for search, retrieval, citation, reasoning, and action"
---

Agents reach the record through MCP — an open standard, so one corpus answers in
any assistant or framework its owner points at it.

## Retrieval that cites

Search and retrieval answer with citations back into the record, so a claim can
be checked against the document that carries it rather than taken on trust.

### Abstention is a feature

"Not in this record" is a correct answer. It is never an error, and never a
licence to fall back on what a model happens to remember.

> [!WARNING]
>
> An agent that fills a gap from its own memory has not used this record — it
> has used it as an opening paragraph. Nothing in the answer says which half
> came from where.

## Files beside the interface

The build publishes the same knowledge as plain files an agent can fetch without
a server: `llms.txt` indexes the record, `llms-full.txt` carries every document
in one file, and each document has a markdown twin at its own address.
