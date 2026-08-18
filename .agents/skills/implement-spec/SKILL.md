---
name: implement-spec
description: The discipline for implementing any spec or planned change in this repo — breakdown per aspect, red acceptance first, aggressive self-review, live verification like a human (browser included for site work), the detail pass, and the truth sweep. Load before writing the first line of an implementation.
metadata:
  version: "1.0.2"
  origin: ported from panaversity/zia-vsor-sdk .agents/skills/implement-spec (2026-08-17)
---

# Implementing a spec

The spec is the contract; this skill is how the contract becomes code without losing anything on
the way. It exists because prose discipline drifts and checklists don't — follow it in order.
(Until `specs/` exists here, "the spec" is the plan or decision the change implements —
`research/` plans and AGENTS.md → Decisions entries count.)

## 1 · Breakdown before code

Read the spec twice. Decompose it into **aspects** — every contract clause, every negative promise,
every error slug, every acceptance line is an aspect. Write the list into the working branch's
commit plan. An aspect with no test planned is a hole: fix the plan, not later.

## 2 · Red first

Turn the spec's acceptance into **failing tests before any implementation** — integration tests
verbatim where the spec gives observable behavior, unit tests for what it marks unit-tier. Run
them; watch them fail for the _right reason_. The implementation's job is to turn exactly these red
lights green — nothing more. If implementing reveals the acceptance is wrong, **fix the spec in the
same commit** (code wins; supersession visible).

## 3 · Implement in aspect-sized commits

One aspect, its test, its code — smallest change that proves the next assumption. Never batch five
aspects into one commit; review dies there.

## 4 · Aggressive self-review before declaring anything

Before "done", attack your own work the way this repo attacks specs:

- **Re-read the spec clause by clause** against the diff — every clause either has a passing test
  or a written reason it can't.
- **Hostile pass:** what did I not handle — interruption, empty input, weird names, missing binary,
  no network, wrong platform? The error contract is the map; every failure path must be reachable
  and tested.
- For anything non-trivial, run the repo's adversarial pattern: independent reviewers with distinct
  lenses (`/code-review` at high effort, or spawn review agents). **Findings get fixed or recorded
  — never quietly dropped.**

## 5 · Live verification — like a human

Tests prove clauses; only _running the thing_ proves the product. Before done:

- **Walk the real path by driving the real CLI**: the actual command a user runs, on a clean
  directory, timed. Read the actual output — is the error's remedy real? Is the handoff next step
  correct _right now_?
- **For anything with a page: open it.** Build the fixture site, serve it, and verify in a real
  browser context (playwright when available; curl + DOM assertions minimum): the page renders,
  the title is right, the css token actually applies, **dark and light both**, zero console
  errors, zero failed/external network requests, click the nav, run a search. The predecessor's
  flat-layout bug _shipped_ because nobody loaded the page — that class of failure is yours to
  prevent.
- **Never certify a cached environment.** The predecessor certified a stale wheel because its
  install cache was keyed on a stable path and a permanent `0.0.0` version — a hand-run walk
  installed _last run's_ artifact and reported on code that no longer existed (2026-08-14: a 24KB
  theme tarball certified while the staged one was 66KB). The npm analog: never verify from a
  reused install dir or a stale global link. **`pnpm pack` the package and install the tarball
  into a fresh temp directory for every walk.** If a live result contradicts the code you just
  wrote, suspect this before suspecting the code.
- **Record what the live run taught** beside the code (`found live: …` comments) — the
  predecessor's convention, and the reason its scars don't repeat.

## 6 · The detail pass

Detail is the product. Before done: every error carries its remedy · every printed path is real ·
`--json` envelopes (where they exist) are complete and stable · empty states and first-run output
read as designed · measured constants carry date and method · no present-tense claims about
unbuilt behavior anywhere in the diff.

## 7 · Truth sweep and gate

Any document the change made false is corrected **in the same commit** (README, AGENTS.md,
`docs/status.md`, the spec itself). Then the full local gate: `pnpm lint && pnpm fmt:ci &&
pnpm typecheck && pnpm guard && pnpm check:corpus && pnpm test:unit && pnpm build &&
pnpm test:integration && pnpm publint`. Done means: acceptance green on a clean machine, docs true, findings
resolved or recorded.

## The rule under all of it

If you cannot tell whether you are done, you skipped step 2. If you are sure you are done but
haven't run it, you skipped step 5 — and that's the step that catches what everything else misses.
