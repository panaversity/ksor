---
issue: recorded via the init-spec PR
status: accepted
last_updated: 2026-08-18
---

# The scaffold structure — locked

The design record behind `specs/ksor/init/spec.md`: what `ksor init` emits,
why, and the unknown-unknowns hunt (5 adversarial agents, 55 findings, 34
concerns verified fine) that priced the alternatives before the owner locked
the choice. Where this document and the spec disagree, the spec wins.

## The three candidates, and the choice

1. **Root workspace + system roof** — **chosen.** `package.json`,
   `pnpm-workspace.yaml`, and the lockfile live at the repo root (the owner's
   call: manifests at root beat a permanent algorithm for hiding them);
   `knowledge/` stays at root as the record; ALL code lives under `system/`
   (site now; gateways/packages as earned — growth happens inside, never
   beside). Re-enters every toolchain default and agents' training data:
   `npx ksor`, `pnpm dev`, deploy auto-detection, and bundler root inference
   all just work.
2. **Nested workspace** (workspace root inside `system/`) — rejected: a pure
   document-tree root, priced at six permanent tooling compensations
   (bundler-root pinning, CLI root-discovery, deploy overrides, agent
   retraining) for purity at a level where the promise doesn't live — the
   real purity boundary is `knowledge/`, identical in both layouts.
3. **Conventional docs-site layout** — rejected: maximal defaults, but the
   repo reads as a website that contains knowledge instead of a record served
   by a system, and growth pollutes the root.

## The shell: one in core, choice via contract

Fumadocs (Next.js + shadcn primitives) is the **single reference shell**,
replacing Docusaurus natively before v1 traffic. No shell selector at init —
"one obvious way": a flag would fork every skill, directive renderer, test,
and deploy recipe, and agents sample flags randomly. Choice arrives through
three layers that already exist: the **surface contract** (any site must
render `knowledge/`, emit `llms.txt` + per-page `.md` artifacts, pass the
browser smoke, contain no authored content — the shell is a slot);
**ownership** (adopters own `system/site` and may swap it); and the
**registry** (alternative shells distribute as copy-into-repo items later).
The predecessor's Docusaurus shell is reference material for porting
components and tokens, not a shipped option.

_Evidence appended 2026-08-18 — the side-by-side experiment:_ both shells
were stood up locally over the same three-document corpus. Docusaurus (vsor
shell): ~10 min, zero source edits — its `VSOR_KNOWLEDGE_DIR` seam is
genuinely well-engineered. Fumadocs (official starter): ~18 min, four small
edits — friction was obtaining a coherent starter (its create-CLI cannot run
non-interactively and git tags lag npm; both moot for ksor, whose template
ships pre-built and version-pinned) — after which governance frontmatter
rendered untouched and `llms.txt` listed every page for zero work. The owner
compared both UIs directly and judged Fumadocs better and more powerful; the
enterprise lens (SSO/middleware capability for private corpora, first-party
agent surface, extensibility as a normal Next app, platform velocity)
concurred. Decision 9 stands validated by research, by eyes, and by
measurement.

## Resolutions locked by the hunt (the ones that were live grenades)

- **No symlinks anywhere in scaffold output** — Windows git materializes
  them as junk text. `CLAUDE.md` is a one-line `@AGENTS.md` file;
  `.claude/skills/` holds real copies, byte-identity machine-checked;
  `.gemini/settings.json` points Gemini CLI at AGENTS.md.
- **`.gitattributes` with `*.md text eol=lf`** (instance.md included) —
  `autocrlf` would make identical commits hash differently on Windows,
  poisoning future provenance. Build also normalizes CRLF→LF before hashing.
- **`knowledge/` is CommonMark `.md` — never `.mdx`.** Components render via
  directives (`:::quiz`) that degrade to readable text; MDX and `meta.json`
  are banned from the record (framework grammar breaks the walk-away
  promise). Sidebar order is a governed frontmatter key the site translates.
- **Closed frontmatter set** (fail-closed, like instance.md): title,
  description, status, owner, provenance, effective, superseded,
  superseded_by, order. Authored `id:`/`name:` remain banned.
- **Identity rules enforced at the corpus**: Windows-safe filenames, no
  case-insensitive collisions, no `foo.md` + `foo/index.md` route collisions,
  no parenthesized directories. **MCP URI scheme locked now** — citations pin
  it forever: `ksor://<instance-name>/<path>`.
- **Assets live in `knowledge/` beside their documents**, relative links
  only; links may never escape the record. `images.unoptimized` in the
  emitted next.config (static export would otherwise hard-fail on the first
  screenshot); `turbopack.root`/`outputFileTracingRoot` pinned to the repo
  root (never inference — parent lockfiles mislead it).
- **The template ships its lockfile as bytes** — resolving no-network +
  determinism + the test-tier-installs-the-artifact-tree rule in one move.
  Scaffolded manifests carry exact pins, a `packageManager` pin,
  `minimumReleaseAge`, and an empty build-scripts allowlist.
- **Governance records are governed markdown**: approvals/policies (and
  later eval gold) are doc types inside `knowledge/`; the governance level is
  a corpus query. The root never gains a `governance/` or `evals/` directory
  — the root set is closed at birth, `build.lock.json` (committed, written
  only by `ksor build`) named as its one later arrival.
- **The site never contains authored content** — top scaffolded critical
  rule plus a machine check; the likeliest corruption is an agent "adding a
  page" inside `system/site`.
- **Adopter CI is scaffolded** (`.github/workflows/validate.yml`, SHA-pinned)
  — governed rules that nothing runs are discipline, not governance.
- **Templates are MIT-0** (owner-ratified 2026-08-18): init's output lands in
  the adopter's proprietary repo free of attribution obligations, and init
  never emits a LICENSE file into a repo whose knowledge is theirs.
- **Verbs re-scoped**: the site works via plain `pnpm dev` with zero ksor
  runtime (ownership makes it self-sufficient); `ksor dev` survives only as
  a passthrough; `ksor build` is governance-only (validation, provenance,
  corpus artifact, the `.md`/llms build artifacts).
- Init detects ancestor `instance.md` (`error: nested` — refuse) and warns
  when a parent pnpm workspace glob would swallow the project; `ksor.
scaffolded` in instance.md stamps the emitting version for the future
  upgrade-diff story; provenance for binary sources = external location +
  content hash (a self-contained `sources/` home is deferred, reason
  recorded).

## Deferred with reasons

Netlify/Vercel deploy recipes (deploy skill later; root workspace restored
the platform defaults), non-image asset copying (format check rejects until
`ksor build` owns it), the 5k-doc scale claim (measure with a synthetic
corpus in the site slice before claiming — never estimate), i18n,
multi-corpus mounting (second corpus = second project; the URI scheme keeps
composition clean).
