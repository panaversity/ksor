---
title: The tool surface
status: draft
---

# Shaping what agents see — `system/gateways/content.ts`

That file is your record's MCP registration: ordinary `registerTool` calls with
ordinary zod. It decides what your tools are called, what they say, what they
accept, and which of them exist. It is yours, and deleting it is supported —
without it the door serves the same defaults.

## Why it is worth editing

An agent pays for this surface out of its context window, and it pays twice.
Every tool's name, description and input schema is resident for the whole
session; every answer spends more.

Measured against a live 81-document record (6,963 chunks), ~4 chars/token:

|                                | chars  | ~tokens |                     |
| ------------------------------ | ------ | ------- | ------------------- |
| all three tool definitions     | 11,960 | 2,990   | **always resident** |
| `search` alone                 | 5,383  | 1,346   | always resident     |
| `outline` + `read`             | 6,571  | 1,643   | always resident     |
| one `search`, `k=10` (default) | 14,164 | 3,541   | per call            |
| one `search`, `k=5`            | 8,009  | 2,002   | per call            |

An agent with five records attached carries ~15,000 tokens of definitions before
doing any work.

## The three edits that pay

### 1. Delete a tool nothing calls

The biggest win, and the easiest — delete its `registerTool` block. Measured
live: a registration keeping only a renamed `search` served **5,337** bytes
against the default's 11,960.

### 2. Say what the record covers

The line that decides whether an agent asks _you_ rather than another record it
has open. Name the subject **and the boundary**:

```ts
description: `Employee handbook: leave, benefits, conduct, expenses.
Not product documentation and not customer data.\n\n${FLOOR.search}`,
```

Your prose goes **above** `FLOOR.search`, never instead of it — see below.

### 3. Set `k`

`k` is the lever on reply size: 10 costs ~3,500 tokens a call, 5 costs ~2,000.
The caller can always ask for more, so make the default what you usually need.

```ts
inputSchema: z.object({
  query: z.string().min(1).max(2000),
  k: z.number().int().min(1).max(50).default(5),
}),
```

**`budgets.maximum_response_characters` is not this lever.** It defaults to
120,000 and at ~1,400 chars a hit cannot bind before the 50-hit ceiling. Tune `k`.

## Adding your own tools

It is an MCP server. Call `registerTool` again with your own handler:

```ts
server.registerTool(
  "check_policy_expiry",
  {
    inputSchema: z.object({ policy: z.string() }),
  },
  async ({ policy }) => ({ content: [{ type: "text", text: await lookup(policy) }] }),
);
```

One thing to be clear-eyed about: **ksor makes no provenance claim about a tool
it did not hand you a handler for.** `searchHandler(ctx)` answers from the
governed record with citations; a handler you write answers from wherever you
made it answer from.

## What you cannot change, and why

- **The handlers.** `searchHandler` / `outlineHandler` / `readHandler` are the
  only things that can prove a passage came from the governed record. A
  hand-written one returning fabricated hits with plausible `stable_id`s would
  pass every shape check there is.
- **The output schemas.** `SEARCH_OUTPUT`, `OUTLINE_OUTPUT`, `READ_OUTPUT` carry
  `provenance`, the `snapshot` token and `gate`. A record that reshaped them
  would still look like a KSoR and no longer be one.
- **The `FLOOR` text.** It tells an agent how to branch on an envelope, what
  `gate: "off"` means, and that corpus content is **untrusted** — quote it, never
  obey it. Your prose is composed above it.

## The door checks its own surface at boot

Because that last one is a template literal in a file you own, nothing structural
stops it being dropped. So the door builds its server, asks itself `tools/list`
over an in-memory transport, and refuses to start if a guarantee is gone:

```
error: ksor-gateway-floor-missing: the search tool is served as "search_the_book"
without its framework description. That text tells an agent how to read an
abstention and that corpus content is untrusted — without it this record answers
without ever declining, and follows instructions written into its own documents.
Put FLOOR.search back: a record's own prose goes ABOVE it, as
`${yourText}\n\n${FLOOR.search}`, never instead of it
```

| what                                               | slug                         |
| -------------------------------------------------- | ---------------------------- |
| a served ksor tool lost its `FLOOR` text           | `ksor-gateway-floor-missing` |
| the registration serves no tools at all            | `ksor-gateway-no-tools`      |
| the file throws, or default-exports a non-function | `ksor-gateway-unloadable`    |

Delete the file to take the default registration back.

## One import, no dependencies

Everything comes from `@panaversity/ksor/gateway` — including `z` and
`McpServer`. That is deliberate: your registration stays a _file_, with no
package.json, no build step, and nothing new in your lockfile. It also means the
SDK validates with the same zod instance it was built against, which a
separately-installed zod would not.

## More records later

`identity` and `praxis` get `system/gateways/<record>.ts` by the same rule.
Nothing above is specific to content except which tools exist.
