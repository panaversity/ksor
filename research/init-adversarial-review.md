---
issue: recorded via the init-implementation PR
status: accepted
last_updated: 2026-08-18
---

# init implementation — adversarial review record

Date: 2026-08-18 · Branch: `init-implementation` · Spec: `specs/ksor/init/spec.md`

Method: after the local gate, the 17-test acceptance suite, and the browser
e2e were green, seven independent attack agents ran in parallel against the
built CLI and the shipped templates — lenses: init code, templates, kit +
checker, site template, spec conformance, hostile environments, adopter
lifecycle. Ground rule: **a finding only counts when confirmed live** (run
the CLI, plant the defect, read the bytes) — plausible-but-unverified claims
were reported as such or dropped. 265 tool calls; every finding below was
CONFIRMED unless marked otherwise. Disposition: **fixed** (code changed, in
this PR), **spec-corrected** (the spec was wrong; amended same commit per
its own code-wins rule), or **recorded** (deliberate, reason stated).

## Blockers — all fixed

| #   | Finding                                                                                                                                                                       | Disposition                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `ksor init .` never validated the cwd basename: a `"` in the dirname stamped **corrupt JSON** into package.json; spaces/uppercase silently violated the name grammar (exit 0) | fixed — dot form validates the basename, refuses `bad-name` with the rename / `init <suggestion>` remedy                                                   |
| B2  | npm pack **always drops files named `.gitignore`** — the published tarball scaffolded projects with no `.gitignore`; every green gate ran on the git checkout, so none saw it | fixed — template ships as `gitignore`, renamed on emit; tarball test requires it; new packed-tarball→init→tree-diff test automates the shipped-bytes check |
| B3  | `.gemini/settings.json` used the retired flat `contextFileName` key — current Gemini CLI reads only nested `context.fileName`, so Gemini silently never loaded AGENTS.md      | fixed — `{"context": {"fileName": ["AGENTS.md", "GEMINI.md"]}}`                                                                                            |

## Init CLI

| #   | Finding                                                                                                                              | Disposition                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| C1  | Dot form had no rollback — ENOSPC/EACCES mid-materialize left a partial scaffold in the cwd, against the spec's rollback promise     | fixed — writes recorded, removed in reverse on failure; fault-injection test (non-Windows)    |
| C2  | Every environment failure (EACCES, ENOSPC, deleted cwd, rename race) surfaced as a raw stack trace with exit 1 ("refused")           | fixed — fs errors map to `error: environment` + remedy, exit 3                                |
| C3  | Broken install (missing templates dir) → raw ENOENT stack, exit 1                                                                    | fixed — preflight → `error: broken-install`, exit 3                                           |
| C4  | Concurrent double-init: loser died with a raw ENOTEMPTY stack instead of `error: exists` (TOCTOU between existsSync and rename)      | fixed — rename ENOTEMPTY/EEXIST routes to the `exists` refusal                                |
| C5  | Any nonzero `git init` printed "git was not found" — a lying diagnostic when git exists but fails (corrupt config, full disk)        | fixed — ENOENT (absent) distinguished from failure; git's stderr first line quoted            |
| C6  | Spec clause "stale stage dirs are reported, never deleted" was unimplemented                                                         | fixed — pre-scan names each `.ksor-init-*` leftover; never deletes; tested                    |
| C7  | Spec refusal `error: unsupported-platform` (exit 3) existed nowhere — Node < 24 ran silently to success                              | fixed — pure version gate, unit-tested; slug + remedy + exit 3                                |
| C8  | Name grammar accepted Windows-reserved device names (`con`, `aux`, `nul`, `com1`–`9`, `lpt1`–`9`) — unusable dirs on the Windows leg | fixed — rejected in `isValidName`; `suggestName` never emits one; spec grammar clause amended |
| C9  | Extra args silently dropped: `ksor init my sor` created `./my`                                                                       | fixed — refused `bad-name`, hyphenated join suggested                                         |
| C10 | Workspace warning printed before target-state checks (noise on refused runs)                                                         | fixed — warning moved after refusal checks                                                    |
| C11 | `blocked` refusal gave only an entry count — a hidden `.DS_Store` read "not empty (1 entry)" with no clue                            | fixed — up to 5 entry names listed                                                            |
| C12 | Handoff/README said `pnpm install` with no fallback when pnpm is absent (five-minute promise died at "command not found")            | fixed — one corepack/npm line in handoff and scaffold README                                  |
| C13 | Determinism tests used a single name (`my-sor`); vacuous-theme assertion in e2e (`toMatch(/^rgb/)` passes any color)                 | fixed — second-name run added; e2e asserts light ≠ dark computed backgrounds                  |

