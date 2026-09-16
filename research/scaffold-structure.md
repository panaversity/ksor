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

## Question

What is the optimal scaffold structure for `ksor init` that balances ease of use, adherence to KSoR principles, and future extensibility, as informed by adversarial review and analysis of alternative approaches?

## Evidence

The scaffold structure for `ksor init` was determined through a design record behind `specs/ksor/init/spec.md` and an "unknown-unknowns hunt" involving 5 adversarial agents, which yielded 55 findings and verified 34 concerns.

**Three Candidate Structures Analyzed:**

1.  **Root workspace + system roof (Chosen)**: `package.json`, `pnpm-workspace.yaml`, and lockfile at repo root. `knowledge/` at root. All code under `system/`. This re-enters toolchain defaults and agent training data, making `npx ksor`, `pnpm dev`, deploy auto-detection, and bundler root inference "just work."
2.  **Nested workspace (Rejected)**: Workspace root inside `system/`. Rejected due to six permanent tooling compensations needed for a purity boundary that already exists at `knowledge/`.
3.  **Conventional docs-site layout (Rejected)**: Rejected because the repo reads as a website containing knowledge rather than a record served by a system, and leads to root pollution.

**Shell Choice Evidence:**

- Fumadocs (Next.js + shadcn primitives) is the **single reference shell**, replacing Docusaurus natively. This decision avoids forking skills, directive renderers, tests, and deploy recipes.
- Choice is mediated by: a **surface contract** (any site must render `knowledge/`, emit `llms.txt` + per-page `.md`, pass browser smoke, contain no authored content); **ownership** (adopters own `system/site` and may swap); and the **registry** (alternative shells distribute as copy-into-repo items).
- **Side-by-side experiment (2026-08-18)**: Docusaurus (vsor shell) took ~10 min, zero source edits. Fumadocs (official starter) took ~18 min, four small edits (due to starter friction). Owner judged Fumadocs better and more powerful, and enterprise lens (SSO/middleware, agent surface, Next app extensibility, platform velocity) concurred. Decision 9 (Next.js + Fumadocs + shadcn as single core shell) was validated.

**Resolutions Locked by Adversarial Hunt (Live Grenades):**

- **No symlinks**: Anywhere in scaffold output; `CLAUDE.md` is a one-line `@AGENTS.md` file; `.claude/skills/` holds real copies.
- **`.gitattributes`**: With `*.md text eol=lf` to prevent inconsistent hashes on Windows.
- **`knowledge/` is CommonMark `.md`**: Never `.mdx`. Components render via directives that degrade to readable text; MDX and `meta.json` banned.
- **Closed frontmatter set**: `title`, `description`, `status`, `owner`, `provenance`, `effective`, `superseded`, `superseded_by`, `order`. Authored `id:`/`name:` banned.
- **Identity rules at corpus**: Windows-safe filenames, no case-insensitive collisions, no `foo.md` + `foo/index.md` route collisions, no parenthesized directories. MCP URI scheme locked: `ksor://<instance-name>/<path>`.
- **Assets in `knowledge/`**: Beside documents, relative links only, never escape record. `images.unoptimized` in `next.config`. `turbopack.root`/`outputFileTracingRoot` pinned to repo root.
- **Template ships lockfile**: For no-network + determinism + `test-tier-installs-artifact-tree` rule. Scaffolded manifests have exact pins, a `packageManager` pin, `minimumReleaseAge`, empty build-scripts allowlist.
- **Governance records as governed markdown**: Approvals/policies as doc types inside `knowledge/`; governance level as corpus query. Root never gains a `governance/` or `evals/`. `build.lock.json` is the one later arrival.
- **Site never contains authored content**: Top scaffolded critical rule + machine check.
- **Adopter CI scaffolded**: `.github/workflows/validate.yml`, SHA-pinned.
- **Templates are MIT-0**: Output free of attribution obligations.
- **Verbs re-scoped**: Site works via `pnpm dev` (self-sufficient); `ksor dev` is passthrough; `ksor build` is governance-only.
- Init detects ancestor `instance.md` (`error: nested` — refuse) and warns on parent pnpm workspace glob. `ksor.scaffolded` in `instance.md` stamps emitting version. Provenance for binary sources = external location + content hash.

## Decision

The scaffold structure for `ksor init` is locked as **Root workspace + system roof**. This design places `package.json`, `pnpm-workspace.yaml`, and the lockfile at the repository root, with `knowledge/` also at the root and all code residing under `system/`. This approach ensures compatibility with existing toolchain defaults and agents' training data.

Fumadocs (Next.js + shadcn primitives) is adopted as the **single reference shell**, replacing Docusaurus. This decision is validated by direct comparison and enterprise considerations, and avoids the complexity of a shell selector at `init`. Adopters retain ownership of `system/site` and can swap shells via a registry of copy-into-repo items.

Numerous critical resolutions were locked by adversarial review to ensure the integrity and governance of the scaffolded project:

