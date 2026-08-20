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

The record's checker was hardened alongside, because these keys now reach a
published page: `superseded_by` is validated whatever shape it is written in
(a pointer matching neither `./x` nor `*.md` previously skipped every rule,
including the cross-audience one, and the page then published it verbatim); it
must name a real markdown document, not a directory, and must pair with
`status: superseded`; an `effective` carrying a time is refused, because a YAML
timestamp reads back in a timezone and could render the day before the one
written; and a grouped `instance.md` key written inline (`site: { … }`) is
refused instead of being silently dropped, which also restores the closed-key-set
guarantee for every nested group.

A second adversarial pass hardened the rules again: the `effective` check now
matches YAML's real timestamp grammar rather than a padded-date shape (so
`2026-4-1 00:00:00 +05:00` is caught and `2026-04-01 for new customers` is left
alone); a YAML comment on an `instance.md` group key and a capitalised `False`
are accepted, both having been refused by a checker stricter than the parsers it
protects; a supersession that points back at itself or forms a cycle is refused,
because the notice was sending readers in a circle; and a long source URL now
wraps instead of being clipped away on a phone.
