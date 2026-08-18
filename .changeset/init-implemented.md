---
"@panaversity/ksor": minor
---

`ksor init` is implemented — the first working verb. One command emits a
complete governed knowledge project: the record (`knowledge/`), a working
Fumadocs site (`system/site/`, static export, hot reload, static search,
llms.txt), the agent kit (AGENTS.md constitution, CLAUDE.md pointer,
`.agents/skills` with byte-identical `.claude/skills` copies, Gemini
pointer), adopter CI, and a dependency-free format checker (`pnpm check`).
Deterministic (every emitted byte ships as template content, lockfile
included), atomic, offline. Refusals carry stable slugs with working
remedies; environment failures exit 3 with slugs, never raw stack traces.

The scaffold ships branded and self-explaining: the KSoR mark as the
default favicon, a real landing page led by the instance name with the
first document derived (never hardcoded), a deletable "Built with KSoR"
maker's mark, a README that explains every emitted file, and a governed
`order:` frontmatter key that drives the sidebar, `llms.txt`, and the
home page from one declaration. The site shell is replaceable behind a
four-clause surface contract, proven by a second (Docusaurus) shell and
a shell-agnostic conformance suite in the ksor repository.