- **No symlinks** in scaffold output; `CLAUDE.md` is a one-line `@AGENTS.md`.
- **`.gitattributes`** with `*.md text eol=lf` for consistent line endings.
- `knowledge/` **MUST be CommonMark `.md`**, explicitly banning `.mdx` and `meta.json`.
- A **closed frontmatter set** is enforced, banning `id:`/`name:`.
- **Identity rules** (Windows-safe filenames, no case-insensitive/route collisions, no parenthesized directories) are enforced at the corpus level. MCP URI scheme `ksor://<instance-name>/<path>` is locked.
- **Assets** reside in `knowledge/` beside their documents, with relative links only, and `images.unoptimized` in `next.config`.
- The **template ships its lockfile** as bytes, and scaffolded manifests use exact pins and `minimumReleaseAge`.
- **Governance records** (approvals/policies) are `doc types` inside `knowledge/`; the root avoids `governance/` or `evals/` directories.
- The site **never contains authored content**.
- **Adopter CI** is scaffolded (`.github/workflows/validate.yml`).
- **Templates are MIT-0 licensed**, with no generated LICENSE file.
- **Verbs are re-scoped**: `pnpm dev` for the site (self-sufficient), `ksor dev` as passthrough, `ksor build` for governance-only.
- `init` **detects ancestor `instance.md`** (`error: nested`) and warns about parent pnpm workspace globs. `ksor.scaffolded` stamps the emitting version. Provenance for binary sources = external location + content hash.

## Rejected

- **Nested workspace layout**: Rejected due to requiring six permanent tooling compensations for a purity boundary already provided by `knowledge/` at the root.
- **Conventional docs-site layout**: Rejected because it makes the repo appear as a website containing knowledge rather than a governed record, and leads to root pollution.
- **Docusaurus as the core shell**: The initial recommendation for Docusaurus was _rejected_ and superseded by Decision 9, which adopted Next.js + Fumadocs + shadcn as the single core shell.
- **Shell selector at `init`**: Rejected to avoid forking every skill, directive renderer, test, and deploy recipe, and because agents sample flags randomly.
- **Symlinks in scaffold output**: Explicitly rejected due to Windows git materializing them as junk text.
- **`.mdx` or `meta.json` in `knowledge/`**: Banned from the record because their framework grammar breaks the walk-away promise.
- **Authored `id:`/`name:` fields**: Banned, as the path itself defines identity.
- **Inferred `turbopack.root`/`outputFileTracingRoot`**: Rejected in favor of pinning to the repo root to prevent parent lockfiles from misleading it.
- **Non-image asset copying**: Deferred (format check rejects until `ksor build` owns it), effectively rejected for initial implementation.
- **`Drizzle-orm`**: Deferred (implicitly rejected, as the plan focuses on raw `pg` for migrations).
- **`5k-doc scale claim`**: Deferred (measure with a synthetic corpus before claiming, never estimate), effectively rejected as an unverified claim.
- **i18n**: Deferred with reasons.
- **Multi-corpus mounting**: Deferred (second corpus = second project), effectively rejected as a composition mechanism.
- **Proprietary database or service for the record**: The commitment to `knowledge/` as CommonMark, maintained in version control, implies a rejection of proprietary storage for the record itself.
- **`ksor dev` as a full verb/service**: Re-scoped to a passthrough, effectively rejecting it as a standalone, fully-fledged command.
- **`ksor build` with database interaction**: Re-scoped to governance-only (validation, provenance, corpus artifact), explicitly rejecting database interaction within `ksor build`.
- **Owner's extensibility/ecosystem arguments for Docusaurus**: While strong, these arguments were ultimately superseded by the side-by-side experiment and the owner's direct judgment in favor of Fumadocs.

## Reversal

- **Docusaurus recommendation**: The initial recommendation in §4 for Docusaurus as the core shell was _reversed_ and superseded by Decision 9 (Next.js + Fumadocs + shadcn). This was due to owner extensibility/ecosystem arguments and the verification that predecessor lib packages were framework-neutral.
- **Visibility spec's "never a list" clause**: This rule was _reversed_ to allow audience to be a required list with overlap semantics, with evidence from `AUDIENCE_CASES` table assertions proving that a wrong intersection failed. (Referenced in `okf-native.md` §2.2, which is part of this overall context).
- **Placement of manifests at root vs. hiding them**: The owner's call reversed an implicit preference for hiding manifests, opting for manifests at the repo root.
- **CLI imports**: The initial (unwritten) assumption might have been that the CLI could be imported. This was _reversed_ by a boundary enforcement rule: "nothing imports the CLI — it is the top of the graph, never a library."
- **TypeScript compiler API for boundary scan**: Deliberately _not built_ on the TypeScript compiler API (forbidden until TS 7.1), indicating a reversal from a potential path that would have used it, with `oxc-parser` as the recorded upgrade path.
- **`takedown --export`**: This command or mode was part of the predecessor but was _deleted_, representing a clear reversal of its existence and a pre-1.0 API commitment.
- **`approved` status on migration**: By default, `approved` documents become `draft` on migration unless `--approve-by human:<id>` is passed. This is a _reversal_ of a direct carry-over of `approved` status without explicit human re-approval during migration.
- **Generating gold from judgment under test for Eval Engine**: This approach was explicitly _rejected_, indicating a reversal of any implicit assumption that evaluations could be self-blessing. Evaluations are externally authored.

## Deferred with reasons

Netlify/Vercel deploy recipes (deploy skill later; root workspace restored
the platform defaults), non-image asset copying (format check rejects until
`ksor build` owns it), the 5k-doc scale claim (measure with a synthetic
corpus in the site slice before claiming — never estimate), i18n,
multi-corpus mounting (second corpus = second project; the URI scheme keeps
composition clean).
