---
"@panaversity/ksor": patch
---

Ship the deployment artifacts: `ksor init` now emits a `Dockerfile` and
`.dockerignore`, and its `vercel.json` declares both surfaces — the static site
and the MCP door — behind one domain.

The served MCP rung is a core surface, not an optional extra, so a scaffolded
project should be able to reach a host without anyone hand-writing a container
recipe first. The emitted `Dockerfile` names no vendor: it installs the pinned
`@panaversity/ksor`, honours `$PORT`, and runs `ksor serve`, so the same image
runs on Cloud Run, Fly, Render, ECS, Kubernetes or a VPS. `vercel.json` points
AT that file rather than replacing it, which is what keeps the host a choice —
moving is a redeploy, not a rewrite. A test asserts that neutrality directly,
and CI now builds the emitted image, boots it against real Postgres and asks it
a question over MCP, with no hosting vendor involved.

Verified live before shipping, and the verification paid for itself: a
project-level `trailingSlash: true` — harmless while the config was static-only
— 308-redirected every door route including `POST /mcp`. It is removed (the
site's own Next config already sets it where it belongs); shipping it would have
broken the MCP endpoint of every adopter who deployed.

Two new documents: `docs/deploying.md` (both surfaces onto a host, the
configuration each needs, and what a cold start costs — measured) and
`docs/ingesting.md` (why serving does not publish, so a first deploy with no
ingest serves an empty record; where ingest belongs, which is never inside the
container; and how the abstention gate gets turned on).

Also drops the scaffold's build-script denials for `@google/genai` and
`protobufjs`. The embedding provider speaks the vendor's REST API directly now,
so neither package is installed at all and the entries described a dependency
that no longer exists.
