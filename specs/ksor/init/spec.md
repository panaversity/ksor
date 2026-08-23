---
status: ratified
date: 2026-08-18
claim: the five-minute promise — one human command yields a governed corpus, its agent kit, and a working site; everything after init is the agent's job
evidence: research/scaffold-structure.md · research/primitives-proposal.md §1 · research/handover-vsor-to-ksor.md
---

# ksor init

The only verb a human types (decision 7). Ratified from the design
conversation of 2026-08-18; the predecessor's init spec served as the
clause-by-clause checklist — every clause crossed, was rewritten for the new
shape, or was dropped with the reason recorded in
`research/scaffold-structure.md`. Where this spec and the code disagree, the
code wins and this page is corrected in the same commit.

## Observable contract

**Invocation.** `ksor init <name>` with `<name>` matching
`^[a-z0-9][a-z0-9-]{0,62}$` and never a Windows-reserved device name
(`con`, `prn`, `aux`, `nul`, `com1`–`com9`, `lpt1`–`lpt9` — such a directory
is unusable on the `windows-latest` leg this spec itself runs on); extra
arguments are refused as `bad-name` with the hyphenated join suggested,
never silently dropped. `ksor init .` scaffolds into an empty-enough current
directory (the company-monorepo path) — the name derived from the directory
basename passes the same grammar or is refused (found live 2026-08-18: an
unvalidated basename containing `"` stamps corrupt JSON into package.json);
bare `ksor init` prints one instructional screen and exits `0` — an
unattended agent must never scaffold into an unknown cwd by accident.

**Refusals** exit `1`, first stderr line a stable slug: `error: bad-name`,
`error: exists`, `error: blocked` (target dir has unrelated content),
`error: nested` (an ancestor directory contains `instance.md`). Environment
failures exit `3` with the same slug discipline: `error: unsupported-platform`
(Node below 24 — `engines` is advisory, so the gate is enforced at run time),
`error: broken-install` (the package is missing its templates), and
`error: environment` (the filesystem refused — full disk, permissions);
an environment failure is never presented as a refusal or a raw stack trace.
A parent pnpm workspace whose globs would swallow the project produces a
warning, not a refusal.

**Negative contract.** No network I/O. Never runs a package manager (the
handoff text carries `pnpm install && pnpm dev`). Deterministic: the same
ksor version and name produce byte-identical trees — enforced by shipping
every emitted byte (the lockfile included) as template content in the ksor
package. Atomic: staged in a sibling `.ksor-init-<random>/` then renamed
(`init .`: ordered writes with rollback); a failed init leaves the
filesystem as found; stale stage dirs are reported, never deleted. Runs
`git init` unless already inside a repository; never stages or commits. No
symlinks anywhere in the output.

**The emitted tree** (the closed root set — frozen at birth; its one named
later arrival is `build.lock.json`, committed, written only by `ksor build`):

