---
title: Upgrading a record to a newer ksor
status: draft
---

# Upgrading a record to a newer ksor

Your repository is yours. `ksor init` copied files into it and stopped owning
them the moment it did (decision 4), so upgrading is never something a release
does to you — it is `ksor migrate` **offering** a diff you read and apply.

Nothing here changes a byte until you pass `--write`.

## The four steps

```sh
# 1. take the new tool
pnpm add -w @panaversity/ksor@latest       # npm i / bun add — whichever scaffolded this

# 2. read what it would change
pnpm exec ksor migrate --instance instance.md --write-site

# 3. apply it
pnpm exec ksor migrate --instance instance.md --write-site --write --actor human:<your-id>

# 4. rebuild, and check
pnpm build && pnpm check
```

`--actor` is required for step 3 whenever the migration touches governance, and
the tool will not guess one: a ledger entry that names a person who was never
there is worse than no entry (decision 21). Use the identifier your
`.ksor/governance.yaml` already knows you by.

Run step 2 on a clean working tree. The diff is the review, and it is much
easier to read when nothing else is uncommitted.

## What `migrate` carries

|                                                 |                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `instance.md`                                   | the format bump and the keys that moved                                                     |
| `knowledge/**`                                  | frontmatter into the current profile — statuses, audiences, the trust block, instants       |
| `.ksor/takedowns.yaml`, `.ksor/governance.yaml` | the ledger and the policy, including denials that lived only in a database                  |
| `.gitignore`                                    | the entries a new release needs negated                                                     |
| `.agents/` and `.claude/` format-checker        | the emitted checker, so your own `pnpm check` and your CI agree with the tool               |
| root `package.json` **scripts**                 | scripts a release broke — a removed flag, a step that now needs `ksor build` in front of it |
| `system/site/**`                                | **only with `--write-site`** — every file of the site this release emits                    |

`--write-site` is the one to remember, because it is the only path by which a
security bump reaches an existing project: the site's `package.json` is where
`next`, `react` and the Fumadocs pins live, and nothing else updates them.

It is an **update, never a creation**. A record with no `system/site` of its own
is not given one.

### The site manifest is merged, not replaced

Every other file under `system/site` is reissued whole. `system/site/package.json`
is not, because it is a register with two authors: ksor owns the entries it
ships, you own everything else. So a dependency or script you added survives the
upgrade, and the pins ksor ships move to the new versions. An entry ksor no
longer ships is left alone rather than deleted — the tool cannot tell one it
retired from one you added.

## What `migrate` does not carry

These are yours, and no release touches them. Diff them against a fresh
`ksor init` in a scratch directory when a release note says they changed:

- `Dockerfile` and `.dockerignore`
- `vercel.json` (or whatever your host reads)
- `.github/workflows/validate.yml`
- `.env.example`
- `README.md`, `AGENTS.md`, `CLAUDE.md` at the repository root
- `pnpm-workspace.yaml` / `.npmrc` and any lockfile

```sh
(cd /tmp && npx @panaversity/ksor@latest init fresh)   # init takes a NAME, not a path
diff -ru /tmp/fresh/vercel.json ./vercel.json
```

## What refuses, and why that is the point

`migrate` stops rather than inventing. `ksor-migrate-underivable` names the one
thing it cannot know — a title, a description, a `generated.at`, or the actor
behind a takedown it found in a database — and tells you the flag or the edit
that supplies it. Two you will meet often:

- **A record that declares `database:`** refuses until `KSOR_DB_URL` is
  exported, because denials living only in that database would be republished by
  a migration that never read them. Export it, or remove `database:` if the
  record no longer has one.
- **`approved` documents become `draft`** unless `--approve-by <actor>` says who
  approves them in the same act. Approval is a human act and a migration is not
  a human.

## After it applies

`pnpm build` regenerates every index and rewrites `build.lock.json`; `pnpm check`
runs the record checker that shipped with the new tool. If you serve the record,
`ksor schema --apply` and then a full `pnpm refresh` publish a generation the new
door can read — and a calibrated `vector_floor` measured under an older serving
predicate must be re-measured with `ksor calibrate`, because a floor measured
against a different predicate is a declared-but-uncalibrated floor and the door
will refuse every search until it is replaced.
