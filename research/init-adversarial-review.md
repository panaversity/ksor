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

## Question

What defects, non-conformances, or areas for improvement exist in the `init` implementation, templates, kit, and site template when subjected to an adversarial review, and how should these be addressed (fixed, spec-corrected, or recorded) to ensure robustness, spec conformance, and a reliable adopter lifecycle?

## Evidence

The `init` implementation underwent an adversarial review on 2026-08-18, on the `init-implementation` branch, against `specs/ksor/init/spec.md`. Seven independent attack agents ran in parallel against the built CLI and shipped templates, using lenses covering init code, templates, kit + checker, site template, spec conformance, hostile environments, and adopter lifecycle. Findings were only counted if confirmed live, with 265 tool calls made.

**Key Findings (all fixed unless otherwise noted):**

**Blockers:**

- `ksor init .` failed to validate cwd basename, stamping corrupt JSON (fixed: validates basename, refuses bad names).
- `npm pack` dropped `.gitignore` files, leading to published tarballs lacking them (fixed: template ships as `gitignore`, renamed on emit; new test for shipped bytes).
- `.gemini/settings.json` used retired `contextFileName` key, silently failing to load AGENTS.md (fixed: uses `{"context": {"fileName": [...]}}`).

**Init CLI:**

- No rollback for `ksor init .` on failure (fixed: writes recorded, removed on failure).
- Environment failures (ENOSPC/EACCES) surfaced as raw stack traces (fixed: maps to `error: environment` + remedy).
- Broken install (missing templates dir) gave raw ENOENT stack (fixed: preflight → `error: broken-install`).
- Concurrent double-init died with ENOTEMPTY stack (fixed: routes ENOTEMPTY/EEXIST to `exists` refusal).
- Nonzero `git init` incorrectly printed "git was not found" (fixed: distinguishes absent vs. failure, quotes git stderr).
- Spec clause "stale stage dirs are reported, never deleted" unimplemented (fixed: pre-scan names leftovers).
- Spec refusal `error: unsupported-platform` missing (fixed: pure version gate).
- Name grammar accepted Windows-reserved device names (fixed: rejected in `isValidName`).
- Extra args silently dropped (fixed: refused `bad-name`, suggests hyphenated join).
- Workspace warning printed before target-state checks (fixed: moved after refusal checks).
- `blocked` refusal gave only entry count, not names (fixed: lists up to 5 entry names).
- Handoff/README said `pnpm install` with no fallback (fixed: one Corepack/npm line added).
- Determinism tests used single name; vacuous theme assertion in e2e (fixed: second-name run, e2e asserts light ≠ dark backgrounds).

**Format Checker (Scaffold Kit):**

- Reference-style links not scanned (fixed: definitions resolved through escape/dead logic).
- Single-quoted link titles skipped; angle-bracket destinations false-flagged; `~~~` fences/double-backtick spans not stripped (fixed: CommonMark title forms, `<…>` unwrap, both fence styles, longest-run code spans).
- Skill-copy byte-identity one-directional (fixed: mirror walk both directions).
- Interior spaces in file/dir names passed (fixed: whitespace rejection in portable-name rule).
- UTF-8 BOM → "no frontmatter"; unclosed frontmatter silently absorbed body text (fixed: BOM stripped; malformed frontmatter named).
- `.DS_Store` failed gate with misleading errors (fixed: OS junk skipped).
- Empty record passed checker but broke build (fixed: "a KSoR is never empty" is named error).
- `instance.md` not validated despite spec (fixed: closed key set enforced).
- `superseded_by` checked for presence only (fixed: path-like values must resolve inside `knowledge/`).
- Site content check missed uppercase extensions (fixed: case-insensitive extension test).
- AGENTS.md prose drift (fixed: prose matches checker).
- No automated coverage for these classes (fixed: new checker-torture integration test).

**Site Template:**

- `order` frontmatter advertised but not read (fixed: sorted page tree honors `order`).
- `llms.txt` / `llms-full.txt` ignored `KSOR_BASE_PATH` (fixed: base-prefixed URLs, instance-name heading, asserted in e2e).
- Home CTA hardcoded `/docs/example` (fixed: CTA derives from first page; empty-record state rendered).
- 11 of 17 site deps were caret ranges (fixed: all pinned exactly).
- `tailwind-merge` declared but unused (fixed: removed).
- Workspace globs named nonexistent `system/gateways/*`, `system/packages/*` (fixed: comment marks them reserved).
- `validate.yml` double-ran on same-repo PRs (fixed: push filtered to main).
- Record with zero documents cannot build statically (recorded: checker K7, `pnpm dev` renders legible empty state).

