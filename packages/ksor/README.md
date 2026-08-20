# @panaversity/ksor

**The Knowledge System of Record for humans and AI agents.**

Knowledge you can govern. Answers you can trace. Boundaries agents can
respect. One governed source of markdown, published as a site people read
and an MCP surface AI agents query — with citations, and an honest refusal
when the corpus does not cover the question.

## Start

```bash
npx @panaversity/ksor init my-sor
cd my-sor
pnpm install
pnpm dev        # the site, live at http://localhost:3000
```

One command emits a complete governed project: the record (`knowledge/`,
plain CommonMark), a working documentation site with hot reload, offline
search and `llms.txt`, adopter CI, a dependency-free format checker
(`pnpm check`), and the instructions and skills any coding agent needs to
operate it. Everything emitted is yours (the templates are MIT-0), the
scaffold is deterministic and offline, and every refusal explains itself.

> **`0.x` status:** `init` works, and `serve` runs the MCP server over a built
> record (with `ingest`/`schema`/`calibrate`/`gc` — the climbed rung, needing
> Postgres and a provider key). Only `dev` and `build` are designed, not
> implemented — each prints an honest notice and exits `2` (inside a scaffolded
> project, `pnpm dev` / `pnpm build` cover local work).
> [`docs/status.md`](https://github.com/panaversity/ksor/blob/main/docs/status.md)
> and the released version number are authoritative for the exact released
> functionality.

Full concept, design goals, and project status:
**<https://github.com/panaversity/ksor>**

## Install

```bash
npm install -g @panaversity/ksor   # command installed: ksor
npx @panaversity/ksor              # or run without installing
```

## License

Apache-2.0 © Panaversity
