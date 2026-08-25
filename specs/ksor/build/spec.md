---
status: draft
date: 2026-08-25
claim: provenance is load-bearing — every build records the exact corpus that produced it, every machine artefact names its build, and one governance decision runs before every projection, so the site, the discovery files, the door and an exchange bundle can never read different truths
---

# `ksor build` (Class B)

The database-free verb that turns the record into projections, and the one
place the governance decision runs for static output. Steps 1–3 and the lock
run (`packages/ksor/src/build/`); `--bundles` exits `2`. Plan:
`research/okf-native.md`; record contract: `specs/ksor/record/spec.md`.

## 1 · Contract

```
ksor build [--instance <path>] [--as-of <instant>] [--strict]
           [--allow-unverifiable-ledger] [--bundles]
```

`--instance` (the file, or a directory at or below the root) defaults to the
nearest ancestor `instance.md` through one resolution helper exported from
`packages/content` and shared with `migrate`, `takedown` and `ingest`
(enrolled in the boundary suite); none found is a refusal
(`ksor-instance-missing`). `knowledge/`, `.ksor/` and the lock resolve from
that directory. Needs no database, no provider key, no network. The verb's
own refusals, outside the record checker's set: `bad-args` (an `--as-of` that
is not an instant, an unknown flag), `ksor-instance-missing`,
`ksor-ledger-unverifiable`, `ksor-build-dirty`, `ksor-lock-invalid` (a
committed lock this ksor cannot parse — delete and rebuild). `--help` prints
the contract and performs nothing.

1. **Indexes, in memory.** One per directory, in OKF §8 form: the heading is
   the instance `title` at the root and the humanised directory name below
   it; concept bullets `* [Title](file.md) - description` first, ordered by
   `order:` then title; then subdirectory bullets `* [Name](dir/)` — no
   description, a deviation from §8's SHOULD recorded in draft 10 (a folder
   is a container; a concept describes itself) — ordered by the lowest
   `order:` among the directory's concepts, then name; the root carries
   `okf_version: "0.2"` as its only frontmatter and no summary line (the
   instance `description` seeds `llms.txt`, not the index — §8 is headings
   and bullets). Every status and every audience is listed: this is the
   record's own map, and anyone with the repository has the files.
2. **Check.** Runs the record checker (record spec §6) against the tree with
   the fresh indexes. Any refusal exits `1` with the slug on the first
   stderr line; nothing is written, so a red build leaves the tree as it
   found it.
3. **Write.** Index files whose bytes changed — and delete a committed index
   whose directory earns none, since it would be stale forever — then
   `build.lock.json` (§2). Stdout names every file written and the
   `build_id`.
4. **Bundles** (`--bundles`, plan §4.2): for `public` and each registered
   audience X, an OKF bundle at `.ksor/out/bundles/<X>/` built for the viewer
   list `[public, X]` exactly: the admitted concepts (§2), companions beside
   their parents, indexes generated for the filtered tree, `okf_version` at
   the root, frontmatter intact. No byte of an excluded concept — not a
   title, path, description, link target or asset (R5).

In every manager's scaffold the `build` script becomes `ksor build` followed
by the site build and `export-denylist` is removed (decision 25's
per-manager forms, `init/manager.ts`). `pnpm dev` keeps the staging path it
already has (`stage-knowledge.ts:712-716`): drafts admitted and marked, no
lock required, machine routes carrying `build_id: null` and
`unstamped: true`, lifecycle at now.

## 2 · `build.lock.json`

Committed (AGENTS.md vocabulary), root-level, outside `.ksor/`.

```json
{
  "format": 1,
  "build_id": "sha256:…",
  "ksor_version": "0.1.0",
  "okf": { "version": "0.2", "commit": "ad30107c…", "spec_sha256": "26aa5da0…" },
  "source_commit": "abc123…",
  "dirty": false,
  "as_of": "2026-08-25T12:00:00Z",
  "drafts": "hidden",
  "instance_sha256": "…",
  "policy_sha256": "…",
  "ledger_sha256": "…",
  "ledger_entries": [{ "id": "2026-08-01T00:00:00Z-a1b2c3", "digest": "…" }],
  "audiences": {
    "registry": ["internal"],
    "viewers": { "public": ["public"], "internal": ["public", "internal"] }
  },
  "documents": [
    {
      "path": "policies/purchase-approval.md",
      "sha256": "…",
      "status": "stable",
      "audience": ["public"],
      "admitted": ["public", "internal"]
    }
  ],
  "companions": [{ "path": "what-is-a-ksor.summary.md", "sha256": "…" }],
  "assets": [{ "path": "policies/diagram.png", "sha256": "…" }]
}
```

