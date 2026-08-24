---
title: ksor documentation
status: draft
---

# ksor documentation

These docs ship inside the npm package (`node_modules/@panaversity/ksor/docs/`)
so that coding agents read documentation matching the **installed** version
instead of their training memory. The corpus grows with each implemented verb.

## What exists in this build

- **`ksor init <name>` works.** One command emits a complete governed
  project: the record (`knowledge/`, CommonMark only), a working
  documentation site (`system/site/`, Next.js + Fumadocs — static export,
  hot reload, static search, `llms.txt`), the agent kit (`AGENTS.md`,
  a `CLAUDE.md` pointer, skills under `.agents/skills/` with byte-identical
  `.claude/skills/` copies), adopter CI, and a dependency-free format
  checker (`pnpm check`). `ksor init .` scaffolds into an empty directory
  whose name passes the project-name grammar. Everything emitted belongs to
  the adopter (templates are MIT-0). The scaffold is emitted for the package
  manager that ran init — `npx …` yields an npm project, `bunx …` a bun one,
  `pnpm dlx …` (or a bare `ksor`) the pnpm shape — so the commands below use
  the pnpm spelling and your own scaffold's README speaks your manager.
- Inside a scaffolded project, `pnpm install && pnpm dev` serves the record
  at `http://localhost:3000`; `pnpm build` writes a fully static export to
  `system/site/out/`. `KSOR_BASE_PATH=/repo pnpm build` targets sub-path
  hosting.
- `ksor serve` runs the MCP server over a built record — the climbed rung,
  needing Postgres and a provider key — alongside the write plane that keeps
  the record current: `ksor schema` (provision or migrate the database),
  `ksor grant` (authorize a tenant for ingest), `ksor ingest` (build and publish
  a generation), `ksor takedown` (withdraw a document from EVERY surface, and
  export the manifest the site build reads), `ksor calibrate` (measure the
  abstention floor) and `ksor gc` (reap retired generations). Only `ksor dev` and `ksor build` remain designed, not
  implemented: each prints an honest notice and exits `2`.
  - **[tool-surface.md](./tool-surface.md)** — shaping what agents see.
    `system/gateways/content.ts` is emitted, adopter-owned and deletable; it
    decides tool names, what the record says it covers, and how much of the
    caller's context an answer costs. Includes the measurements.
  - **[deploying.md](./deploying.md)** — getting both surfaces onto a host. The
    scaffold emits a `Dockerfile` that names no vendor, and a `vercel.json` that
    points at it to put the site and the MCP door behind one domain. Includes
    what a cold start costs, measured.
  - **[ingesting.md](./ingesting.md)** — publishing the record and keeping it
    current. Serving does not publish, so a first deploy with no ingest serves
    an empty record; this is the page that explains why, where ingest belongs
    (never inside the container), and how the abstention gate gets turned on.
  - **[authorization.md](./authorization.md)** — putting the record behind an
    authorization server, with worked recipes for two of them, executed rather
    than written. `ksor serve` refuses to boot unauthenticated on a public bind,
    so this is the last step of a deployment, not an optional hardening pass.
- Exit codes are a contract: `1` refused (first stderr line is a stable
  slug such as `error: bad-name`, followed by a remedy), `2` designed but
  not implemented, `3` the environment cannot run ksor
  (`error: unsupported-platform`, `error: broken-install`,
  `error: environment`).
- The package root exports the CLI contract: `exitCodes`, `verbs`, and
  `resolveCommand`.

## For the agent operating a scaffolded project

Read the scaffold's own `AGENTS.md` first — it is the working contract.
Knowledge lives in `knowledge/` and never inside the site; frontmatter uses
a closed key set (`title` + `status` required); `pnpm check` explains any
violation and how to fix it. Reading order is the governed `order:`
frontmatter key — never `meta.json` or `sidebar_position` — and it drives
every surface: the sidebar, `llms.txt`, and the MCP `outline` tool. If the
instance declares an `audiences:` model, documents may carry a
`visibility:` key and per-audience builds (`KSOR_AUDIENCE=<tier> pnpm
build`) stage only what that tier may see — publication, not authorship:
anyone who can clone reads everything. The site shell
at `system/site/` is replaceable behind a five-clause surface contract — the
shell is a slot, and the contract (render the record, `llms.txt`, per-page md
artifacts, browser smoke, no authored content) is what a replacement must meet.

## Where truth lives

- [`docs/status.md`](https://github.com/panaversity/ksor/blob/main/docs/status.md)
  in the repository is authoritative for implemented functionality.
- The repository [`README`](https://github.com/panaversity/ksor#readme) is the
  concept document, not a capability claim.
