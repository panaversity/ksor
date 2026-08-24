---
"@panaversity/ksor": patch
---

The scaffold meets your package manager

`ksor init` now emits the scaffold for the manager that ran it: `npx
@panaversity/ksor init` produces an npm project, `bunx` a bun one, `pnpm dlx`
(or anything unrecognized) the pnpm shape every scaffold got before. Node stays
the one prerequisite — nobody installs a second package manager to open their
own knowledge base (issue #28).

The whole scaffold speaks the detected manager: scripts, README, AGENTS.md, the
agent kit, the CLI's own handoff text. npm and bun scaffolds declare
`workspaces` in the manifest and ship no lockfile — the pinned CLI version
cannot be pre-resolved into one, so the first install writes it and the README
says to commit it. The install-script denial carries over (`.npmrc` with
`ignore-scripts=true` for npm; bun refuses dependency lifecycle scripts by
default). What npm and bun cannot offer is pnpm's 48-hour quarantine on newly
published dependency versions — the emitted scaffold discloses that instead of
staying silent about it.

Each manager's shape was proven end to end before shipping — install, `ksor`
bin resolution, format checker, full static site build — and CI now walks npm
and bun scaffolds on every change.
