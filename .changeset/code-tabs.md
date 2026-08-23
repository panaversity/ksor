---
"@panaversity/ksor": patch
---

One instruction per tool, as tabs.

A document that has to say the same thing two ways — one command for one agent,
another for another — can now put each in its own fenced block and give the
fence a `tab`:

````markdown
```bash tab="Claude Code" tab-group="agent"
curl -fsSL https://claude.ai/install.sh | bash
```

```bash tab="OpenCode" tab-group="agent"
curl -fsSL https://opencode.ai/install | bash
```
````

Consecutive blocks declaring a `tab` become one tab group. **This is still
CommonMark** — a fence's info string is free text, so any other markdown reader
shows both blocks one after another, correct and readable, just without the
picker. Nothing framework-shaped enters `knowledge/`.

`tab-group` is the part worth knowing: blocks sharing a group name switch
together across the whole page, and the choice is remembered for the reader's
next visit. A document with ten tabbed sections is one decision rather than ten.

A tool the site recognises takes its own colour and mark on its tab — Claude
Code and OpenCode ship known. Anything else renders in the site's own accent,
which is the right default for tabs that are `npm`/`pnpm` or `US`/`EU`. The list
lives in `system/site/app/global.css` and is yours to extend or delete.
