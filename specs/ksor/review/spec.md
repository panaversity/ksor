---
status: draft
date: 2026-08-31
claim: the governance of what an agent reads is the product, and a record whose review never happens is governed only on paper — a reviewer who has to walk the sidebar page by page is a reviewer who stops
---

# The review surface

Decision 7 says the site is **preview and review, not an editor** — the agent
writes, the human checks. Its 2026-08-25 revision made that load-bearing rather
than descriptive: the preview is now the only surface a `draft` reaches, so the
review step is enforced by what every build excludes.

The per-page half of "checks" shipped with governance rendering: a badged page
says what state it is in, and the sidebar, the listings and the search dialog
carry the same word. **This is the record-level half** — one page answering
"what in this record still wants my eyes?", which otherwise means walking the
sidebar document by document.

## Observable contract

`/review` on the emitted site.

|                        |                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| lists                  | every document this build can see whose `LifecycleBadge` is non-null                                           |
| grouped by             | that badge — `draft`, then `stale`, then `effective-from`, then `deprecated`                                   |
| per item               | title (linked), description, `ksor.owner`, and the instant that explains the badge, **as the record wrote it** |
| ordered within a group | by title, so two reviewers see one list                                                                        |
| when nothing is badged | says so in words                                                                                               |
| when drafts are hidden | says the build cannot see them, never implies there are none                                                   |
| `robots`               | `noindex, nofollow`                                                                                            |
| linked from            | nothing — it is named in the emitted README and AGENTS.md                                                      |

**No approve control, now or later.** Approval is `status: stable` plus a
`ksor.approval` naming an actor the policy authorises, in a pull request. A
button here would be the site performing a governance act on someone's behalf,
which is decision 21's rule applied to the site.

**One opinion per document.** The group a document appears in is the same
`LifecycleBadge` its own page shows — `lib/lifecycle-rule.ts`, record spec §2.5.
The page computes no state of its own.

**It enumerates the staged set, never its own walk of the tree.** `reviewItems()`
reads `getSortedPages()` — the same audience-filtered, staged list the sidebar
and the home page read — so it cannot list a document the rest of the site
hides. Subtracting per surface is the failure mode `research/visibility.md`
§4–§5 names, and it is why the visibility canary now carries a badged
`restricted` document that must never appear here and a badged `public` one that
must.

## Acceptance

1. Grouping, ordering, the empty case and the draft sentence are unit-tested
   against the pure module (`lib/review.ts`), with no site install.
2. The canary sweep asserts both directions on a real static export: the
   restricted badged document appears on no build that excludes it, and the
   public badged one appears, so "filtered" is never confused with "the page
   rendered nothing".
3. A record with nothing badged builds a page that says so.

## Out of scope

- **"What changed since generation N."** Needs the kernel; belongs with
  generation stamping.
- **Any approve, publish or edit control.** Named here so it is not smuggled in
  later as a convenience.
- **A navbar link.** It is a maintainer's page on a record whose readers are
  usually not its maintainers; the adopter owns the file and can link it.