- `source_commit` is the last commit touching an input (`knowledge/`,
  `instance.md`, `.ksor/governance.yaml`, `.ksor/takedowns.yaml`) — not
  HEAD, so committing the lock itself does not move it; `null` when there is
  no commit yet or no repository at all. `dirty` is true when an input
  differs from that commit (an untracked input included), and always when
  there is no commit; a dirty lock still stamps, with `dirty` in every
  stamp, and `--strict` refuses it (`ksor-build-dirty`). Outside a
  repository the committed lock is the only ledger baseline; inside one, a
  shallow clone is refused (`ksor-ledger-unverifiable`) unless
  `--allow-unverifiable-ledger` is explicit (record spec §5). A repository
  with NO COMMIT — which is what `ksor init` leaves behind — is neither:
  there is no history for a ledger id to have disappeared from, so its
  baseline is empty and verified and the build stamps `source_commit: null`,
  `dirty: true`.
- `as_of` defaults to **now** and `--as-of` pins it. Every lifecycle
  evaluation in the site build and in bundles uses the lock's `as_of`;
  staleness therefore leaves the open web on the next build, and a scheduled
  rebuild is the operator's obligation (plan §5). `drafts` is `hidden` or
  `shown` (`KSOR_DRAFTS=show`, human surfaces only).
- `assets[]` is every non-markdown file of the bundle, by bytes — images, PDFs,
  anything the site copies. It is in the lock because the site PUBLISHES those
  bytes: without it, replacing a diagram after the lock was written changed what
  the site serves with no refusal anywhere, so "a projection only publishes what
  was checked" stopped at the markdown, on records where the substance is often
  in the diagram.
- `build_id` = sha256 over everything a projection reads: the sorted
  `documents[]`, `companions[]` and `assets[]` `(path, sha256)` pairs, `instance_sha256`,
  `policy_sha256`, `ledger_sha256`, `ksor_version`, `drafts`, and each
  document's `admitted` list — the canonical viewers whose machine artefacts
  contain it at `as_of` (stable, effective, unexpired, not denied, audience
  overlapping). It excludes `as_of`, `source_commit` and `dirty` themselves.
  So **the same tree with the same toolchain yields the same `build_id`**
  unless `as_of` crosses an effectivity or staleness boundary, in which case
  a different admitted set gets a different id (R21); the lock is
  byte-identical across two runs modulo `as_of`. The product invariant's
  wording gains "+ same `as_of`" (plan §2.9).
- `ledger_entries` is one `(id, digest)` pair per ledger entry, sorted by id —
  maximal by construction, because a build that lost an id is refused — and one
  of the two baselines the ledger is judged against (record spec §5). The digest
  is over the entry's governing fields, not the file's bytes, so it is one of
  the two things that makes `ksor-ledger-amended` reachable: an id alone cannot
  tell a committed denial from the same id RETARGETED at another document.
  `ledger_sha256` hashes the file's bytes, or the empty string when no ledger
  exists.
  `as_of` is written with millisecond precision (`…T12:00:00.000Z`).

Two identities, never confused in prose: `build_id` is what R14 stamps and
what connects every projection of one publication (KSP-001's "Generation",
renamed "Publication" in draft 10); `generation` remains the kernel's
monotonic counter that a citation pins. `ksor ingest` runs the record
checker, refuses `ksor-lock-missing` / `ksor-lock-stale` (document hashes
disagree with the tree), and records `build_id` on the run it publishes;
the door evaluates lifecycle at request time.

## 3 · What the site does with it

