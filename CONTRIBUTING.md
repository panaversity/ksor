# Contributing

Thank you for your interest in KSoR.

## Before anything else

Read [`AGENTS.md`](AGENTS.md) — it is the working contract for humans and
coding agents alike, and this repo assumes coding agents perform much of the
mechanical work. Decisions live in [`AGENTS.md`](AGENTS.md) → Decisions;
implementation status in [`docs/status.md`](docs/status.md). Work that
contradicts a settled decision needs a conversation first, not a PR.

## Setup

```sh
git clone https://github.com/panaversity/ksor.git
cd ksor
pnpm install   # Node >= 24; pnpm is pinned via the packageManager field
```

## The gate

```sh
pnpm lint:ci && pnpm fmt:ci && pnpm typecheck && pnpm guard && pnpm check:corpus \
  && pnpm test:unit && pnpm build && pnpm test:integration && pnpm publint
```

Treat local runs as advisory and CI as the source of truth. The database tier
(`pnpm test:db`) needs Postgres with pgvector — set `KSOR_DB_URL`; without it
those suites skip rather than fail.

## Changesets — how a change becomes a release note

Every PR that changes **anything under `packages/`** needs a changeset. Not
only the published package: the kernel packages are `private: true`, but they
are **bundled into** `@panaversity/ksor` (AGENTS.md decision 12), so editing
them changes what adopters install. CI enforces both halves.

```sh
pnpm changeset                              # pick @panaversity/ksor, pick a bump, write the note
pnpm changeset status --since=origin/main   # what would be released
```

The changeset always names **`@panaversity/ksor`** — the thing actually
published — even when the code you touched lives in `packages/content` or
another private package. A note attached to a private package would land in a
changelog nobody installs.

**Which bump.** `patch` by default while pre-1.0; `minor` only for a break in
the public API. Version is a compatibility signal, not a marketing one — the
release that added the entire MCP surface was a patch.

**Write the body for release-notes readers**, not for reviewers: what changed
for someone using ksor, and what they should do about it. Repo docs and
tooling outside `packages/` are exempt.

Genuinely no user-visible effect? `pnpm changeset add --empty` records that
judgement explicitly, which is different from forgetting.

## How a release actually happens

Nobody publishes from a laptop. `release.yml` runs on every push to `main`
and does one of two things depending on whether changesets are pending:

1. **You merge a feature PR.** Changesets are pending, so the action opens a
   **"Version Packages" PR**: it applies the bumps, rewrites `CHANGELOG.md`
   from the changeset bodies, and deletes the consumed changesets. **Nothing
   is published.** Merging your PR is not a release.
2. **Someone merges the Version PR.** No changesets remain, so the action
   **publishes to npm** — after running the full gate _in the same job_,
   because the Version PR is opened by `GITHUB_TOKEN` and so does not trigger
   the normal PR CI. No artifact ships untested.

Publishing uses **npm trusted publishing** (OIDC): there is no `NPM_TOKEN` in
this repository, and npm attaches provenance, so anyone can verify a release
was built by this workflow from this commit.

Two rules with teeth:

- **Never run `changeset publish` or `npm publish` locally.**
- **Never cancel a running release.** The concurrency group queues them
  deliberately; a cancelled publish cannot be un-published.

## Specs, and when you need one

A change gets a one-page spec at `specs/<area>/<feature>/spec.md` only when it
alters a public surface (CLI verbs, scaffold contents, MCP tools,
`build.lock.json`, response envelopes), crosses a package boundary, is
expensive to reverse, or will be built unattended by an agent. Where a spec
and the code disagree, **the code wins** and the spec is corrected in the same
commit.

## Tests

Pick the tightest tier that can express the assertion:

| Tier             | File                    | May use                             |
| ---------------- | ----------------------- | ----------------------------------- |
| unit             | `*.test.ts`             | pure functions; no fs/network/spawn |
| integration      | `*.integration.test.ts` | built artifacts, subprocesses, tmp  |
| database (gated) | `*.db.test.ts`          | real Postgres via `KSOR_DB_URL`     |

Three rules paid for with shipped defects: **assert on shipped bytes and
computed values, not behavior alone**; **the test tier must install the same
tree the artifact installs**; **a failing assertion must print the value it
actually saw**.

A regression test should fail if its fix is reverted — check that, rather than
assuming it. Tests that cannot detect their own subject have shipped here
before.

## What helps most right now

The project is pre-1.0 with the verbs still landing. High-quality issues with
minimal reproductions are more valuable than unsolicited feature PRs — much of
the mechanical implementation is performed by agents against recorded plans,
so a precise issue often ships faster than a patch.

## Security

See [`SECURITY.md`](SECURITY.md) — do not report vulnerabilities in public
issues.
