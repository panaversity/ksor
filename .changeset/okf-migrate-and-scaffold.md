---
"@panaversity/ksor": patch
---

`ksor migrate` rewrites a record written before the KSoR Profile into it, and
prints a unified diff before it writes anything. `visibility` expands UPWARD
through the old ordered audience model (`internal` under
`[public, internal, board]` becomes `[internal, board]` — a one-element list
would silently drop the document from the board build); `provenance` strings
become `sources` with the string as the scope descriptor; `effective` widens to
midnight UTC; `review` becomes `draft` and `superseded` becomes `deprecated`
with an attributed `ksor.deprecated` and a `ksor.superseded_by` resolved to a
concept id; `approved` becomes `draft` unless `--approve-by` names the human
performing the approval; the instance becomes format 2 with its authority moved
into a written `.ksor/governance.yaml`; a reserved `index.md`/`README.md`
carrying prose moves to `overview.md`; every summary companion gains
`type: Summary`; and every denylist row in the database becomes a committed
ledger entry. It never authors knowledge: a title, a description, a
`generated.at` or a takedown actor it cannot derive is refused by name
(`ksor-migrate-underivable`). `--write-site` offers the site's byte-copied rule
modules in the same diff. The adopter's frontmatter comments survive — the
commented-out `database:` block in `instance.md` is their runbook.

A top-level `superseded_by:` is now refused as a pre-profile key rather than
preserved as an unknown one: the profile reads `ksor.superseded_by`, so a
top-level one announced a successor no surface showed.

The scaffold's skills are rewritten for the profile — the intake interview
gains a seventh question (who may approve, who may withdraw) and writes
`.ksor/governance.yaml`; `add-sources` emits profile frontmatter with `sources`
and footnote citations and never records an approval; `make-summary` emits
`type: Summary`. `.env.example` documents `KSOR_AUDIENCE` as the comma list of
audiences it is, always including `public`.
