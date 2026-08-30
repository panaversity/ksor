---
"@panaversity/ksor": patch
---

**Three places where the record described a system that was never built.**
Nothing an adopter runs changes; what changes is whether the decision log can be
trusted without re-checking it against the code (issues #151 and #180).

Decision 13 said the door composes `secureHeaders` / `bodyLimit` middleware.
`bodyLimit` is real — `content-gateway/src/http.ts:26,522` — but `secureHeaders`
was never adopted: nothing imports it, and the door sets its own pair by hand
(HSTS and `x-content-type-options: nosniff`, "nothing else"). The code is right
and the entry was wrong, so the entry is corrected.

The same decision, and guard rule 5's why-comment, said `hono` and
`@hono/node-server` were "already the SDK's transitive deps, so zero new install
bytes". True of the 1.x monolith, false since v2 — `@modelcontextprotocol/server`
2.0.0 depends on `zod` and `@modelcontextprotocol/core` and nothing else. The
reason that survives the upgrade is the one already recorded (the SDK's only HTTP
shape is Web-standard and hono needs no bridge to it); the weight is a cost paid
deliberately rather than an absence of cost.

The README stated OpenTelemetry in the present tense — "tells us what happened",
"records what the infrastructure did" — with no telemetry code in the tree. It is
future tense now, with the constraint the row's own wording already implies:
default auto-instrumentation captures `pg` statement text, and a trace backend is
a different security boundary from the MCP response.

SLSA/Sigstore, two rows above, needed the opposite correction. It is not future:
`release.yml` sets `id-token: write`, so every release attests the published
PACKAGE through npm provenance. What is unbuilt is signing a RECORD's own
`build.lock.json`. Both rows now say which half runs.

Also removed: a `publishConfig` block on `@panaversity/ksor-content-gateway`,
which is `private: true` and is bundled rather than published, so the block could
never apply.
