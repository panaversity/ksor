---
"@panaversity/ksor": patch
---

The skill harness gains two fixtures a baseline plausibly gets wrong, and is
parametrised over a CASES table. Nothing an adopter installs changes: the
fixtures, the graders and the baseline live under `src/evals/`, outside the
tarball.

Three armed runs on the clean two-page PDF had shown both arms — the agent with
`add-sources` and the agent without it — passing every deterministic gate; a
harness that cannot tell the arms apart is measuring the fixture, not the
skill. So `expense-policy-hard.pdf` is built out of the acts a careless
conversion fails a deterministic gate on: a five-row per-diem table (a dropped
row is a value `verify.mjs` cannot see missing), the payment window stated
twice and differently — "10 working days" in §2, "ten (10) business days" in §5
— which the skill says stays two statements, flagged; `1,250` beside `1.250` on
one row, where a misread makes them equal and a substring check cannot tell; a
threshold with a thousands separator; and a running footer on both pages.
`scanned-policy.pdf` is the same policy rasterised — two pages of picture, no
text layer — for which the skill's instruction is to stop and tell the owner.

`skill-cases.ts` is the table: fixture, prompt, the outcome class a correct run
belongs to (`converted` or `refused`), and the gates that apply. Its body
gates are pure functions, so a unit suite mutation-tests each one — smoothing
the two statements, misreading the figure, dropping a row, dropping or
misreading a thousands separator, keeping the footer, inventing a currency —
and watches exactly the gate built for it go red. The agent suite also asserts
the fixtures are what they claim: each committed `.txt` is its PDF's
`pdftotext -layout` extraction, and the scanned PDF yields only whitespace. For
the scanned case the WITH arm's correct outcome — wrote nothing, named the
missing text layer — is the pass; what the baseline did is reported.

Not run here: the armed arms. `SKILL_BASELINE` carries no row for either new
fixture; the hard fixture's first armed run is pending and its row lands with
the run that produces it.

RESULTS