| Path                                                      | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` · `pnpm-workspace.yaml` · `pnpm-lock.yaml` | workspace at root; scripts proxy so `pnpm dev` works at root; exact pins + `packageManager`; `minimumReleaseAge`; build scripts denied by default (pnpm 11 `allowBuilds`, each denial commented). Declares `@panaversity/ksor` as a dependency, pinned to the EXACT CLI version via `KSOR-STAMP-VERSION` (MCP serving is a core surface — decision 11 revision 2026-08-20; supersedes the 2026-08-18 "no `ksor` dependency" correction, whose objection — a dep on an unpublished version — is void for the ADOPTER, who runs a published CLI, though ksor's own release/dev CI must inject the local build). `schema`/`grant`/`ingest --flip`/`serve` convenience scripts. `minimumReleaseAgeExclude: ["@panaversity/ksor"]` so the just-published tool is not blocked by the 48h quarantine, and the kernel's build-scripted deps (`@google/genai`, `protobufjs`) join `esbuild`/`sharp` under `allowBuilds: false` (pnpm 11 exits 1 otherwise). The committed lockfile stays site-only, so the first `pnpm install` is non-frozen                                                                                                                                                                                                                                                                                                            |
| `.env.example`                                            | the served rung's variables, commented: the DSN var name, the provider key, and `KSOR_AUTH_DISABLED=1` (serve refuses to boot unauthenticated, so a local run needs it). Copied to `.env`, which `ksor` reads automatically; `.gitignore` exempts the example from its own `.env*` rule (decision 8 revision 2026-08-20)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `AGENTS.md`                                               | the project constitution: the two worlds, command conventions, record-purity rules; critical rule 1 = the site never contains authored content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `CLAUDE.md`                                               | one line, `@AGENTS.md` — a file, never a symlink; must never grow content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `README.md`                                               | one page: record vs system, and the grant sentence (templates are MIT-0 — decision 10; no LICENSE file is ever emitted)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `instance.md`                                             | format 1 frontmatter: `format`, `name`, `ksor.requires`, `ksor.scaffolded` (the upgrade stamp); `site.url` reserved. Body = prose identity (the MCP system prompt — `ksor serve` wires it into the server's instructions). The four kernel serve blocks (`database`/`embedding`/`retrieval`/`budgets`) are accepted, absent until a project climbs to the served rung. Unknown top-level keys are named errors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `knowledge/` (starter record)                             | five governed documents about what a KSoR is, in a two-level shape (`what-is-a-ksor.md`, `surfaces/` with `index.md` + two children, `governance-ladder.md`) — never an empty directory, and never a lorem stub. They carry the governance keys they document: owners, provenance, effective dates, `order`, and one `draft` beside four `approved`, so a first `pnpm dev` shows the record's surfaces actually working rather than a single bare page. They are also SECTIONED — `##`/`###`/`####`, never an `# h1` (the frontmatter title is the page heading) — because a record of headingless documents leaves the document type ramp and the "On this page" table of contents unexercised on every page an adopter sees first. The seed document also carries its two STUDY ATTACHMENTS — `what-is-a-ksor.summary.md` and `what-is-a-ksor.flashcards.yaml` — so a first `pnpm dev` shows the summary and recall tabs working, and shows the deck's authored shape, rather than describing them in a document nobody reads (decision 23; `specs/ksor/study-attachments/spec.md`). They are attachments, not documents: they hold no frontmatter, take no route, and appear in no count. Seed content the adopter deletes as their own knowledge arrives; `instance.md` says so in the body, and the intake interview replaces the identity |
| `system/site/`                                            | the reference shell: Next.js + Fumadocs + shadcn/ui (`components.json` + `lib/utils.ts`; the palette is shadcn's, read by Fumadocs through its `shadcn` CSS preset, with `--primary` carrying the brand). _The 2026-08-18 note "shadcn dropped — nothing in the shell needed it" is reversed 2026-08-22 (owner): the shell needed the PALETTE. Fumadocs' `neutral` painted page and sidebar 1.6% apart, so the reading surface never read as a page, and every component an adopter adds from the registry had no shared theme to land in. What stays dropped is the shadcn CLI as a dependency — 578 extra packages, measured; `components.json` names the classic `new-york` style so components compile against the tokens alone, and adding one is `pnpm dlx shadcn@latest add`. The site's runtime cost is +2 packages: `tw-animate-css` and one transitive. The home page then took `button`, `badge` and `separator` from the registry (`components/ui/`), which the CLI pays for with `radix-ui` — 774 packages against the 718 before shadcn, all of it measured against the lockfile._ Static export (`output: 'export'`, `trailingSlash`); next.config pins `turbopack.root`/`outputFileTracingRoot` to the repo root and sets `images.unoptimized`; the `basePath` knob is `KSOR_BASE_PATH`                                         |
| `.agents/skills/`                                         | intake-interview · add-sources · format-checker; `.claude/skills/` = real copies, byte-identity checked by the format-checker; `.gemini/settings.json` points Gemini at AGENTS.md                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `.github/workflows/validate.yml`                          | adopter-owned CI running the format checks; SHA-pinned actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `vercel.json`                                             | answers Vercel's deploy interview so the root directory is declared, never guessed (`framework: null` — the deliverable is the static export; found live: pinning `system/site` as root omits `knowledge/`, issue #11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `.gitattributes`                                          | `*.md text eol=lf` (instance.md included) — checkout bytes are provenance bytes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `.gitignore`                                              | `.ksor/`, `node_modules/`, `system/site/.next/`, `system/site/.source/`, `system/site/out/`, `*.tsbuildinfo`, `.env*`, `.DS_Store` — ships inside the package as `gitignore` and is renamed on emit (found live 2026-08-18: npm pack always drops files named `.gitignore`, so the published tarball would silently scaffold without one)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Record purity** (enforced by the scaffolded format-checker, later by
`ksor build`): `knowledge/` holds CommonMark `.md`, assets, and study attachments (`<doc>.summary.md`, `<doc>.flashcards.yaml`) only — no
`.mdx`, no `meta.json`, no framework files; components are directives
(`:::quiz`) that degrade to readable text; the frontmatter key set is closed
(title, description, status, owner, provenance, effective, superseded,
superseded_by, order) but requiredness follows the governance ladder —
**level 0 requires only `title` + `status`**; owner and provenance are
encouraged keys at level 0 and become required from level 1 up (the level is
derived, never declared — demanding level 4 of a level-0 project is a bug); filenames are Windows-safe with no case-insensitive or
`foo.md`/`foo/index.md` collisions and no parenthesized directories; asset
links never escape `knowledge/`. Identity: a doc's path is its route and its
future MCP URI — `ksor://<instance-name>/<path>`.

**The surface contract — the shell swap seam** (decision 9). The ONLY
coupling between ksor (and the root scripts) and the site is this contract;
swapping shells must require no change outside `system/site/`:

