# Contributing

Thank you for your interest in KSoR.

## Before anything else

Read [`AGENTS.md`](AGENTS.md) — it is the working contract for humans and
coding agents alike, and this repo assumes coding agents perform much of the
mechanical work. Decisions live in [`AGENTS.md`](AGENTS.md) → Decisions; implementation status in
[`docs/status.md`](docs/status.md). Work that contradicts a settled decision
needs a conversation first, not a PR.

## Setup

```sh
git clone https://github.com/panaversity/ksor.git
cd ksor
pnpm install   # Node >= 24; pnpm is pinned via the packageManager field
```

## The gate

```sh
pnpm lint && pnpm fmt:ci && pnpm typecheck && pnpm guard && pnpm check:corpus \
  && pnpm test:unit && pnpm build && pnpm test:integration && pnpm publint
```

CI runs the same checks plus a changeset-presence gate on pull requests;
treat local runs as advisory and CI as the source of truth. Every PR touching `packages/ksor` needs a changeset
(`pnpm changeset` — patch by default pre-1.0).

## What helps most right now

The project is pre-1.0 with the verbs still landing. High-quality issues with
minimal reproductions are more valuable than unsolicited feature PRs — much of
the mechanical implementation is performed by agents against recorded plans,
so a precise issue often ships faster than a patch.

## Security

See [`SECURITY.md`](SECURITY.md) — do not report vulnerabilities in public
issues.
