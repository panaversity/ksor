---
"@panaversity/ksor": patch
---

Trim the shell-retirement revision in AGENTS.md from 222 words to 129, keeping
what an agent must act on and moving the reasoning to the commit that carried
it.

Working rule 6 requires a reversed decision to keep its entry and gain a
revision note, so removing it is not available — and it is not irrelevant
either: without it an agent looks for a deleted directory with no explanation,
or restores two-shell assertions thinking they were lost by accident, or reads
decision 9, sees no obstacle, and treats dropping `output: "export"` as
unblocked. That last one is the reason it stays.

But coding principle 1 applies to this file too — context is liability, and
AGENTS.md loads every session. The narrative half was 90 words explaining why
the proof had been valuable, which the commit already records.
