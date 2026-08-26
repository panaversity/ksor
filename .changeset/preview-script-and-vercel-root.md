---
"@panaversity/ksor": patch
---

**`pnpm preview` — somewhere for `pnpm build` to land.**

The site is a static export, so there is no server to start; that is what makes
the record hostable anywhere. But it also means the natural thing to try after a
build — `pnpm start` — answers `ERR_PNPM_NO_SCRIPT_OR_SERVER`, which explains
none of that. `pnpm preview` serves `system/site/out` on the same bytes a host
would. It is `node:http` and nothing else: no dependency, no network fetch, works
offline and behind a firewall, for the same reason the build downloads nothing.
Run before a build, it says so and exits `3`.

**And the Vercel dashboard import now says what actually goes wrong.** Vercel
auto-detects a root directory by looking for a framework, finds the Next app, and
fills the field with `system/site`. The build then reads
`system/site/vercel.json`, which does not exist, and fails with
`Project framework is set to "services", but no services are declared` — even
though the import screen just listed both services, because that step reads the
root file and the build step uses the Root Directory override. The fix is one
field: set Root Directory to the repository root. `docs/deploying.md` now names
the error, the cause and the fix, plus the site-only fallback.

Found by an adopter, and it will recur on every dashboard import until Vercel's
detection changes — the layout that triggers it is decision 8 and is not moving.

**And the intake interview asks three questions, not seven.** Seven did not
survive contact: an agent running the skill decided five were too many,
defaulted them, and reported "answered: all seven" — including the one that
decides who may approve a document, which it filled from a git handle. A
process the tool executing it shortcuts is too long.

Scope, Boundary and Authority are asked, because none can be defaulted: the
first two give the abstention gate an edge to be outside of, and the third is
a governance act, which never gets guessed (decision 21). The other four are
STATED as defaults in one block — read by both, declines firmly, one `public`
audience, no sources yet — written only if the owner does not object, and the
write-back must name which were answered and which were defaulted. Reporting a
default as an answer is now called out in the skill as the thing not to do.

**The scaffold README no longer tells you to uncomment something that ships
uncommented.** 0.0.42 filled in `instance.md`'s `database:` block; the README
kept instructing the adopter to uncomment it, and named a refusal
(`instance.md declares no database: block`) they could no longer reach. The
emitted `AGENTS.md` had already been corrected and the README had not — two
documents describing one file, and only one of them updated. Vercel is three
steps ending in the Root Directory fix, `preview` sits beside `build`, and a
"When something refuses you" table maps every refusal an adopter meets to what
to do about it.

**The scaffold README is restructured around what the record is FOR.** It now
opens on the agent interface — an MCP door that answers with citations and
declines what the record does not cover — rather than on an architecture
diagram, because a reader classifies the project in the first fifteen seconds
and "governed markdown plus a site" puts it in the wrong bucket.

`ksor calibrate` moves into the main command path, between `refresh` and
`serve`. It was a parenthetical and a remedy-after-the-fact, which meant the
README's own three-question test failed at exactly the question it says
matters. Verified on the five-document starter: calibrate needs an ingested
corpus but NO running server, produces `vector_floor: 0.609`, and with it
applied the test passes as written — the paraphrased in-corpus question is
answered at 0.701 while an adjacent miss abstains at 0.550 and a far-outside
one at 0.512. The "expect answers, not refusals" note moves from postscript to
precondition, where it prevents the disappointment instead of explaining it.

Also: Neon is named for hosted Postgres rather than leaving it abstract (it is
already what this project's own docs are measured against, and pgvector is on
its free tier), the deploy section ends at the Root Directory fix, and a
"When something refuses you" table maps every refusal an adopter meets to the
one thing to do about it.
