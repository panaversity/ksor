---
status: ratified
date: 2026-08-18
claim: governance is a ladder — a record that can name its audience can be published without leaking, on any host, with the same walk-away properties as a public one
evidence: research/visibility.md · panaversity/ksor#10
---

# Visibility

Who may read a document is the most consequential fact about it, and until
now it was the one fact outside governance — answered by whoever configures
a web server, in a place the record cannot see, diff, or carry to another
host. This spec brings it into the record. Where this spec and the code
disagree, the code wins and this page is corrected in the same commit.

## The key

`visibility: <audience>` — optional, **one value, never a list** (a list
makes every document a set-membership problem, and set intersection is
where access-control bugs live). The value must be `public` or an audience
declared in `instance.md`. Orthogonal to `status:` — a document can be
`status: approved` and `visibility: restricted`; collapsing the two axes
makes both unreliable, so `status: draft` does NOT imply non-public (the
draft-on-a-public-site hazard is the owner's to govern with the key).

## The model, declared in instance.md

```yaml
audiences:
  - public
  - internal
  - restricted
default_visibility: public
```

Ordered least- to most-restricted — the ordering is what makes "build the
internal site" mean "public and internal included" with no further config.
`public` must be first; duplicates are refused. `default_visibility` is
**required whenever `audiences:` is present**: there is no safe inference
(fail-open leaks on the first forgotten key; fail-closed hides the
corpus). **Absent `audiences:` is today's behavior exactly** — the feature
is purely additive and existing instances are untouched.

## Enforcement: staging, per audience — never in-process filtering

A build for audience A copies the permitted documents **and only the
assets they reference** into a staged directory, and every reader of the
record reads the stage. Chosen over in-process filtering on evidence
(research §4–§5, §7): the filter is global — a consumer nobody remembered
still reads the filtered corpus — where per-request filtering leaked on
the fifth and sixth consumers its own author had not enumerated; a
filtered directory cannot be bypassed by future code; and asset staging
closes the bytes-leak that per-surface filters miss. The audience is
selected by `KSOR_AUDIENCE` (the `KSOR_BASE_PATH` convention); an
undeclared or unrecognized value **fails the build** — never widens it.
Restricted-tier builds render a quiet audience label in the site chrome
("internal build — not for publication"), so a leaked screenshot names
itself.

**Per-request filtering (the C architecture) is not forbidden — it is an
escalation** that must be deliberately adopted, per instance, when a
named trigger holds: audiences that genuinely do not nest, per-user read
auditing, or a corpus too large to rebuild per audience. It requires its
own spec, an enumerated-and-tested consumer contract, and it forfeits
static export. Adopting it by default is refused by this page.

## The shell contract gains a fifth clause

A shell must never emit a document outside the audience it was built for —
not as a page, not in search, not in `llms.txt`, `llms-full.txt`,
sitemap, or navigation — **and must not serialize the filter or the
hidden documents' names into anything served to the client** (found live:
a correct exclusion list shipped to the browser, research §2). A shell
that cannot filter every surface it emits must **refuse to build** an
instance that declares `audiences:`, never build it partially (research
§3). Conformance: the canary sweep, with its positive control — the
canary absent from the built artifact AND present in the control build,
because a sweep that cannot tell "filtered" from "broken" fails open
(research §8).

## The checker rules

1. `visibility` joins the closed document key set; `audiences` and
   `default_visibility` join the instance key set.
2. A `visibility:` value not declared in `audiences:` is refused.
3. `visibility:` present while `instance.md` declares no model is refused.
4. `audiences:` without `default_visibility:` is refused.
5. `public` not first, or a duplicate audience, is refused.
6. **A link from a less-restricted document to a more-restricted one is
   refused** — the leak no single build can catch, because the build that
   publishes the link has already dropped the target (research §6).
7. `superseded_by:` pointing at a more-restricted document is refused — it
   strands the very readers the supersession exists to redirect.

Rules 6 and 7 are properties of the whole record, invisible to any one
build; that is why they live in `pnpm check`, before any shell filter
exists.

## What this does not claim

**Publication, not authorship.** Anyone who can clone the repository reads
every document regardless of frontmatter; the key is meaningful only when
the reader audience is wider than the committer audience. If someone must
not read a document and can clone, the answer is a second repository.
This sentence ships in the scaffold's AGENTS.md, in bold, beside the key.

## Acceptance

Red-first, on a clean machine: (1) all seven checker rules fire on a
broken record and fall silent on a fixed one, including the cross-audience
link and the stranding supersession; (2) per-audience builds of a canary
corpus on BOTH shells: zero canary hits below the document's tier, control
hits present at its tier, client bundle free of filter terms and hidden
filenames, restricted routes 404 (not 403) in lower tiers; (3) the asset
probe: an image referenced only by a restricted document does not ship —
name or bytes — in a lower tier's build; (4) undeclared `KSOR_AUDIENCE`
fails both builds with a slugged, remedied error; (5) an instance without
`audiences:` builds byte-identically to today (the additive guarantee);
(6) the audience label renders in non-public builds. The canary sweep
with control joins the shell-conformance suite in CI.

## Out of scope

Per-request filtering (its own spec, on a named trigger); authenticating
the gate in front of a non-public build (SSO/proxy — the host's job, the
deploy docs say so); per-user read auditing; encryption at rest.
