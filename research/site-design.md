---
issue: recorded via the site-design branch (set to the PR URL when it opens)
status: proposed
last_updated: 2026-08-21
---

# Site design — what the field does, what we ship, and what to change

The UI/UX research behind the site work on this branch. Two questions were
asked: what strategy the leading documentation sites are actually built on, and
where our scaffolded template stands against it. Where this document and the
code disagree, the code wins.

**Method, so nobody has to trust the prose.** Every third-party claim below was
fetched from a primary source on 2026-08-21 (URLs at the foot) — none is
recalled. Every claim about our own template was taken from a scaffold emitted
by the built CLI, filled with a governance-shaped record, built with
`pnpm build`, then screenshotted and **measured** in Chromium. Two of the
findings below reversed what the screenshots appeared to show; they are marked.

---

## 1 · The field is running two strategies, and only one of them is famous

### 1a. The developer-docs convention — settled, and we already meet it

Three panes (navigation · prose · table of contents), search as the primary
navigation with `⌘K`, a persistent theme toggle, static generation. It is
convergent across Next.js, Vite, Stripe, Tailwind and Vercel, and it is
convergent because it is finished: nobody is competing here any more.

Our template inherits all of it from Fumadocs and passes: sidebar with folder
tree, `⌘K` static Orama search, both themes, breadcrumb, previous/next footer,
zero console errors, zero external requests.

**Diátaxis** (tutorial / how-to / reference / explanation) is the IA framework
underneath most of these sites. It does **not** transfer to us: it partitions
_teaching_ material by user intent, and a system of record is not teaching. Our
partition is governance state (draft · review · approved · superseded) and
ownership. Recorded so nobody imports it by reflex.

### 1b. The dual-audience turn — the live front, and the one we are losing

The interesting movement in 2025–26 is that documentation stopped being written
only for people. The pattern, fetched from the sites that ship it:

- **Vercel** publishes an entire `/docs/agent-resources/` surface: content
  negotiation (`Accept: text/markdown`, with `Vary: Accept`), `.md` endpoints on
  every page (`/docs/functions` → `/docs/functions.md`), a `rel="alternate"`
  link in the HTML advertising the markdown twin, `llms.txt`, `llms-full.txt`,
  `sitemap.md`, `taxonomy.json`, a nightly cross-site `graph.json`, per-page
  `.graph.md`, and a page-actions menu offering **Copy page** and **View as
  Markdown**. Their markdown responses open with YAML frontmatter carrying
  `title`, `canonical_url`, `last_updated`, `type`, `prerequisites`, `related`,
  `summary`.
- **Anthropic** ships `llms.txt` at ~600 entries, grouped under `##`/`###`
  headings rather than one flat list.
- **Fumadocs — the shell we already ship** — provides this natively:
  `LLMCopyButton`, `ViewOptions`, `.md` route handlers with
  `generateStaticParams`, `isMarkdownPreferred()` negotiation, and
  `remark-llms`.

The evidence that this is real and not a fashion: Vercel served _this research
session_ the markdown version of its own page, frontmatter and all, because the
fetch looked like an agent. The strategy demonstrated itself.

**This is ksor's entire thesis, and our template currently ships the weakest
version of it in the field** (§3, F1–F2).

### 1c. The governed-record convention — our actual ancestors

Stripe is the wrong reference for the half of our page that makes ksor ksor.
The design precedent for status, supersession and provenance is a century of
publishing practice, and three institutions have already solved it in public:

