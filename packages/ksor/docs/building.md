---
title: Building
status: draft
---

# `ksor build`, and handing the record to something else

`ksor build` is the database-free verb that makes the SITE correct: it
regenerates every `index.md` in memory, runs the record checker, and on green
writes the indexes whose bytes changed plus `build.lock.json` — the provenance
every machine artefact stamps. `pnpm build` in a scaffold runs it before the
site build, so most owners never type it. The verb's own page is
`ksor build --help`; the flags that matter here:

```bash
ksor build                                 # check, regenerate, write the lock
ksor build --as-of 2026-09-01T00:00:00Z    # pin the instant lifecycle is judged at
ksor build --strict                        # refuse an uncommitted input (a release)
ksor build --bundles                       # also write one OKF bundle per viewer
```

A refusal exits `1` with its slug on the first stderr line and writes nothing.

## `--bundles`: one OKF bundle per viewer

The record is an OKF bundle in the KSoR Profile, so `knowledge/` handed to any
OKF consumer already reads as a conformant bundle. What it does NOT do is
respect audience: the committed tree holds every document for every reader,
drafts and internal ones included, because anyone with the repository has the
files anyway. `--bundles` is the projection for the case where you hand the
record to someone who should see only part of it.

For `public`, and for each audience `X` registered in `.ksor/governance.yaml`,
it writes `.ksor/out/bundles/<viewer>/` built for the viewer list
`[public, X]` exactly — the same admission the site and the MCP door use, taken
from the lock's own `admitted` set:

- the admitted concepts only: `stable`, past `effective_from`, before
  `stale_after`, not taken down, audience overlapping;
- their companions (`x.summary.md`, `x.flashcards.yaml`, …) beside them;
- the assets their bodies reference — an image nothing published mentions does
  not travel;
- every `index.md` regenerated for that filtered tree, with `okf_version` at
  the root, so a folder with nothing admitted has no index and no bullet in
  its parent;
- frontmatter verbatim, unknown keys preserved, bytes unchanged.

No byte of a concept excluded for AUDIENCE reaches a bundle: not its title, its
path, its description, a companion of it, or an asset only it references. The
test that holds this greps the emitted tree for the excluded document rather
than inspecting it by name, because a bundle is the one projection that leaves
the building. What makes it byte-complete is the record checker, not this
command: a link, a supersession pointer or a companion body reaching a narrower
audience is refused as `ksor-link-widens` before a bundle is ever planned, so a
body copied verbatim cannot name what its own readers may not open.

An exclusion for a LIFECYCLE or LEDGER reason — a draft, a document not yet
effective, one past `stale_after`, one taken down — is narrower on purpose. The
body is copied verbatim, never rewritten, so if a held document links to one of
those, the excluded path ships inside that link. It is [reported per
bundle](#what-it-will-tell-you) rather than edited away: rewriting a body would
make the bundle a derivative instead of a copy you can hash against the record,
and the reader who sees the path is already entitled to that audience.

```
.ksor/out/bundles/
├── build.lock.json        # a copy — the bundles travel with the build that made them
├── public/
│   ├── index.md           # okf_version: "0.2", bullets for what public may read
│   ├── what-is-a-ksor.md
│   ├── what-is-a-ksor.summary.md
│   └── surfaces/
│       ├── index.md
│       └── …
└── internal/              # the viewer [public, internal]: everything above, plus
    ├── index.md
    ├── board-pay.md
    └── …
```

The directory is REPLACED on every `--bundles` run, so a bundle for an audience
the policy no longer registers does not sit beside the fresh ones. It is
gitignored by the scaffold's `.ksor/*` rule; nothing under it is the record.

### What the lock records

`build.lock.json` carries `bundles[]` — one `{ viewer, sha256, files }` per
viewer — on EVERY build, whether or not `--bundles` was passed. The bundles are
a function of what the lock already hashes, so recording them does not depend
on the flag and does not move `build_id`. The digest is sha256 over the JSON of
the bundle's sorted `[path, sha256]` pairs, stated this plainly so a recipient
holding only the directory can recompute it and match it to a publication:

```js
import { createHash } from "node:crypto";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const pairs = files // [[relativePath, bytes], …] — every file in the bundle
  .map(([rel, bytes]) => [rel, sha(bytes)])
  .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const digest = sha(JSON.stringify(pairs)); // equals lock.bundles[i].sha256
```

### What it will tell you

A body is copied verbatim, never rewritten. If an admitted document links to a
concept the bundle excludes for a lifecycle or ledger reason — a draft, one not
yet effective, one past its review date, one taken down — the link dangles for
that bundle's reader, and the build says so on stdout:

```
  wrote .ksor/out/bundles/public/ — the OKF bundle for viewer [public], 8 file(s)
    policies/board-pay.md links to policies/purchase-approval.md, which this bundle excludes — the link dangles for its reader
```

A link that would widen AUDIENCE never gets this far: the record checker
refuses it (`ksor-link-widens`) before any bundle is planned, because a public
document naming an internal one leaks the name whether or not the target
travels.

Two refusals come from the bundles, and both run on EVERY build, with or
without the flag — the lock records `bundles[]` either way, and a digest for a
directory the tool refuses to write would be provenance for something that
cannot exist.

An audience identifier is a directory name here, so one that cannot be a path
segment is refused before anything is written:

```
error: ksor-audience-identifier-invalid
```

Name audiences in plain words — a letter or a digit first, then letters,
digits, `-`, `_` and `.` — in `.ksor/governance.yaml` and in every
`ksor.audience` list. That first-character rule is why `../escape`, `.hidden`
and `-x` are all refused, and `build.lock.json` is refused too: the lock copy
sits beside the bundle directories.

Two registered audiences that differ only in case — `internal` and `Internal` —
are two viewers and one directory on macOS and on Windows, whose filesystems
are case-insensitive by default. The second bundle written would merge into the
first, leaving a directory holding concepts the viewer named on it may not read
and a lock digest that no longer describes it, so they are refused on every
platform alike:

```
error: ksor-audience-identifier-collides
```

Give each audience a name that differs by more than case. `public` is reserved,
casefolded too.

### What it is not

It is not import: reading a foreign bundle into a record is not built. And it
is not the site or the door — a bundle carries no `llms.txt`, no search index,
no citations. It is the record, filtered to one viewer, in the format the record
is already written in.
