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

### What a document can do

`knowledge/` is CommonMark, and stays CommonMark — every affordance below is
syntax that other readers already handle, so a record renders honestly on
GitHub, in a plain editor, at `/md/` and in `llms-full.txt`.

| Write | The site renders |
| ----- | ---------------- |
| `> [!WARNING]` as a blockquote's first line | a callout, tinted in that kind's colour |
| ` ```bash tab="Claude Code" ` on consecutive fences | one tab group, the choice remembered |
| a fence with no language | a passage to reproduce, set for reading |

Nothing to author for the rest: a table's head reads as a head, a numbered list
counts in the record's accent, and a code block wider than the column gets a
button that unwraps it.

### Study attachments

A document may carry companions named after it, and the site renders each on
that document's page and nowhere else:

| File                    | What it is                                             |
| ----------------------- | ------------------------------------------------------ |
| `<doc>.summary.md`      | a précis, shown as a second tab beside the document     |
| `<doc>.slides.yaml`     | a presentation, after the document's introduction        |
| `<doc>.flashcards.yaml` | a recall deck, at the end                               |
| `<doc>.quiz.yaml`       | a multiple-choice check, at the end                     |

Ask your coding agent — `make slides for knowledge/expenses/approvals.md`, or
`summarise knowledge/expenses/approvals.md` — and the `make-slides` and
`make-summary` skills write the attachment from the document, check every claim
and number back against it, and report what they left out because the document
did not support it. A summary is checked section by section, because one that
covers the opening and trails off leaves a reader believing they have the whole
document.

An attachment is **part of its document**: no URL, no sidebar row, no
`llms.txt` line, and no id an agent can cite. It takes its `visibility:` and
any takedown from its parent, so restricting the document restricts them all.
A quiz whose answers are guessable is refused by the build, and because ingest
creates no node for an attachment, a quiz's answer key can never reach the
agent surface at all.

The architecture: **one governed record** — Markdown in the KSoR Profile of
the Open Knowledge Format (OKF) — behind **one governance boundary**,
projected through open standards: MCP for agents, `llms.txt` for AI
discovery, OAuth/OIDC for identity, SLSA/Sigstore for publication integrity,
OpenTelemetry for observability.

Full concept, design goals, and project status:
**<https://github.com/panaversity/ksor>**

## Install

```bash
npm install -g @panaversity/ksor   # command installed: ksor
npx @panaversity/ksor              # or run without installing
```

## License

Apache-2.0 © Panaversity
