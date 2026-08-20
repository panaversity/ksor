---
"@panaversity/ksor": patch
---

fix: `ksor serve` reports its real version to MCP clients. In 0.0.4 every
client saw `serverInfo.version` of `0.0.0`: the gateway read the version from
an environment variable at module scope, and the CLI's static import evaluated
that module before the CLI could set the variable. The version now travels as
an argument, and a test drives the bundled binary to assert it.
