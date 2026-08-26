---
"@panaversity/ksor": patch
---

`ksor ingest --knowledge` is retired. The record root — the directory holding
`instance.md` — supplies `knowledge/`, `.ksor/` and `build.lock.json` alike
(record spec §1), so the flag could only ever name the one directory it was
already going to read. It survived this release as a tolerated argument that
`--help` did not list, which is the shape of a trap: it worked, so nobody
noticed it meant nothing.

Passing it now refuses like any other unknown flag, and `ksor migrate` strips
it from the `ingest` script the pre-profile scaffold shipped, in the same diff
that drops `export-denylist`.
