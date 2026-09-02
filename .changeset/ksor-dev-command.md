---
"@panaversity/ksor": patch
---

Implement `ksor dev` — a local development server that starts `next dev` over `system/site`, watches `knowledge/` (and `.ksor/`, `instance.md`) and re-runs the record checker on every save in `check` mode, and proxies `/mcp` to a running `ksor serve` so the dev server is the one URL for humans and agents.

- New spec at `specs/ksor/dev/spec.md` (draft — ratification is the owner's call).
- `packages/ksor/src/dev/{index,server,govern,proxy}.ts`: the verb, the dev server, the governance watch, and the best-effort MCP proxy.
- Wired into `cli.ts` dispatch and `--help`; `dev` is no longer the "designed but not implemented" verb (previously exited 2).
- Startup preconditions (`ksor-instance-missing`, `ksor-dev-no-site`, missing `next`) refuse with exit 1 / 3; a save that would fail `ksor build` is reported on stderr and the last good page is kept.
- `docs/status.md` updated: `dev` is now implemented.
