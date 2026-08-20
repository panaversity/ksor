---
"@panaversity/ksor": patch
---

The scaffolded site now renders the governance each document declares.

`knowledge/` documents carry `status`, `owner`, `provenance`, `effective` and
`superseded_by`, and `pnpm check` enforces them — but the site rendered only
title, description and body. The sharpest consequence was not cosmetic: a
`status: superseded` document was served looking identical to an approved one,
with the successor pointer the checker requires swallowed.

Each document now shows its status, owner and effective date under the title,
one entry per `provenance` source at the foot, and — above the title, where it
cannot be missed — a supersession notice that names the successor and links to
its page.

Nothing is inferred. A key a document does not declare renders nothing at all:
a placeholder would read as governed, which is worse than a visible gap. It is
all server-rendered, so the governance survives printing, JavaScript off and a
failed bundle.
