---
"@panaversity/ksor": patch
---

Cut dead weight, and repair two guards that had quietly stopped guarding

A sweep across every package, with each candidate handed to a second reviewer
whose job was to prove it still alive. Net −154 lines. Nothing an adopter can
observe changes; two things that were supposed to fail no longer stay silent.

**The two repairs.** A guard asserting that no scaffolded document describes
serving as publishing — a claim this repo has had to correct four times — ran
`readFileSync` inside a `try` whose `catch` returned quietly, and one of its five
filenames was `.env.example` while the scaffold emits `env.example`. So the row
covering the file that actually carries the serving variables had never executed.
The name is fixed and a missing file now fails instead of passing. Separately,
two doc-blocks described a stdio transport in the present tense; there is no
stdio door in the product, and the suite claiming to drive one drives HTTP.

**The removals.** A 134-line live-walk script pinned to `@panaversity/ksor@0.0.4`
that nothing referenced. `AuthConfig.jwksUrl`, computed and stored but never read
— its live twin is `explicitJwksUrl`; the boot-time validation of
`KSOR_JWKS_URL` stays exactly where it was. An `allowedAudiences.length > 0 &&`
operand that no path can reach as false, and whose false side would have skipped
the audience allowlist entirely. A `PoolTimeoutError` message parameter no caller
passed, which was also the one input where two retry classifiers disagreed —
removing it closes that. Two `instanceof X || instanceof Error` disjuncts where
`X extends Error`, so the first could never decide anything. One unused icon
export in the workbench shell.

**Left alone deliberately.** `SearchScope.kinds` is genuinely dead, but removing
it renumbers positional parameters across three SQL statements, two of which
derive a shared CTE by string substitution, and the test that would catch a wrong
renumber is gated on a database. That is a change to make on its own, with the
gate watching — not alongside a release.
