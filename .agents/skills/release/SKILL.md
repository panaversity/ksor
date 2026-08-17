---
name: release
description: The changesets deep workflow — when a PR needs a changeset, how to write one, pre-1.0 bump semantics, and how publishing actually happens. Use when preparing a PR that touches packages/ksor, when asked about versioning, or when a release is being cut. Never publish from a local machine.
metadata:
  version: "1.0.0"
---

# Releasing

## Does this PR need a changeset?

```sh
pnpm changeset status --since=origin/main
```

Every PR that changes `packages/ksor` behavior needs one. Exempt: docs-only changes and repo
tooling (CI, scripts, skills) that never enters the published tarball. CI enforces this on pull
requests.

## Writing one

```sh
pnpm changeset       # interactive; or add .changeset/<slug>.md by hand
```

Pre-1.0 semantics (constitution policy, stated in AGENTS.md):

- **patch** — the default for everything, including new capability.
- **minor** — only for a break in the public API contract (exports, exit codes, file formats).
- **major** — never pre-1.0.

Write the body for release-notes readers: what changed _for them_, not which files moved. Name
behavior, not diffs.

## How publishing happens

Merges to `main` run `.github/workflows/release.yml`: the changesets action either updates the
version PR or — when the version PR merges — builds and runs `pnpm changeset publish` with **npm
trusted publishing** (OIDC `id-token`, provenance attestation, no stored token). The changelog
section for the published version must exist in `packages/ksor/CHANGELOG.md` — changesets writes
it during versioning; never hand-edit a published entry.

Rules:

- Never run `changeset publish` or `npm publish` locally — releases come from CI with provenance,
  or not at all.
- Never cancel a running release workflow; the concurrency group queues instead.
- The version PR is reviewed like any PR: read the changelog it generates as a release-notes
  reader would.
