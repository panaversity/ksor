---
"@panaversity/ksor": patch
---

feat: `@panaversity/ksor` now ships the whole Knowledge System of Record as ONE
package. The kernel (corpus store, hybrid retrieval, calibrated abstention, and
the MCP gateway) is bundled into the CLI, which exposes one `ksor` binary with
all verbs: `init`, `dev`/`build` (still exit 2), `serve` (runs the MCP server
in-process, reading `./instance.md`), and the corpus operations `ingest`,
`schema`, `calibrate`, `gc`. An adopter installs one thing and the content SoR
is always present. Note: the CLI is no longer zero-dependency — installing it
now pulls the server runtime (pg, the embedding SDK, the MCP SDK).

Because MCP serving is a core surface, `ksor init` now declares
`@panaversity/ksor` as a dependency of the scaffolded project — pinned to the
exact CLI version that scaffolded it — with `pnpm serve` and `pnpm ingest`
scripts, so the served tool is a first-class, version-pinned command rather
than an `npx` afterthought. The scaffold's first `pnpm install` is non-frozen
(it resolves the tool and writes the lockfile); `pnpm dev` still needs no
database.

The MCP surface ships on the **2026-07-28** spec revision, via SDK v2
(`@modelcontextprotocol/server`). Since this release is the agent surface's
debut, it ships current rather than one revision behind: the door serves the
handshake-free modern era (`server/discover`, per-request envelope) and keeps
serving 2025-era clients through the same stateless idiom, so nothing that
works today stops working.

Scaffold serve-rung fixes (from a multi-agent operability review): the
scaffolded format checker (`pnpm check`) now accepts the `database:`/`embedding:`/
`retrieval:`/`budgets:` blocks that `ksor serve`/`ingest` require, so a project
climbing to serving is no longer rejected by its own CI; the scaffold's
`pnpm ingest` script now `--flip`s (a first ingest without it left the server
answering from an unactivated generation); the kernel's build-scripted deps
(`@google/genai`, `protobufjs`) are denied under `allowBuilds` so the first
install does not exit 1; and the scaffold `AGENTS.md`/`README.md` now carry the
full serve runbook — the ordered `schema` → grant → `ingest` → `serve` pipeline,
the `instance.md` block shapes, the env contract, the generation model, and the
fail-closed security posture.
