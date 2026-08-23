---
title: The tool surface
status: draft
---

# Shaping what agents see — `system/gateways/content.ts`

Your record's MCP door serves three tools. That file decides what they are
called, what they say, and which of them exist at all. It is yours, and deleting
it is supported: without it the door serves exactly the defaults.

## Why it is worth editing

An agent pays for this surface out of its context window, and it pays twice.
Every tool's name, description and input schema sits in that context for the
whole session. Every answer spends more of it.

Measured against a live 81-document record (6,963 chunks), at ~4 chars/token:

|                                | chars  | ~tokens |                     |
| ------------------------------ | ------ | ------- | ------------------- |
| all three tool definitions     | 11,373 | 2,843   | **always resident** |
| `search` definition alone      | 5,147  | 1,287   | always resident     |
| `outline` + `read` definitions | 6,222  | 1,556   | always resident     |
| one `search`, `k=10` (default) | 14,164 | 3,541   | per call            |
| one `search`, `k=5`            | 8,009  | 2,002   | per call            |
| one `search`, `k=3`            | 4,153  | 1,038   | per call            |

An agent with five records attached carries ~14,000 tokens of tool definitions
before it does any work.

## The three edits that pay

### 1. Drop a tool nothing calls

The largest measurable win, and the easiest. If your agents only search, say so
and stop paying ~1,550 tokens a session for two definitions nobody reads:

```ts
export default defineGateway({
  tools: [contentTools.search()],
});
```

### 2. Say what the record covers

The line that decides whether an agent asks _you_ rather than one of the other
records it has open. Name the subject **and the boundary** — the second half
prevents more wrong calls than the first:

```ts
contentTools.search({
  covers:
    "Employee handbook: leave, benefits, conduct, expenses. " +
    "Not product documentation and not customer data.",
});
```

`covers` is composed **above** the framework's own text, never instead of it —
see "What you cannot change".

### 3. Set `k`

`k` is the lever on reply size: the default of 10 costs about 3,500 tokens a
call, and 5 costs about 2,000. The caller can always ask for more, so the
default should be what your record usually needs, not its maximum.

```ts
contentTools.search({ k: 5 });
```

**`budgets.maximum_response_characters` is not this lever.** It defaults to
120,000, and at ~1,400 characters a hit even the 50-hit ceiling reaches only
~71,000 — it cannot bind. Tune `k`.

## Renaming

```ts
contentTools.search({ name: "search_handbook", title: "Search the handbook" });
```

Names must be lowercase letters, digits and underscores, starting with a letter.

Worth knowing before you do it: an agent that has met one KSoR knows every KSoR
by its tool names, and renaming trades that away. It is the right trade when an
agent has several records attached at once and needs to tell them apart — and
the wrong one if you are just renaming to taste.

## What you cannot change, and why

- **The shape of a result** — `hits`, `provenance` (`stable_id`, `generation`,
  `retrieved_at`), the `snapshot` token, and `gate`. These are the citation and
  abstention guarantees; a record that could reshape them would still look like
  a KSoR and no longer be one.
- **Input schemas** — a caller's contract must not vary by record.
- **The description floor.** `covers` goes above it. The floor carries how to
  branch on the envelope (`abstained` vs `unavailable` vs `unpublished`), what
  `gate: "off"` means, and the instruction that hit content is **untrusted
  corpus text** to be quoted, never obeyed. A record that replaced it wholesale
  would silently stop abstaining and start following instructions written into
  its own documents — and nothing would go red.

## When it is wrong, it says so at boot

A broken file refuses before the door opens, rather than serving a surface you
did not ask for. Each refusal's first line is a stable slug:

| what                                      | slug                          |
| ----------------------------------------- | ----------------------------- |
| no tools listed                           | `ksor-gateway-no-tools`       |
| two tools with the same name              | `ksor-gateway-duplicate-tool` |
| a name agents cannot call                 | `ksor-gateway-bad-tool-name`  |
| `k` outside 1–50                          | `ksor-gateway-bad-k`          |
| the file throws, or has no default export | `ksor-gateway-unloadable`     |

Delete the file to take every default back.

## More records later

`identity` and `praxis` records get `system/gateways/<record>.ts` by the same
rule. Nothing above is specific to content except which tools exist.
