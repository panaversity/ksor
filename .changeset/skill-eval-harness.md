---
"@panaversity/ksor": patch
---

The agent tier: a shipped skill, run by a real coding agent, with the skill
and without it — the comparison AGENTS.md has always demanded and nothing had
ever run (issue #30).

`pnpm test:agent` scaffolds a fresh record, installs it, drops a real two-page
PDF in `src/`, and hands `claude -p` the prompt tutorial 2 hands the reader.
Once with `add-sources` present, once with it removed. What the agent leaves
behind is graded, and the split is the Testing contract's own: deterministic
behavioural graders GATE the with-skill arm — exactly one new document, under
`finance/`; `.ksor/*` and `instance.md` untouched; the record builds; `status:
draft`, `sources` present, no `id:`/`name:`; page furniture gone; every
number, date and name in the body found in the extraction by the shipped
`verify.mjs`. Cost, turns, duration and the baseline arm are REPORTED, so the
delta is visible and a skill that stops winning is seen.

"Checker passes" is deliberately not a grader: while this was being designed a
baseline run passed the checker by hand-authoring `index.md` and editing
`.ksor/people.yaml` — the worse behaviour scoring better. Files touched is the
discriminating assertion.

It spends model tokens, so it is gated like the database tier: on
`ANTHROPIC_API_KEY` in CI (a repository secret the owner has not yet added; the
tier runs and reports itself skipped until then) or a logged-in `claude`
locally, pins a mid-tier model by default (a one-word reply on the default
model measured $0.25), and runs from `skill-evals.yml` on push to main and by
hand — never per pull request.

What it cannot measure is written in the suite rather than implied: a
conversational skill needs a scripted owner, "reads as a finished page" needs
a browser, and the adopter's own model is whatever they run.

Decision 31 records the three choices this week made about the skill surface —
pruned to three, one skill for a file and a person, and this harness shape
over the Python trigger script that was proposed and measured wanting.