1. the site is the workspace package at `system/site/` exposing `dev`
   (hot-reload preview of `knowledge/`) and `build` (static output at
   `system/site/out/`) scripts;
2. it renders every published document in `knowledge/` and renders nothing
   authored inside itself; the governed directives (`:::quiz` etc.) bind
   here the day their grammar is ratified — no directive spec exists yet,
   so a shell today must only pass directives through as the readable text
   they degrade to (deferred 2026-08-18: inventing quiz semantics ad hoc
   would put ungoverned behavior behind a governed-looking fence);
3. it serves `llms.txt`, and per-page markdown once `ksor build` emits the
   artifacts (dev-mode sugar allowed);
4. it passes the browser smoke (below);
5. it never emits a document outside the audience it was built for, and
   never serializes the filter to the client — the visibility clause,
   specified and conformance-tested in `specs/ksor/visibility/spec.md`.

Fumadocs is the reference implementation core ships; a Docusaurus shell, a
bare Next.js app, or any registry-distributed alternative that satisfies
all five is equally conformant. **The contract proves itself with two
implementations**: the conformance shell at `workbench/shells/docusaurus/`
(based on the predecessor's de-branded shell under decision 6, never
feature parity) swaps into any scaffolded project by the recipe in its
README, and one shell-agnostic suite —
`packages/ksor/src/shell-conformance.integration.test.ts` — runs clauses
1–4, the `order:` translation, and the base-path build against both shells
in CI; clause 5 has its own shell-agnostic suite,
`visibility-conformance.integration.test.ts`, run against both shells in
the same job. The default is not a choice the adopter makes at init: `ksor init`
emits Fumadocs, always; the swap is an act their coding agent performs.
_Revision note: this clause was briefly deferred to a Docusaurus-support
verb earlier on 2026-08-18; the owner re-activated it the same day — the
team keeps the option, and a working second shell is what "vendor
neutral" means in practice._ The suite is the bar any future registry
shell must pass.

## Acceptance

Red-first, on a clean machine: (1) run init twice with the same name into
temp dirs — trees are byte-identical and match the shipped templates
(diffed, never counted); (2) every refusal fires with its slug and correct
exit code; (3) the scaffolded project's own validate workflow logic passes
against the fresh scaffold; (4) `pnpm install && pnpm dev` serves the
starter record — page renders in a real browser, both themes, zero
console errors, zero external requests; (5) editing
`knowledge/what-is-a-ksor.md` hot-reloads; (6) the agent eval: an agent given only the scaffolded project
completes the intake interview into `instance.md` and lands one governed
document that passes the format rules (CI-gated once the harness exists;
manual rubric until then). Acceptance (1)–(3) also run on `windows-latest` —
the Windows-safety rules are tested, never asserted.

## Live verification — the agent walks

Automated acceptance proves clauses; these walks prove the product. Each
runs on a fresh environment (never certify a cached one), each surprise is
recorded as a `found live:` note beside the code, and implementation is not
done until all six pass:

1. **Cold-adopter walk, stopwatched** — pack the tarball, fresh temp dir,
   follow only what the handoff text prints; open the served page **in real
   Chrome** (driven by the agent, in addition to the Playwright smoke):
   example doc renders, search works, both themes, zero console errors,
   zero external requests, under five minutes end to end.
2. **SME walk** — live-edit a doc (watch the reload), add a new doc (nav
   updates), add a relatively-linked image (renders); then delete `system/`
   entirely and confirm the record remains a readable document tree — the
   walk-away promise performed, not asserted.
3. **Agent cold-start walk** — a fresh zero-context agent session in the
   scaffold, given only a realistic request ("add a policy about X"; "help
   me set up this knowledge base"): it must find AGENTS.md, land content in
   `knowledge/` (never the site), use the frontmatter, run the checker,
   and complete the intake interview — judged against a written rubric.
4. **Refusal walk** — trigger every error path and then obey each printed
   remedy verbatim; a remedy that doesn't fix the situation is a lying
   error.
5. **Hostile-environment walks** — init inside a real parent monorepo
   (warning fires, project still works), stray home-dir lockfile, Ctrl-C
   mid-run (filesystem as found; stale stage reported), Windows CI logs
   read, not glanced at.
6. **Deploy walk** — a scaffold pushed to a throwaway repo and put on a
   real host plus a locally-served static export (basePath case): verify
   the shipped bytes — llms.txt reachable, page rendering at the deployed
   URL. The predecessor's four costliest defects were all found on deployed
   artifacts; ours get found here first.

## Out of scope

`build`/`serve` (own specs); the upgrade-diff mechanism (the
`ksor.scaffolded` stamp reserves its merge base); deploy recipes; binary
source storage (provenance = external location + content hash, recorded);
i18n; multi-corpus composition (second corpus = second project).
