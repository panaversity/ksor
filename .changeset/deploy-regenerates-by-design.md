---
"@panaversity/ksor": patch
---

**Document what a deploy actually does to your lock.** `vercel.json` builds the
site with `pnpm build`, which runs `ksor build` first — so the host regenerates
every `index.md` and `build.lock.json` before building. That has two
consequences worth knowing, and neither was written down: you can deploy
without ever running `ksor build` yourself, and the `build.lock.json` in your
repository is not necessarily the one that shipped.

Nothing changes in behaviour. The record checker still runs on the deploy, so a
record that breaks the profile still fails there, and the `build_id` that did
ship is stamped into the deployed `llms.txt`.

`docs/deploying.md` now also shows the stricter posture for adopters who want
the deployed build reviewed before it ships — `buildCommand: "pnpm -C
system/site build"`, which refuses `ksor-lock-missing` or `ksor-lock-stale`
until someone runs `ksor build` and commits it. That is one line in your own
`vercel.json`; ksor ships no flag for it.
