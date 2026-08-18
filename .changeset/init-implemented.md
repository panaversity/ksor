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
