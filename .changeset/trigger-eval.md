---
"@panaversity/ksor": patch
---

Measure WHICH skill a real agent reaches for, and record what the first sweeps
found.

A live walk of the published 0.0.59 reported that `add-sources` did not fire on
its headline prompt. The tempting repair is to reword the description until it
does, which is a guess. This is the instrument that replaces the guess: N runs
per phrase, in a fresh scaffold with all three skills present, graded on which
skill the agent actually invoked, across more than one model. Reported, never
gating — a model is stochastic and a threshold over a handful of runs flakes.

**The model is a column, because the answer depends on it.** Same phrase, same
scaffold, same harness: `claude-sonnet-5` fired `add-sources` 3/3 where
`claude-opus-5` fired nothing 0/2. The walk used the CLI default and the first
probe pinned Sonnet, which is why they disagreed — neither was wrong, and
neither alone measured the trigger.

**The finding is narrower than the walk suggested.** `add-sources` fires on four
of five phrases on both models, and both controls behave: a different skill wins
the intake phrase, and nothing fires on a question about the repo itself. It
misses exactly one shape on Opus — the owner pointing at a file already in the
repo and naming a destination.

**And the obvious repair does not work.** Naming that shape in the description
was tried and measured: unchanged at 0/3. So the cause is not the wording — an
instruction concrete enough to act on gets acted on, and no skill is consulted.
The clause was reverted rather than kept, because it is resident context in
every session and bought nothing a measurement can see. The negative result is
recorded beside the rows it explains.

Also fixed while building it: the CLI can emit raw control characters inside its
JSON, which `JSON.parse` rejects outright — the harness lost the whole transcript
to a stray byte. It now falls back to a scrubbed parse.

Test infrastructure only; nothing an adopter installs behaves differently.
