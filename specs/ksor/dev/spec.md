---
status: ratified
date: 2026-08-28
claim: "`ksor dev` runs a local knowledge site with hot reload and live governance checks, proxying the MCP surface when `ksor serve` is running."
evidence:
  - "`packages/ksor/src/dev/index.ts`: the dev command entry point."
  - "`packages/ksor/src/dev/server.ts`: spawns `next dev` for `system/site` and watches `knowledge/`."
  - "`packages/ksor/src/dev/govern.ts`: runs `checkRecord` on every save and prints refusals."
  - "`packages/ksor/src/dev/proxy.ts`: proxies `/mcp` to a running `ksor serve` when reachable."
  - "`packages/ksor/src/cli.ts`: dispatches the `dev` verb (replacing the `notImplemented` exit 2 stub)."
  - "`packages/ksor/src/index.ts`: defines the `notImplemented: 2` and `environment: 3` exit codes reused here."
---

# `ksor dev` — local development server

The verb that turns a governed record into a live, reloadable workspace: a
human-readable site you can click through while you write, a machine-readable
MCP surface agents can talk to, and governance that tells you the instant a
save breaks the rules — before you commit, before CI, before a reader meets it.

## Observable contract

`ksor dev` SHALL:

1. Locate the record root (the directory holding `instance.md`), exactly as
   `build`, `migrate` and `ingest` do (`resolveInstanceDir`). When none is
   found, exit `1` (`ksor-instance-missing`) with the same remedy `build` prints.

2. Start the static site dev server by spawning `next dev` in `system/site`
   with the record root on `KSOR_ROOT`, so the site reloads as `knowledge/`
   changes. If `system/site` is absent, exit `3` (`ksor-dev-no-site`) — the
   dev experience needs the bundled Next.js app.

3. Watch `knowledge/` (and `.ksor/`, `instance.md`) for changes. On every
   change, run `checkRecord` (the SAME rule set `ksor build` runs) in `check`
   mode (never writes). If there are refusals, print them to stderr and keep
   the previous good build state; the server stays up so the author can see the
   last valid page. A green check prints a one-line confirmation.

4. Detect a running `ksor serve` (TCP probe on the configured port, default
   `3000` is the site, the MCP port is `3001` unless `KSOR_MCP_PORT` says
   otherwise). When reachable, start an HTTP proxy that forwards `/mcp` to it,
   so `ksor dev` is the one URL an agent uses in development. When not
   reachable, the dev command still serves the site; MCP is simply absent, and
   a line on stderr says so (exit code is unaffected — missing MCP is not a
   failure of the dev server).

5. Shut down cleanly on `SIGINT`/`SIGTERM`: kill the `next dev` child and the
   proxy listener, then exit `0`.

Exit codes:

- `0` — dev server started and stopped cleanly (governance may have flagged
  saves in between; that is a per-save event, not a process failure).
- `1` — a startup precondition failed (`ksor-instance-missing`,
  `ksor-dev-no-site`). The slug is the first line on stderr.
- `2` — not implemented in this ksor version (reserved; the command is
  implemented as of the ratified date above).
- `3` — environment failure: `next` not found, the site port already taken by
  another process, or the watcher could not be created.

`ksor dev` MUST NOT weaken any governance guarantee. The checks it runs are the
build's checks; a save that would fail `ksor build` is reported the same way.
The dev server writes no `build.lock.json` and publishes to no agent surface of
its own — it is a view, not a release.

## Why

Authoring a governed record today means running `ksor build` by hand after every
save, reading refusals off the terminal, and (for agent testing) starting
`ksor serve` in a second terminal and pointing the agent at a different port.
That is three commands and a mental context switch per iteration. The scaffold's
own `pnpm dev` runs only `next dev` and never re-checks governance, so an author
can ship a broken link to a reviewer without a word of warning. `ksor dev`
collapses the loop: one command, live site, live rules, one URL for humans and
agents alike.

## Design notes

- The dev server reuses `loadRecord` + `checkRecord` from
  `@panaversity/ksor-content/record` — the same functions `ksor build`,
  `ksor ingest` and the emitted `check.mjs` use. There is exactly one rule set;
  dev mode is `checkRecord(record, { mode: "check", ledgerBaselines })` with the
  ledger baseline taken from `build.lock.json` when present (so the
  departed-authority escape hatch works in dev too).
- `next dev` is spawned, not imported: the site is a separate Next.js app in
  `system/site`, and dev mode must survive a site that fails to compile (the
  author is mid-edit). The parent relays `next` stdout/stderr to its own.
- The watcher uses `node:fs` `watch` (recursive where the platform allows) over
  `knowledge/`, `.ksor/` and `instance.md`; debounced (≈80 ms) so a
  save-and-rename does not double-fire.
- MCP proxying is best-effort and opt-out: `KSOR_DEV_NO_MCP=1` disables the
  probe and proxy entirely for environments where a second server is unwanted.
- Port conflict on the site port is `3` (`ksor-dev-port-taken`), never a silent
  fallback to a random port — reproducibility matters more than convenience for
  a governance tool, and a surprise port is how an agent ends up talking to the
  wrong record.
