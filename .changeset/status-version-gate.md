---
"@panaversity/ksor": patch
---

Repo documentation and a test only — nothing an adopter installs changes.

`docs/status.md` named 0.0.42 while the published package was 0.0.53. Authority
rule 3 makes that file the only authority on what is built, and it is the first
thing an evaluator's coding agent reads. It is current now, and a docs-truth
assertion holds it equal to `packages/ksor/package.json` so a Version PR cannot
bump one without the other. It also records that the full kernel walk was re-run
against 0.0.53 — it had last run against 0.0.18, thirty-five releases earlier.
