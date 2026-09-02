---
status: ratified
date: 2026-08-23
claim: agents are the operator, not the audience for a manual — a record whose tool surface it cannot shape spends the caller's context badly and gets picked for the wrong questions
evidence: measured against the live 81-document book record, 2026-08-23 (below)
---

# The adopter-owned gateway — `system/gateways/content.ts`

The MCP door's tool surface was fixed: three tools named `search`, `read` and
`outline`, with framework-authored descriptions and framework-chosen input
schemas. That is the right default and the wrong ceiling.

`ksor init` now emits the **registration itself** — ordinary `registerTool` calls
with ordinary zod — into the adopter's repository. They own it. What it composes
stays in the package.

## Why, measured

**Definitions**, re-measured 2026-08-25 from the served `tools/list` of the
default registration, at ~4 chars/token. They depend on the code alone, so they
are exact for every record:

|                                  | chars  | ~tokens |                                |
| -------------------------------- | ------ | ------- | ------------------------------ |
| tool definitions, as transmitted | 17,394 | 4,349   | **always resident in context** |
| `search` alone                   | 8,152  | 2,038   | always resident                |
| `outline` alone                  | 3,552  | 888     | always resident                |
| `read` alone                     | 5,686  | 1,422   | always resident                |
| `outline` + `read`, if deleted   | 9,238  | 2,310   | the delete-both saving         |

The first row is the JSON of the whole `tools` array; every other row is one
tool's own object. The array carries four characters no tool's row does — two
brackets and two separators — so the three tools sum to **17,390** and the
array is **17,394**. Deleting a tool saves that tool's own row.

**Replies** depend on the record's passages. These are the 2026-08-23
measurement against the live book record (81 documents, 6,963 chunks) plus the
`governance` block each hit — and each `read` reply — now carries, measured
exactly at 262 chars for a
document with a verification and an approval, 133 for a level-0 record with
neither. NOT re-measured against that record:

|                                | ~chars | ~tokens |          |
| ------------------------------ | ------ | ------- | -------- |
| one `search`, `k=10` (default) | 16,784 | 4,196   | per call |
| one `search`, `k=5`            | 9,319  | 2,330   | per call |
| one `search`, `k=3`            | 4,939  | 1,235   | per call |

The definitions grew — `search` was 5,383 chars before the trust floor and the
per-hit governance, `read` 3,396 before it carried the same block — which is
the price of an agent being able to tell a
reviewed document from an unreviewed one, charged once per session. The last
520 chars are the price of that signal being HONEST: `trust_tier` is derived
from reviews a document declares about itself, gated by no authority list, and
both floors now say so instead of letting `human-reviewed` read as a check the
record performed.

Two consequences set the scope:

1. **Dropping an unused tool is the largest win** — ~2,310 tokens for the whole
   session, whether or not the agent would ever have called them.
2. **`k` is the result lever; `budgets.maximum_response_characters` is not.** It
   defaults to 120,000 and at ~1,700 chars a hit cannot bind before
   `MAX_SEARCH_K`. Dead configuration.

## Why real code, and not a config API

A config API (`defineGateway({ tools: [...] })`) was built first and discarded.
Models are trained on the MCP SDK and on zod; they are not trained on our field
names. A registration file needs no vocabulary, and it does not stop at what we
thought to expose — an adopter can add their own tools with `registerTool`, which
no config schema could have anticipated.

The exchange is that guarantees stop being structurally impossible to break and
become **verified at boot** instead. That is this codebase's posture everywhere
else — `assertGovernanceServable`, decision 19's both-surfaces refusal, decision
18's drift table. Hand the code over; refuse to boot on a state that breaks it.

## Observable contract

### The file

```ts
import {
  FLOOR,
  McpServer,
  READ_ONLY,
  SEARCH_OUTPUT,
  TRUST_TIERS,
  composeInstructions,
  searchHandler,
  z,
} from "@panaversity/ksor/gateway";

export default function buildGateway(ctx, version) {
  const server = new McpServer(
    { name: "acme-handbook", version },
    { instructions: composeInstructions(ctx.instance.instructions) },
  );

  server.registerTool(
    "search_handbook",
    {
      title: "Search the handbook",
      description: `Leave, benefits, conduct. Not product docs.\n\n${FLOOR.search}`,
      inputSchema: z.object({
        query: z.string(),
        k: z.number().int().default(5),
        min_trust_tier: z.enum(TRUST_TIERS).optional(),
      }),
      outputSchema: SEARCH_OUTPUT,
      annotations: READ_ONLY,
    },
    searchHandler(ctx),
  );

  return server;
}
```

**One import.** `z` and `McpServer` are re-exported from
`@panaversity/ksor/gateway` deliberately: a registration must stay a FILE, not a
package, so the scaffold gains no dependencies, no lockfile churn and no build
step — and the SDK validates with the same zod instance it was built against,
which a separately-resolved zod would break in ways that read as schema bugs.

**Deletable.** Absent, the door serves the compiled default, which is this same
code. Asserted by comparing both surfaces over the protocol.

### Two copies, and why that is forced

`packages/content-gateway/src/default-gateway.ts` is the canonical file;
`templates/scaffold/system/gateways/content.ts` is generated from it and differs
only in the import specifier. `default-gateway-drift.integration.test.ts` fails on
the line that diverges — decision 18's mechanism.

