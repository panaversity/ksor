---
"@panaversity/ksor": patch
---

`ksor init` now names `pnpm serve` in its next-steps output, and the docs stop
describing an auth-off default that never existed.

The handoff printed after scaffolding listed `pnpm install` and `pnpm dev`, so
the agent projection — the core surface of every KSoR — went unnamed at the one
moment the adopter is actually reading the screen.

Separately, decision 7's serving clause and the three docs that copied it said a
local `serve` "binds loopback with auth off". `buildAuth` has never had that
default: it refuses to boot unless SSO is configured or `KSOR_AUTH_DISABLED=1`
is set explicitly, loopback included. The real posture is stronger than the
sentence claimed, but the docs were telling adopters a local `serve` would come
up without the flag it requires.