| Source                                         | What it establishes                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GOV.UK Design System** — notification banner | Place it **immediately before the page `h1`**. "Use notification banners sparingly. There's evidence that people often miss them, and using them too often is likely to make this problem worse." Never rely on colour alone — carry a heading word. Use `role="region"` with `aria-labelledby`. Avoid multiple banners; combine or show the highest priority only. |
| **GOV.UK publishing** — withdraw vs unpublish  | A withdrawn page **stays live** with a banner, because deleting strands the reader. The publisher must write a **public explanation** — a _reason_, in a fixed shape: "This page has been withdrawn because it's out of date. You can read about X at [link]."                                                                                                      |
| **IETF / RFC Editor**                          | Supersession is **bidirectional and linked**, above the text: `Obsoleted by: 7230…7235`, `Updated by: 2817…`, and on the successor, `Obsoletes: 2068`. It also distinguishes _obsoleted_ (wholly replaced) from _updated_ (partially amended).                                                                                                                      |
| **MDN**                                        | Status banners (`deprecated`, `experimental`, `non-standard`) are **generated from data** (browser-compat-data) and **cannot be hand-overridden**; a manual edit does not persist.                                                                                                                                                                                  |

Two of these validate decisions we already took, which is worth recording as
evidence rather than luck: our supersession notice sits above the `h1` (GOV.UK),
and our status chip appears only when it is a caveat (GOV.UK's "sparingly", and
the reason a label that never varies stops being read). MDN's rule — status is
derived from data, never asserted — is the same rule as our "the governance
level is derived, never declared".

---

## 2 · What we ship, measured

A scaffold emitted by the built CLI, filled with five governed documents (a
fully-populated `approved` policy with three provenance entries, its
`superseded` predecessor, a bare `draft`, a folder index, and an about page),
built and served from `system/site/out/`.

| Measurement                                | Value                                                      | Verdict                 |
| ------------------------------------------ | ---------------------------------------------------------- | ----------------------- |
| Prose column width                         | 836px, **fixed** at both 1440px and 1920px viewports       | capped, does not sprawl |
| Characters per line                        | **86** (measured against the rendered font, not estimated) | inside the 45–90 rule   |
| Body type                                  | 16px / 28px line height (1.75), `-apple-system`            | correct for long-form   |
| Console errors                             | 0                                                          | —                       |
| External requests                          | 0                                                          | —                       |
| Provenance entries rendered as links       | **0 of 3** (one entry is a bare URL)                       | defect, F5              |
| Per-page `.md` artifacts in the build      | **0**                                                      | defect, F2              |
| `rel="alternate"` markdown advertisement   | **absent**                                                 | defect, F2              |
| Governance in `llms.txt` / `llms-full.txt` | **none**                                                   | defect, F1              |

**Correction, recorded because the screenshots lied.** Reading the desktop
screenshot, the measure looked like 110–120 characters and the empty right rail
looked like sprawl. Measured, it is 86 characters in a column that does not grow
past 836px. The layout complaint is real but it is about _space_, not
readability — and the readability "fix" a reviewer would have reached for would
have made a fine measure worse. This is the repo's own rule earning its keep:
assert on computed values, and print the value you actually saw.

---

## 3 · Findings

Ordered by what they cost the product, not by effort.

### F1 · The agent surface drops the governance the page just gained — _correctness_

The same superseded policy, on the two surfaces of one build:

```text
out/docs/policies/purchase-approval-2019/index.html
  → "Superseded" ×2, "has been replaced by" ×2   (the reader is warned)

out/llms-full.txt
  → "# Purchase approval thresholds (2019) (/docs/policies/purchase-approval-2019)
     Historical thresholds: purchases over $25,000 required CFO approval…"
     (no status, no successor, no owner — nothing)
```

In `llms.txt` the withdrawn 2019 policy and the current one are two adjacent
entries distinguishable only by a parenthesis in a human-authored title. An
agent ingesting either file answers "$25,000" and cites a withdrawn policy —
with no way to know, from the bytes it was given, that it was withdrawn.

This is **exactly the defect `specs/ksor/site-governance/spec.md` was written to
close**, still live on the other projection. It breaks product principle 2 (one
source, two surfaces, never two truths) and it is the one that matters most,
because the agent surface is the audience ksor exists for.

### F2 · No per-page markdown, and nothing advertises one — _product surface_

The build emits zero `.md` artifacts and no `rel="alternate"`. An agent handed a
document URL gets HTML and must scrape a React app to reach text the record
already holds as markdown. Surface-contract clause 3 already promises per-page
markdown "once `ksor build` emits the artifacts" — meanwhile the field shipped
it, and Fumadocs hands it to us for a route file.

