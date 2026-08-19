---
"@panaversity/ksor": minor
---

feat(serve): `ksor serve` is implemented. The zero-dep CLI resolves the
installed kernel gateway (`@panaversity/ksor-content-gateway`) from the project
and spawns it as a subprocess — forwarding arguments, environment, and stdio,
and returning its exit code — so the CLI never imports the heavy kernel (the
MCP SDK + pg + the embedding SDK). When the kernel is not installed, `serve`
exits 3 with a remedy naming the package to add. `dev` and `build` still exit 2.
