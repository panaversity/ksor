---
"@panaversity/ksor": patch
---

The site build no longer fails when two evaluations of the record staging overlap

The scaffold stages a per-audience copy of the record before the site build
reads it, removing the previous stage first. `rmSync(..., { force: true })`
suppresses ENOENT but retries nothing: Node retries EBUSY / EMFILE / ENFILE /
ENOTEMPTY / EPERM only when `maxRetries` is set, and it defaults to zero. The
bundler evaluates the source config more than once when it wants it in more than
one place, so one run could remove the stage while another was still copying
into it — surfacing as `ENOTEMPTY` and failing the entire site build (seen once
in CI, 2026-08-21).

The removal now asks for those retries. Losing that race is safe: the stage is a
deterministic function of the record and the denylist, so redoing it produces
the same bytes.

Three claims in the scaffold's `AGENTS.md` that recent releases made false are
also corrected: `--actor` no longer "defaults to the operating user" (it is
required, and there is no default by design); the signing keys are discovered
from the SSO's own metadata rather than fetched from Better Auth's path; and the
`order:` key now drives the MCP `outline` tool alongside the sidebar and
`llms.txt`, which is what "one order drives every surface" was always supposed
to mean.