### F3 · Status is rendered on the page and invisible everywhere a reader _chooses_ — _governance_

In the sidebar, "Purchase approval thresholds" and "Purchase approval thresholds
(2019)" are pixel-identical rows. Same in search results, same in `llms.txt`,
same on the home page. The governance appears only _after_ the reader has
committed to opening the document — which is the one moment it is least useful.
The record knows the status of every document at build time.

### F4 · Supersession is one-directional — _governance_

We render the forward pointer (this was replaced by X). The reverse — _this
document replaced Y_ — is derivable from the record and rendered nowhere, so a
reader on the current policy cannot see that a predecessor exists, and cannot
reach the history the record deliberately kept. RFC has shown both directions
since 1969.

### F5 · Provenance URLs are not links — _governance_

Measured: 0 of 3 provenance entries are anchors; a bare `https://intranet…` URL
renders as text. Provenance is load-bearing (product principle 6); a source a
reader cannot follow is weaker than the record makes it.

### F6 · One accent colour does four jobs, including the warning — _craft_

`--color-fd-primary` is simultaneously the link colour, the primary CTA ("Open
the record"), the focus ring, **and** the tint + rule of the supersession
notice. So "stop trusting this document" is painted in the same blue as "go
here". GOV.UK's rule is not to lean on colour alone — we do carry the word
"Superseded", so this is not a failure. But a caution that wears the brand's
"go" colour is weaker than it should be, and the palette has no second role
available.

### F7 · The home page speaks in ksor's voice, not the record's — _contract tension_

The scaffolded home page renders the line "Knowledge you can govern. Answers you
can trace. Boundaries agents can respect." — framework-authored marketing copy,
on the adopter's site, above their record. Critical rule 1 of the scaffolded
AGENTS.md is that the site never contains authored content. Meanwhile
`instance.md`'s authority sentence — which its own template calls "the single
most important sentence in the project", and which `ksor serve` wires into the
MCP server's instructions — appears on **no page of the site at all**. The one
sentence that says what this record is authoritative for is visible to agents
and invisible to people.

### F8 · The right rail is empty whenever a document has no headings — _craft_

The TOC column renders nothing for a document without `##` headings, and roughly
a quarter of the viewport goes unused while governance sits crowded under the
title. Fumadocs exposes `tableOfContent.header` / `.footer` for exactly this.

### F9 · The supersession notice is `role="note"` — _accessibility_

GOV.UK ships `role="region"` + `aria-labelledby` so a screen-reader user can
reach the banner by landmark. Ours is a `role="note"` `aside`, which is
announced but not navigable. One attribute pair.

### F10 · `llms.txt` is flat — _scale_

One ungrouped list. Anthropic groups ~600 entries under `##`/`###`. At 200
documents ours is an undifferentiated wall, and the record's own folder
structure — which we already sort by the governed `order:` key — is the grouping,
free.

---

## 4 · What to change

Each item names the claim it serves. Nothing here weakens a guarantee to
simplify an implementation.

### Tier 1 — the agent surface tells the truth (closes F1, F2)

1. **`llms.txt` carries governance.** One line per document gains its status
   when the status is a caveat, and its successor when superseded:
   `- [Purchase approval thresholds (2019)](/docs/…) — SUPERSEDED by /docs/policies/purchase-approval`.
   Cheap (one template string), and it makes the two surfaces agree.
   _Claim: one source, two surfaces._
2. **`llms-full.txt` emits each document's frontmatter**, not the body alone.
   The record's governance is already parsed; discarding it on the way out is
   the whole of F1. _Claim: provenance is load-bearing._
3. **Per-page `.md` routes** via Fumadocs' `getLLMText` +
   `generateStaticParams`, with a `rel="alternate"` link in the page head.
   Statically exportable, so the walk-away and any-host promises hold.
   _Claim: discoverability determines whether agents find you at all._
4. **A "Copy page" / "View as markdown" action** on each document, once (3)
   exists — `LLMCopyButton` + `ViewOptions` ship with the shell. This is the
   human surface handing an agent the exact governed bytes, which is a better
   demonstration of the product than any copy on the home page.

### Tier 2 — governance where the reader chooses (closes F3, F4, F5, F9)

5. **A status marker in the sidebar and search results** for caveat statuses
   only, so `draft` and `superseded` are visible before the click and
   `approved` stays silent. Sidebar rendering is `sidebar.components`.
6. **The reverse supersession pointer**: "Replaces: Purchase approval thresholds
   (2019)" on the successor, derived by scanning the record for documents whose
   `superseded_by` resolves here. No new frontmatter key.
7. **Linkify a provenance entry that is a URL** — and only a URL; a citation
   like "Finance policy manual §4.2" must stay text.
8. **`role="region"` + `aria-labelledby`** on the supersession notice.

### Tier 3 — the page reads like a record (closes F6, F7, F8, F10)

9. **Put the record's authority sentence on the home page** — the first
   paragraph of `instance.md`'s body, rendered as the record's own words, and
   drop the ksor tagline. This closes F7 in both directions at once: it removes
   framework-authored copy and it publishes the sentence that matters.
10. **Move the governance strip into the right rail** via
    `tableOfContent.header`, as a small "About this document" block (owner,
    effective, status, sources count) — Stripe's right-rail metadata pattern,
    applied to governance instead of code samples. Fills F8's dead space and
    un-crowds the title.
11. **A caution role in the palette**, distinct from the brand accent, used by
    the supersession notice only.
12. **Group `llms.txt` by folder** under `##` headings, in the governed order.

### Explicitly rejected, with reasons

- **AI search / chat over the docs** (Fumadocs ships three backends): needs a
  runtime and a vendor API key, forfeits static export, and puts a generation
  model between the reader and the record — the opposite of "the calling model
  composes; the record returns evidence".
- **`Accept: text/markdown` content negotiation**: needs a Node host at serve
  time, which `output: export` does not have. Already recorded in
  `research/site-shell.md`; the `.md` endpoint gets the same benefit statically.
- **A cross-link graph (`graph.json`, `.graph.md`)**: Vercel's answer to a
  documentation _estate_ of many sites. One corpus per project is ksor's shape;
  revisit if multi-corpus composition ever lands.
- **A marketing home page, a dark-only theme, a versions switcher, mega-nav**:
  the conventions of a _product_ docs site, not a record. A KSoR's home page has
  four jobs — say what it is authoritative for, name the identity agents cite,
  open the record, point at `llms.txt`.
- **Tightening the measure below 86 characters**: measured, in range, and the
  screenshot-driven instinct to "fix" it was wrong.

---

## 5 · Sources

Fetched 2026-08-21.

- Vercel, _Markdown Access_ — <https://vercel.com/docs/agent-resources/markdown-access>
- Anthropic, `llms.txt` — <https://platform.claude.com/llms.txt>
- Fumadocs, _AI & LLMs_ — <https://fumadocs.dev/docs/integrations/llms>
- Fumadocs, _Docs Layout_ / _Docs Page_ — <https://fumadocs.dev/docs/ui/layouts/docs> · <https://fumadocs.dev/docs/ui/layouts/page>
- GOV.UK Design System, _Notification banner_ — <https://design-system.service.gov.uk/components/notification-banner/>
- GOV.UK publishing guidance, _Withdraw or unpublish_ — <https://guidance.publishing.service.gov.uk/publish-update-retire-content/standard-content-types/withdraw-unpublish-standard>
- RFC Editor, RFC 2616 (obsoleted) — <https://www.rfc-editor.org/rfc/rfc2616>
- MDN, _Banners and notices_ — <https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Page_structures/Banners_and_notices>
- Butterick, _Line length_ — <https://practicaltypography.com/line-length.html>
- Diátaxis — <https://diataxis.fr/>
