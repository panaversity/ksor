---
name: release
description: The release deep-workflow and runbook — how the changesets airlock works (main is releasable, never auto-released), how to test the real artifact before publishing, snapshot releases, and the diagnosis for every way the Release workflow goes red (org PR-permission, npm trusted publisher). Use when a Release run fails, when a Version Packages PR appears, when asked how/when ksor publishes, or when testing a build before release. Baseline policy lives in AGENTS.md → Changesets; this goes deeper.
metadata:
  version: "2.1.0"
  origin: recreated 2026-08-18 with the operational scars from the first live release (the 1.x skill was cut as an AGENTS.md duplicate; this one is not)
---

# Releasing

## The airlock — main is always releasable, never auto-released

```text
feature PR ──CI gate + review──▶ main            nothing publishes; a changeset
                                   │             (intent file) is recorded
                                   ▼
                    "Version Packages" PR        the staging area — accumulates
                                   │             every pending changeset; can sit
                                   │             open for a month while work lands
                     a human merges it           the ONLY action that releases
                                   ▼
                    release job re-runs the      gate red = no publish
                    FULL gate, then publishes
                    with provenance (OIDC)
```

Release timing is controlled entirely by when the Version Packages PR is
merged. Review it as a release-notes reader: the changelog it generates is
what adopters will read.

## Testing before publish

Three layers, all before anything reaches the registry:

1. **The PR gate** — including the tarball test, which asserts the _shipped
   bytes_ (dist entries, docs, LICENSE, NOTICE, CHANGELOG in the pack).
2. **A live walk of the real artifact** (mandatory for CLI changes, per
   $implement-spec): `pnpm pack` in `packages/ksor`, install the tarball into
   a fresh temp dir, run the actual binary — help exit 0, unknown verb exit 1
   with slug, designed verb exit 2, bundled docs present.
3. **The Version PR review** — the human sign-off. Since the org toggle was
   enabled (2026-08-21) this PR is opened by `github-actions[bot]`, and its CI
   **waits for approval**: the run sits in `action_required` with zero jobs, so
   `gh pr checks` answers "no checks reported on the 'changeset-release/main'
   branch". That reads like a repo with no CI and is not — approve it and the
   full eight-job gate runs (it passed on #48). Approve from the PR's Checks tab
   or with `gh api -X POST repos/panaversity/ksor/actions/runs/<id>/approve`,
   and do it before merging: after the merge the release job re-runs the whole
   gate anyway, but then a failure costs you a red release instead of a red PR.

To test _from the registry_ without touching `latest` (only when external
testers need an installable build): changesets **snapshot releases** —
`changeset version --snapshot dev && changeset publish --tag snapshot` — CI
only, never from a laptop. Versions look like `0.0.1-dev-20260818…` and are
invisible to normal `npm install`.

## Runbook — when the Release workflow goes red

**"GitHub Actions is not permitted to create or approve pull requests"**
(found live 2026-08-18, **fixed 2026-08-21** — the owner enabled the org toggle,
and the workflow opened PR #48 by itself on the first release after; every
release from 0.0.7 to 0.0.11 was hand-rescued). If it returns, the toggle went
back off: check `gh api repos/panaversity/ksor/actions/permissions/workflow`,
which reports `can_approve_pull_request_reviews: true` when it is on. The run is
NOT wasted either way — it versions and **pushes** `changeset-release/main`
before dying, so the rescue is to open the PR by hand from that exact branch
(`gh pr create --base main --head changeset-release/main --title "Version Packages"`).
Permanent fix: an org admin enables the toggle (Org Settings → Actions →
General → Workflow permissions); org-level blocks the repo-level one.

**Publish step fails with an OIDC/auth error (E403/404)**: the npm
**Trusted Publisher** is not configured. Settings on npmjs.com for
`@panaversity/ksor`: GitHub Actions · repo `panaversity/ksor` · workflow
`release.yml` · environment blank · **simple publish only — leave staged
publish off** (nothing in the pipeline stages; grant capabilities with the
machinery that uses them). The failed publish is harmless: fix the setting,
re-run the failed job.

**Gate step fails in the release job**: main regressed after the last PR ran
CI. The Version PR never triggers `pull_request` CI — it is opened by a bot
token — which is exactly why the release job re-runs the full gate, and why
this is the step that catches it. Fix on main via a normal PR, then re-run.

## Hard rules (one-liners; AGENTS.md is the authority)

- Publishing happens **only** in CI. Never `changeset publish` / `npm publish`
  from a machine — releases carry provenance or they don't ship.
- Never cancel a running Release; the concurrency group queues.
- Every PR changing anything under `packages/ksor` needs a changeset —
  bundled docs included. Check: `pnpm changeset status --since=origin/main`.
