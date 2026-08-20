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
