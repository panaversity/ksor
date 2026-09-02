# @panaversity/ksor

**The Knowledge System of Record for humans and AI agents.**

Knowledge you can govern. Answers you can trace. Boundaries agents can
respect. One governed source of markdown, published as a site people read
and an MCP surface AI agents query — with citations, and an honest refusal
when the corpus does not cover the question.

## Start

```bash
npx @panaversity/ksor@latest init my-sor
cd my-sor
npm install
npm run dev     # the site, live at http://localhost:3000
```

Then write a document and publish it:

```console
$ npx ksor build
ksor build: 6 document(s), 5 admitted to a machine surface
```

(`npx` emits an npm project; `pnpm dlx` or `bunx` emit that manager's, and
the README it writes speaks that manager throughout.)

**Six documents, five admitted.** The one you just wrote is a `draft`, so it
reaches nothing an AI agent reads — not `llms.txt`, not the markdown twins —
until a human approves it. Approve it and the count moves. That is the whole
product, and it costs nothing: no database, no API key, no account.

Climb one rung and an agent asks the record a question. The answer carries
where it came from:

```json
"provenance": { "stable_id": "knowledge/refund-policy", "generation": 1 },
"governance": { "status": "stable", "approval": { "by": "human:you" } }
```

…and a question the record does not cover is declined rather than guessed at:

```json
{ "ok": false, "abstained": true, "gate": { "floor": 0.622 } }
```

**[Hello world](https://github.com/panaversity/ksor/blob/main/docs/tutorials/01-hello-world.md)**
walks all of that in about fifteen minutes. Every command and output in it was
run and pasted as it appeared. The envelopes above show the SHAPE of an answer
and a refusal; the refusal needs a calibrated floor, which hello world defers
to its own tutorial.

The four so far, in reading order — pick by what you want from it:

| | read this if |
| --- | --- |
| [00 · Introduction](https://github.com/panaversity/ksor/blob/main/docs/tutorials/00-introduction-to-ksor.md) | you want to understand why this exists — no technical background needed |
| [01 · Hello world](https://github.com/panaversity/ksor/blob/main/docs/tutorials/01-hello-world.md) | you want to see it work in fifteen minutes — Node only, nothing else |
| [02 · Make it yours](https://github.com/panaversity/ksor/blob/main/docs/tutorials/02-make-it-yours.md) | you finished hello world and want a record that is only yours — a file in, a person's knowledge in, the samples out |
| [03 · Governance in practice](https://github.com/panaversity/ksor/blob/main/docs/tutorials/03-governance-in-practice.md) | you have a record of your own and want to govern it — a second audience, a review, an effective date, a takedown and the refusals that fire |

One command emits a complete governed project: the record (`knowledge/`,
plain CommonMark), a working documentation site with hot reload, offline
search and `llms.txt`, adopter CI, a dependency-free format checker
(`pnpm check`), and the instructions and skills any coding agent needs to
operate it. Everything emitted is yours (the templates are MIT-0), the
scaffold is deterministic and offline, and every refusal explains itself.

> **`0.x` status:** `init` works, `build` checks the record and writes its
> lock, `migrate` rewrites a pre-profile record into the profile, and `serve`
> runs the MCP server over a built record (with `ingest`/`schema`/`calibrate`/
> `gc` — the climbed rung, needing Postgres and a provider key). Only `dev` is
> designed, not implemented — it prints an honest notice and exits `2` (inside
> a scaffolded project, `pnpm dev` covers local work), as does
> `build --bundles`.
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

Companions are ordinary files beside the document. Write them yourself or ask
your coding agent for one, and hold it to the rule the emitted AGENTS.md
states: a companion may only say what its document says.

An attachment is **part of its document**: no URL, no sidebar row, no
`llms.txt` line, and no id an agent can cite. It takes its audience and any
takedown from its parent, so restricting the document restricts them all. A
`<doc>.summary.md` carries exactly `type: Summary` and nothing else — a marker,
never governance of its own.
A quiz whose answers are guessable is refused by the build, and because ingest
creates no node for an attachment, a quiz's answer key can never reach the
agent surface at all.

The architecture: **one governed record** — Markdown in the KSoR Profile of
the Open Knowledge Format (OKF) — behind **one governance boundary**,
projected through open standards: MCP for agents, `llms.txt` for AI
discovery, and OAuth/OIDC for identity. Two more name which standard owns a
boundary rather than a surface that fully runs today: SLSA/Sigstore, which
attests this npm package through npm provenance but does not yet sign a
record's own `build.lock.json`, and OpenTelemetry, which emits nothing yet.

Full concept, design goals, and project status:
**<https://github.com/panaversity/ksor>**

## Install

```bash
npm install -g @panaversity/ksor   # command installed: ksor
npx @panaversity/ksor@latest       # or run without installing
```

## License

Apache-2.0 © Panaversity
