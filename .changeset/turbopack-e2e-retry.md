---
"@panaversity/ksor": patch
---

test(ci): make the scaffold browser e2e reliable — retry `pnpm build` once on the
known upstream Turbopack static-image flake (`TurbopackInternalError: Input image
not found`), scoped to that exact signature so a real build break still fails on
the first try. Test-infrastructure only: the published CLI tarball is unchanged
(the retry helper is not reachable from the CLI entry and does not ship). The
durable fix — dropping the scaffold home page's static `app/icon.png` import — is
tracked as an owner call.