## Format checker (scaffold kit)

| #   | Finding                                                                                                                                                           | Disposition                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| K1  | Reference-style links never scanned — `[x][r1]` + `[r1]: ../../etc/passwd` passed clean                                                                           | fixed — reference definitions resolved through the same escape/dead logic               |
| K2  | Single-quoted link titles skipped the whole link; angle-bracket destinations false-flagged; `~~~` fences and double-backtick spans not stripped (false positives) | fixed — CommonMark title forms, `<…>` unwrap, both fence styles, longest-run code spans |
| K3  | Skill-copy byte-identity was one-directional — a planted rogue file under `.claude/skills/` passed clean                                                          | fixed — mirror walk both directions                                                     |
| K4  | Interior spaces in file/dir names passed although AGENTS.md forbids them                                                                                          | fixed — whitespace rejection in the portable-name rule                                  |
| K5  | UTF-8 BOM → "no frontmatter" with an unfollowable fix; unclosed frontmatter silently absorbed body text                                                           | fixed — BOM stripped; malformed frontmatter named                                       |
| K6  | Finder's `.DS_Store` in `knowledge/` failed the gate with two misleading errors                                                                                   | fixed — OS junk (`.DS_Store`, `Thumbs.db`, `desktop.ini`) skipped                       |
| K7  | Empty record (zero documents) passed the checker, then broke the build with a baffling Next error                                                                 | fixed — "a KSoR is never empty" is now a named checker error                            |
| K8  | `instance.md` was validated by nothing despite the spec's "unknown top-level keys are named errors"                                                               | fixed — closed key set enforced, fail-closed                                            |
| K9  | `superseded_by` checked for presence only — a pointer to a nonexistent successor passed                                                                           | fixed — path-like values must resolve inside `knowledge/`                               |
| K10 | Site content check missed uppercase extensions (`system/site/STRAY.MD`)                                                                                           | fixed — case-insensitive extension test                                                 |
| K11 | AGENTS.md prose drift: key list omitted `effective`/`superseded`; link rule narrower than enforcement                                                             | fixed — prose matches the checker exactly                                               |
| K12 | No automated coverage for any of the above classes                                                                                                                | fixed — new checker-torture integration test plants each class                          |

## Site template

| #   | Finding                                                                                                                    | Disposition                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `order` frontmatter advertised (AGENTS.md, checker remedy, lock record) but nothing read it — sidebar stayed alphabetical  | fixed — sorted page tree honors `order` (undefined last); llms.txt follows                                                                                                             |
| S2  | llms.txt / llms-full.txt ignored `KSOR_BASE_PATH` — every link 404'd on subpath hosts; heading was generic "# Docs"        | fixed — base-prefixed URLs, instance-name heading; asserted in e2e                                                                                                                     |
| S3  | Home CTA hardcoded `/docs/example` — deleting example.md (as example.md itself invites) left a silent 404                  | fixed — CTA derives from the first page; empty-record state rendered                                                                                                                   |
| S4  | 11 of 17 site deps were caret ranges though spec + lock record promise exact pins                                          | fixed — all pinned exactly; template lockfile regenerated and re-verified live                                                                                                         |
| S5  | `tailwind-merge` declared but imported nowhere                                                                             | fixed — removed                                                                                                                                                                        |
| S6  | Workspace globs named nonexistent `system/gateways/*`, `system/packages/*` with no explanation                             | fixed — one comment marks them reserved                                                                                                                                                |
| S7  | validate.yml double-ran on same-repo PRs (unfiltered push + pull_request)                                                  | fixed — push filtered to main                                                                                                                                                          |
| S8  | A record with zero documents cannot build statically (Next refuses an empty `generateStaticParams` under `output: export`) | recorded — deliberate: the checker names the empty record (K7) and `pnpm dev` renders a legible empty state; a KSoR is never empty, so an empty static export has no legitimate output |