Two copies is forced, not chosen: **Node refuses to type-strip any `.ts` under
`node_modules`** (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, verified
directly; no flag lifts it), so the published package cannot import its own
emitted template as the fallback. It needs a compiled twin, and an undiffed twin
is exactly the drift that leaked the visibility rule four times.

### What stays in the package

`searchHandler` / `outlineHandler` / `readHandler`, the output schemas, the
`FLOOR` text — and the DEFAULT and ENFORCEMENT of `min_trust_tier`. The handler
owns the floor because an adopter's zod could otherwise decide it: a
`.default("human-reviewed")` would silently empty their record, and the other
direction would be a loosening the deployment did not choose. The rule is one
function, `tightenTrustFloor` — the higher of the deployment's floor and the
caller's — so configuration tightens and an argument never loosens. Handlers because they are the only thing that can prove a passage
came from the governed record — a hand-written one returning fabricated hits with
plausible `stable_id`s passes every shape check there is. Schemas and floors
because they are the citation and abstention guarantees.

### What the door verifies at boot

Built server → in-memory transport pair → full MCP handshake → `tools/list` →
inspect. Raw JSON-RPC, not the client SDK: `@modelcontextprotocol/client` is a
devDependency and is absent from the published package, so a check needing it
would pass CI and throw on an adopter's install.

| state                                                 | slug                         |
| ----------------------------------------------------- | ---------------------------- |
| a served ksor tool whose description lost its `FLOOR` | `ksor-gateway-floor-missing` |
| a registration that serves no tools                   | `ksor-gateway-no-tools`      |
| the file throws, or default-exports a non-function    | `ksor-gateway-unloadable`    |

One state is NOTICED rather than refused: a served `search` tool with no
`min_trust_tier` parameter. The distinction is the contract — a missing `FLOOR`
is a broken guarantee, a missing `min_trust_tier` is a missing capability. Every
guarantee still holds without it (the handler applies `unverified`, and the
deployment's own floor is untouched), so refusing would take a working record
off the air for a parameter that did not exist when its registration was
emitted. The notice names the tool by the name the record gave it, and the line
to paste.

Checks **values**, never key presence: in-process the reply passes by reference,
so every optional key exists holding `undefined`, and a `"description" in tool`
test would pass for a tool that has none — then disagree with the wire, where
serialization drops it.

Loaded and verified at **boot**, never per-request. The SDK's factory would
happily await a dynamic import per call, but a broken file would then stop being
a boot refusal and become a 500 on a process whose `/health` and `/ready` both
read green — a shape this repo has already had to fix twice.

## Acceptance

_Ratified 2026-09-02: every line below has a suite in the tree, walked against
the built package at this date, EXCEPT 6 — which is a live walk recorded on
2026-08-23 and was not re-walked here; its mechanical half (rename, a dropped
tool, a floor-less boot refused) is held by
`ksor/src/gateway-file.integration.test.ts:111,137`, and what rests on the
recorded walk alone is the part no suite can reach: identical provenance from a
real served record. 1 `content-gateway/src/floor-guarantees.test.ts`;
2 `ksor/src/default-gateway-drift.integration.test.ts` (including "needs no
dependency the scaffold does not have"); 3
`ksor/src/served-surface.integration.test.ts` against
`__fixtures__/served-surface.golden.json` — whose `tools` array measures
17,394 chars and its three rows 8,152 / 3,552 / 5,686, the figures above; 4
and 5 `ksor/src/gateway-file.integration.test.ts` (deletable, identical
surface; the three slugs by name); 7
`content-gateway/src/gateway-notice.test.ts`. The example
registration's imports all resolve from `@panaversity/ksor/gateway`
(`content-gateway/src/gateway-api.ts:20-36`)._

1. **Unit** — every sentence in `FLOOR_GUARANTEES` survives in each floor.
   (Written after one was silently deleted; proven to go red against that
   deletion.)
2. **Integration** — the emitted file and the canonical one differ only in the
   import specifier; the emitted copy names exactly one dependency.
3. **Integration** — `tools/list` from the default registration matches a
   committed golden capture, field for field. (Written after a retyped schema
   served `content` where the record serves `text`; proven to go red against it.)
4. **Integration** — deleting the file serves an identical surface.
5. **Integration** — a registration dropping `FLOOR.search` is refused
   `ksor-gateway-floor-missing`; one serving nothing is refused
   `ksor-gateway-no-tools`; a broken file is refused `ksor-gateway-unloadable`.
6. **Live** — verified against the served book record (2026-08-23): rename works
   with identical provenance, dropping tools falls the definitions accordingly,
   the file's `k` is the default, and a floor-less registration exits 1 at boot.
7. **Unit** — a registration with no `min_trust_tier` BOOTS and produces a
   notice naming the tool and the fix; one that has it produces none; a record
   serving no search tool produces none.

## Out of scope

- **Labelling adopter-added tools.** `registerTool` is available, so a record can
  add its own — and ksor makes no provenance claim about a tool it did not hand a
  handler for. Making that visible to an agent is the next decision, not this one.
- **Snippet / truncation mode.** `service.ts` sheds over-budget hits by SKIPPING
  them, commented "never truncated mid-content" — reversing that is its own
  decision.
- **Retiring `budgets.maximum_response_characters`.** Measured dead; removing a
  public key is a separate breaking change.