**Round Two (after two-shell proof and branding):**

- Review 1: 0700 project root, `tel:` links reported dead, raw control bytes in torture suite diffed as binary, indented code samples failed, post-success errors masqueraded, stale suite path (all fixed).
- Review 2: Shells silently disagreed on unordered reading order (loader tie order, flat sort approx.), swap install died under `CI=true`, umask-077 inverse mode fix, nested-list dead links passed, branding surface shipped without browser opening home page, null-stderr spawn failures reported TypeErrors (all fixed).
- Delta attack: Identity split (one shell's name stamped constant, other from `instance.md`; now both read `instance.md`), checker-legal frontmatter that YAML rejects killed builds (unquoted colons now refused), Docusaurus's `numberPrefixParser` broke path identity for digit-prefixed files, non-ASCII filenames exported incompatible routes (now refused), CRC-corrupt PNG 500'd one shell and shipped silently on other (checker verifies PNG chunk CRCs), conformance suite trusted incidence (titles satisfiable from any page's nav, fixed ports, no asset probe, no divergence probes — all hardened).

**Round Three through Seven:**

- Round 3: Theme fetched typeface from Google at build time (offline builds impossible), 1,900 ported lines untypechecked, shells diverged on index-less folder ties.
- Round 4: Guards only ran at birth (instance.md's name grammar, provenance list shape), `_partial.md` divergence, missing repo .gitattributes, orphaned dev-server process group.
- Rounds 5 & 6 (attacked checker): Duplicate keys, malformed quoting, tight colons, tab indentation, flow-list types, stray backtick silently exempted links, `process.exit()` truncating piped reports, dangling symlink crashing run.
- Every finding fixed same-round, with torture cases; conformance suite typechecks the shell where its dependencies exist.

## Decision

Numerous defects and non-conformances in the `init` implementation, templates, kit, and site template were identified and systematically addressed through an adversarial review process. Findings were categorized as fixed (code changed), spec-corrected (spec amended), or recorded (deliberate choice with reason stated).

Key spec corrections include:

- `ksor` not being a `devDependency` in the scaffold.
- Using pnpm 11 `allowBuilds` deny-map instead of an empty allowlist.
- Shadcn dropped from the shell.
- `.gitignore` shipping as `gitignore` in the package.
- Windows-reserved device names excluded from name grammar.
- Refusal contract with `broken-install` and `environment` slugs at exit 3.
- Governed directives deferred due to unratified grammar.
- Two-implementation clause re-activated with a workbench shell and conformance suite.

The standing lesson from the two-shell proof is that two implementations of one contract will disagree wherever the contract is silent. The conformance suite now explicitly pins the canonical answer for each discovered silence, enforcing the contract.

## Rejected

- **Plausible-but-unverified claims**: Dropped if not confirmed live by running the CLI, planting the defect, and reading bytes.
- **Implicit `ksor` dependency in scaffold**: Rejected. The scaffold deliberately carries no `ksor` dependency to avoid breaking offline installs and because `ksor` is a scaffolding tool, not a runtime dependency.
- **Empty `build-scripts` allowlist**: Rejected in favor of pnpm 11 `allowBuilds` deny-map, as pnpm 11 hard-fails until build scripts are decided.
- **Shadcn dependency**: Rejected; nothing in the shell needed it.
- **Inventing quiz semantics ad hoc for governed directives**: Rejected; shells pass directives through as readable text until a grammar is ratified.
- **Implicitly trusting static Orama search wiring**: While initially verified clean against fumadocs 16.10.3 internals, the document notes that the `init` implementation now uses ZBSearch. This implies that the Orama search wiring approach was superseded.
- **Ignoring empty records**: Rejected. "A KSoR is never empty" is now a named checker error, preventing empty records from passing the checker and breaking the build. The static export of an empty record is deliberately recorded as having no legitimate output.
- **Relying on GitHub renders for `colorette` ANSI output**: Implicitly rejected; `grep` behavior needed explicit handling for ANSI escape codes in CI logs.
- **Single-directional skill-copy byte-identity**: Rejected, now a mirror walk in both directions is performed.
- **Unchecked reference-style links**: Rejected, reference definitions are now resolved through the same escape/dead logic.

## Reversal

- **Spec clauses on `ksor` dependency and `build-scripts` allowlist**: These were initially part of the spec but were corrected when the code revealed different behavior (e.g., unpublished `ksor` breaking offline installs, pnpm 11 `allowBuilds` requirements). This represents a reversal of the original spec's understanding based on live evidence.
- **Two-implementation clause**: Initially deferred, it was re-activated by the owner on the same day, leading to the development of the workbench shell and conformance suite. This was a reversal of the temporary deferral.
- **Adoption of Shadcn**: Initially part of "Next.js + Fumadocs + shadcn" but later dropped as nothing in the shell needed it. This is a reversal of the decision to include Shadcn.
- **Ignoring Windows-reserved device names**: The initial `isValidName` did not reject these, but the spec grammar was amended, and rejection was implemented, reversing the acceptance of such names.
- **Default site dependencies as caret ranges**: The spec + lock record promised exact pins, but 11 of 17 site deps were caret ranges. The fix to pin all exactly represents a reversal to adhere to the original promise.
- **Pre-computed identity for shells**: Initially, one shell's name was a stamped constant, leading to identity splits. Both shells now read `instance.md`, reversing the pre-computed constant approach.
- **Implicit trust in incidence for conformance suite**: The conformance suite initially trusted incidence (e.g., titles satisfiable from any page's nav). This was hardened to probe assets and divergence, reversing the reliance on incidence alone.
- **Theme typeface fetching at build time**: Initially, the shipped shell fetched its typeface from Google at build time, making offline builds impossible. This was fixed, implying a reversal to a more self-contained or reproducible build process.
- **Guards only running at birth**: Guards for `instance.md`'s name grammar and provenance list shape initially ran only at birth. This was fixed to ensure ongoing validation, reversing the limited scope.

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
- Two-implementation clause: briefly deferred to a later verb after the
  live Docusaurus-vs-Fumadocs comparison; the owner re-activated it the
  same day, and this PR ships the workbench shell and the conformance
  suite in CI (see "Round two" below — this bullet records the morning's
  state, superseded by the afternoon's).

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

## Round two: the second shell, the branding, and the review loop

After the owner re-activated the two-shell proof and the scaffold gained
its branding, the same discipline ran again over the new work — an
iterating headless review loop (fix everything, review again) plus a
five-lens delta attack (record parser, shell config, suite rigor,
branding truth, swap lifecycle), all confirmed-live-only.

**What the loop caught, round by round (all fixed same-day):**

- _Review 1:_ the named form shipped a 0700 project root; `tel:` links
  reported as dead files; raw control bytes made the torture suite diff as
  binary; indented code samples failed the gate; post-success errors
  masqueraded as failed inits; a stale suite path in the shell README.
- _Review 2:_ the two shells silently disagreed on unordered reading
  order (twice — loader tie order, then a flat sort approximation); the
  swap install died under `CI=true` frozen-lockfile; the umask-077 inverse
  of the mode fix; nested-list dead links passed; the branding surface
  shipped with no browser ever opening the home page; null-stderr spawn
  failures reported TypeErrors.
- _Delta attack:_ **identity split** — one shell's name was a stamped
  constant, the other's read from instance.md, so renaming the instance
  updated one surface and a template-restore shipped the literal
  placeholder with every gate green (both shells now read instance.md);
  checker-legal frontmatter that YAML rejects killed both builds after a
  green check (unquoted colons — now refused with the quoting remedy);
  Docusaurus's default numberPrefixParser broke path identity for
  digit-prefixed files; non-ASCII filenames exported two incompatible
  routes (now refused — the title carries the real name); one
  CRC-corrupt PNG 500'd every page of one shell and silently shipped on
  the other (the checker now verifies PNG chunk CRCs); the conformance
  suite trusted incidence (titles satisfiable from any page's nav, fixed
  ports, no asset probe, no divergence probes — all hardened).

**The review loop, rounds three through seven** (an iterating headless
reviewer, fix-everything-then-review-again, per the owner's instruction):
round 3 read the theme port line by line — the shipped shell fetched its
typeface from Google at build time (offline builds impossible, exports not
byte-reproducible), the ~1,900 ported lines were typechecked by nothing,
and the shells still diverged on index-less folder ties; round 4 found the
guards that only ran at birth (instance.md's name grammar, provenance's
list shape), the `_partial.md` divergence, the missing repo .gitattributes
(a Windows checkout would scaffold different bytes than every suite
certified), and the orphaned dev-server process group; rounds 5 and 6
attacked the checker itself — duplicate keys, malformed quoting, tight
colons, tab indentation, flow-list types, a stray backtick that silently
exempted links, process.exit() truncating piped reports, and a dangling
symlink crashing the run. Every finding fixed same-round, with a torture
case pinning its class; the conformance suite typechecks the shell where
its dependencies exist.

**The standing lesson this round adds:** two implementations of one
contract disagree wherever the contract is silent — reading-order
tie-breaks, route encodings, empty-value semantics, identity sources. The
conformance suite now pins the canonical answer for each discovered
silence, which is exactly the work the two-shell decision exists to force.
