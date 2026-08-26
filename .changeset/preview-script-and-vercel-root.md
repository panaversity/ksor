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