## Spec corrections (code wins, same commit)

- "`ksor` as devDependency" row — the scaffold deliberately carries **no**
  ksor dependency (an unpublished-version dep breaks offline install; the
  CLI is a scaffolding tool, not a runtime).
- "empty build-scripts allowlist" → pnpm 11 `allowBuilds` deny-map (found
  live: pnpm 11 hard-fails until each build script is decided).
- "Next.js + Fumadocs + shadcn" → shadcn dropped; nothing in the shell
  needed it.
- `.gitignore` row: `system/site/.source/` added; ships as `gitignore` in
  the package (B2).
- Name grammar: Windows-reserved device names excluded; extra args refused.
- Refusal contract: `broken-install` and `environment` slugs at exit 3.
- Surface contract clause 2: governed directives **deferred** — no directive
  grammar is ratified; shells pass them through as the readable text they
  degrade to. Inventing quiz semantics ad hoc was rejected.
- Two-implementation clause: the Docusaurus-vs-Fumadocs comparison ran live
  before ratification and the owner chose Fumadocs, ruling Docusaurus
  support a later verb — the workbench fixture + conformance suite move
  there (supersedes the in-PR commitment).

## Verified clean (what the attack did NOT find)

Stage atomicity (same-dir rename, no EXDEV; failure runs left zero
leftovers) · ancestor walks terminate and survive EACCES/malformed
manifests · grammar names cannot traverse paths · no network I/O anywhere
(imports audited, only `git` is spawned) · offline install from the shipped
lockfile · stamps confined to the four intended files, zero residue ·
SHA-pinned actions verified against GitHub tags via live API · CLAUDE.md
`@AGENTS.md` pointer matches Claude Code's documented import mechanism ·
basePath end-to-end for HTML/assets/search (llms was the one hole, fixed) ·
CommonMark-vs-MDX hazard clean (`{braces}`, `a<b` render literally) ·
static Orama search wiring matches fumadocs 16.10.3 internals ·
case-collision rule live-verified on case-sensitive APFS · CRLF, quoted
values, fragments, nested links all parse · renaming the project dir after
init breaks nothing. Explicitly unverified: cloud-synced-folder rename
atomicity (not testable on this machine).

## The six walks

1. **Cold-adopter, stopwatched** — packed tarball → init → install → dev →
   build, well under five minutes; browser leg via Playwright chromium
   (real-Chrome deviation: the Chrome extension was disconnected on this
   machine both attempts — recorded, retry when reconnected).
2. **SME walk** — live edit reloaded; new doc joined nav; relative image
   rendered; `system/` deleted → the record remained a readable tree, git
   intact. Walk-away promise performed.
3. **Agent cold-start** — a zero-context agent given one realistic request
   found AGENTS.md, landed `knowledge/finance/invoice-approval.md` with
   correct frontmatter, exact values, precise provenance, deliberately
   omitted `owner` because the source named none, ran `pnpm check` and the
   build. 6/6 rubric.
4. **Refusal walk** — every slug fired; obeying each printed remedy
   verbatim fixed the situation.
5. **Hostile environments** — the attack agents' territory: full disk,
   read-only parents, concurrent races, corrupt git config, Node 22,
   pnpm-less PATH, BOM'd sources, case-sensitive volumes. Findings above;
   all fixed. Windows CI logs read in full on the PR run.
6. **Deploy walk** — static export served locally at root and under a
   basePath mount; llms.txt reachable; a real external host is deferred to
   the first dogfood deployment (recorded deviation — the shipped bytes
   are what the local serve exercises).