Staging runs for **every** build — the level-0 fast path that served
`knowledge/` unstaged (`stage-knowledge.ts:699-710`) is removed, because no
record is now safe to serve raw. `KSOR_AUDIENCE` is a comma list, validated
against the lock's registry (`ksor-viewer-unregistered`) and required to
include `public` (`ksor-viewer-omits-public`; unset means `[public]`). For
the configured viewer list: stage the admitted concepts and their companions
at the lock's `as_of`; **regenerate** each directory's `index.md` from the
staged tree with the same generator — never copy the committed one — and
give a directory with no admitted concept no entry in its parent; exclude
`**/index.md` from the docs collection (the folder page component renders it;
no `llms.txt` line, no twin except the record-root `/md/index.md`); read
denials from `.ksor/takedowns.yaml` in ledger order. Human and machine
surfaces admit by the record spec's §2.5 table; `KSOR_DRAFTS=show` admits
drafts to human surfaces only, and a `shown` build carries
`<meta name="robots" content="noindex">`. Every page whose twin exists
carries `rel="alternate" type="text/markdown"`; every page carries
`rel="describedby"`. `llms.txt`, `llms-full.txt`, every twin and
`/.well-known/mcp/server.json` carry `build_id`, `source_commit` (with
`dirty` when set) and `ksor_version` (R14); `server.json` keeps its own
`version`, which is the record's. The site build refuses without a fresh
lock (`ksor-lock-missing`, `ksor-lock-stale`) outside development.
**Fresh covers the CONTROL files, not only the documents**: `instance.md`,
`.ksor/governance.yaml` and `.ksor/takedowns.yaml` are hashed against
`instance_sha256`, `policy_sha256` and `ledger_sha256`, every asset against
`assets[]`, and the lock's
`ledger_entries` are passed to the checker as a `ksor-ledger-amended`
baseline. Without that, a takedown was lifted by deleting four lines and the
committed lock still validated (reproduced 2026-08-25) — a freshness claim
that cannot see the ledger is not a freshness claim. The site reads GIT
HISTORY as the second baseline, exactly as the emitted checker does (record
spec §5): the lock is hand-editable and travels in the same change as the
ledger, so on its own it cannot see an entry DELETED — recomputing
`ledger_sha256` and emptying `ledger_entries` made the two agree about a
denial that was gone, and the denied document staged again (reproduced
2026-08-25). Outside a repository, and on a shallow clone, the site says
`ksor-ledger-unverifiable` beside the build and falls back to the lock alone
rather than refusing every shallow CI checkout — `ksor build` refuses that
state outright. The drafts switch must
agree in BOTH directions: a `drafts: shown` lock refuses a build that did not
ask for drafts, because one preview lock accidentally committed would
otherwise publish every draft on every later production deploy. `as_of` and
`ksor_version` are VALIDATED, not merely non-empty — an `as_of` that does not
parse made every lifecycle comparison false (fail-open on both sides), and a
`ksor_version` the site cannot compare slipped past the outdated gate and was
stamped verbatim into every machine artefact. The site
refuses `ksor-site-outdated` when the lock's `ksor_version` is newer than
the site's stamped rule-module version — the adopter-owned site is upgraded
by `ksor migrate --write-site`, which offers the byte-copied rule modules as
diffs (decision 4).

## 4 · Acceptance

1. `ksor build` on the emitted starter after its first commit: exit `0`;
   every directory has an `index.md` matching the golden; the root carries
   `okf_version`; a second run changes no index and the lock differs only in
   `as_of`; with `--as-of` repeated, byte-identical.
2. Editing one document's `description` and rebuilding changes exactly that
   file's index entry, its hash, and `build_id`. Appending a ledger entry
   changes `build_id`. Moving `--as-of` across a concept's `effective_from`
   changes `build_id`; within the same admitted set it does not. Committing
   the lock does not change `source_commit`.
3. A record with a checker refusal: exit `1`, first stderr line is the slug,
   no index and no lock written; a stale index alone is never a refusal
   here; a dirty input is refused only under `--strict`.
4. After a `[public]` site build: `llms.txt`, `llms-full.txt`, `/md/index.md`
   and `server.json` carry the lock's stamps; no draft appears in any page,
   sidebar entry, search entry or machine artefact; `out/` contains no byte
   of an `[internal]` concept's title, path or description; a `deprecated`
   concept's page names its successor and is absent from `llms.txt`; a
   not-yet-effective and a stale stable concept render with their badges and
   are absent from `llms.txt`; a level-0 record with one draft and a
   committed index builds `out/` with no byte of the draft's title.
5. The three manager scaffolds' `build` scripts run `ksor build` and no
   `export-denylist`, walked per manager as today; a site build without a
   lock, or with a stale one, refuses outside development.
6. (plan §4.2) The `public` bundle of a record with one `[internal]` concept
   contains no byte of it, read back by a bare OKF parser; the `internal`
   bundle contains both.

## 5 · Out of scope

SLSA/Sigstore attestation of the lock (P-Verified). Running the site build
itself. Import. A REST surface. `log.md`.
