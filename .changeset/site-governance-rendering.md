---
"@panaversity/ksor": patch
---

The scaffolded site now renders the governance each document declares.

`knowledge/` documents carry `status`, `owner`, `provenance`, `effective` and
`superseded_by`, and `pnpm check` enforces them — but the site rendered only
title, description and body. The sharpest consequence was not cosmetic: a
`status: superseded` document was served looking identical to an approved one,
with the successor pointer the checker requires swallowed.

Each document now shows its owner and effective date under the title, one entry
per `provenance` source at the foot, and — above the title, where it cannot be
missed — a supersession notice that names the successor and links to its page.

The status appears only when it is a caveat: `draft`, `review` and `superseded`
are shown, `approved` is not. A reader already assumes a document in a system of
record is current, and a label that appears on every page saying the same thing
trains people to skip it — including on the page where it mattered.

Nothing is inferred. A key a document does not declare renders nothing at all:
a placeholder would read as governed, which is worse than a visible gap. It is
all server-rendered, so the governance survives printing, JavaScript off and a
failed bundle.

Whether the pages show it at all is the owner's call: `site: governance: false`
in `instance.md` keeps them plain while the record still carries every key for
the agent surface and the audit trail. It defaults to on, and it never hides
the supersession notice — a reader handed a replaced document with no word of
its successor has been misled regardless of the site's preferences.
