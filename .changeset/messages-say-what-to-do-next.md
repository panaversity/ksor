---
"@panaversity/ksor": patch
---

Make six CLI messages answer the question the reader is actually holding

Every one of these came out of a first-hour walkthrough that followed the
printed output literally.

- **`ksor calibrate`'s paste block is now a block you can paste.** It ended with
  "Paste into instance.md:" and then `vector_floor:` / `floor_digest:` at the
  top level — where neither key lives. Pasted verbatim, the file was refused
  (`ksor-instance-format`), so nothing shipped, but the one instruction the
  report gives was wrong. It now prints the `retrieval:` block those keys belong
  in, at column 0, because two spaces of terminal indentation lands inside a
  frontmatter as a nested mapping and `yaml` refuses it outright. The
  non-separable verdict's fail-closed block moved to the end of the report for
  the same reason, and both are asserted by pasting them into a real instance.md
  and parsing it.

- **A misplaced instance key now NAMES the block it belongs to.** The refusal
  said "nest it under the block it belongs to" without ever saying which block
  — and the file already holds the map that answers it. `vector_floor` and
  `floor_digest` are told they are keys of `retrieval:`, and the remedy prints
  the block with the values the file already carries, so the fix moves the
  setting rather than dropping it.

- **A port already held now names its remedy.** `ksor serve` printed its boot
  lines and then `error: listen EADDRINUSE: address already in use
  127.0.0.1:8080` — a bare Node errno, with no mention of `KSOR_MCP_PORT`. It
  now says what is wrong, why, how to find the process holding the port, and how
  to serve on another one; `EACCES` and `EADDRNOTAVAIL` get their own remedies,
  because the next command differs. The exit code is unchanged: a bind failure
  is the environment (3), never a refusal.

- **`ksor serve --help` and `ksor init --help` have pages.** Both fell through to
  the generic verb list while every other verb answered for itself. `serve`'s
  page names its one flag and the environment variables a first run needs —
  including the one a busy port sends you looking for.

- **Every write-plane refusal opens with `error: <slug>`.** `ksor build` printed
  a machine-readable slug alone on the first stderr line and `ksor schema` printed
  none at all, for the same malformed file — so an agent reading `stderr` got a
  different shape per verb. `schema`, `ingest`, `calibrate`, `grant`, `takedown`
  and `gc` now keep the contract the docs already stated, naming the RECORD's own
  slug where a record file is what refused. A bad `--dim` is `bad-args` rather
  than a slug about an instance it never read.

- **A refusal states its reason once.** `ksor serve`, `ingest`, `schema`,
  `calibrate`, `gc` and `grant` printed the same sentence twice — inline on the
  `error:` line and again under `why:`.

- **`ksor build` says what it could not record about provenance.** On a record
  with no commit it said only `(dirty)` — a word no shipped document defines —
  and wrote `"source_commit": null` in silence, while `ksor ingest` explained the
  identical state in full. Build now prints the same sentences ingest does, from
  one shared module: the commit it published from when there is one, and what is
  missing and how to fix it when there is not. It still does not refuse — a
  provenance-less build is legitimate, and `--strict` is there for anyone who
  wants it refused.
