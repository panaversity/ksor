---
"@panaversity/ksor": patch
---

**`ksor init` seeds a real starter record instead of one bare stub.**

A fresh project used to arrive with a single document titled "Your first
governed document" — enough to prove the directory was not empty, and nothing
more. The first `pnpm dev` therefore showed a site with one page on it, which is
the worst possible demonstration of a system whose whole subject is a governed
body of knowledge: no folder, no owner, no provenance, no supersession, no
second status, and a front door with one card on it.

Five documents now ship in `knowledge/`, in a two-level shape:

```text
knowledge/
├── what-is-a-ksor.md
├── governance-ladder.md
└── surfaces/
    ├── index.md
    ├── for-people.md
    └── for-agents.md
```

They are about KSoR itself, and they carry the governance keys they describe —
owners, `provenance` naming real sources, effective dates, `order`, and one
`draft` beside four `approved`. So the governance surfaces are visible working
on the first run: a caveat status in the sidebar and on the front door, a
folder that counts what it holds, provenance rendered at the foot of a page,
and `llms.txt` carrying the same facts to an agent.

`instance.md` leads with the matching authority sentence and its display title
is `KSoR`, so the site has a coherent identity out of the box rather than a
placeholder. Both the record and the identity are seed content the adopter
replaces: `instance.md` says so in its own body, and the intake interview
rewrites the identity as its first job.

The record is still the adopter's outright (decision 4) — these are documents
to delete as real knowledge arrives, not framework files to work around.

The seeded documents are sectioned rather than flat — `##` down to `####`,
never an `# h1`, because the frontmatter title is already the page heading.
A record of headingless documents would leave both the document heading ramp
and the "On this page" table of contents unexercised on exactly the pages an
adopter reads first.

