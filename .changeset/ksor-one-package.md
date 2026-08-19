---
"@panaversity/ksor": minor
---

feat: `@panaversity/ksor` now ships the whole Knowledge System of Record as ONE
package. The kernel (corpus store, hybrid retrieval, calibrated abstention, and
the MCP gateway) is bundled into the CLI, which exposes one `ksor` binary with
all verbs: `init`, `dev`/`build` (still exit 2), `serve` (runs the MCP server
in-process, reading `./instance.md`), and the corpus operations `ingest`,
`schema`, `calibrate`, `gc`. An adopter installs one thing and the content SoR
is always present. Note: the CLI is no longer zero-dependency — installing it
now pulls the server runtime (pg, the embedding SDK, the MCP SDK).
