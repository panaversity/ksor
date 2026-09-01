---
"@panaversity/ksor": patch
---

Test infrastructure only — nothing an adopter installs behaves differently.

The behavioural evals scored a missing `top_cosine` as `-1`. When a provider
rate-limits, the read plane degrades to keyword-only by design, so searches
answer with no score — and the assertions then compared sentinels, reporting a
vendor outage as "the abstention floor is broken". Four CI failures in a day
read that way before anyone looked past the assertion. A missing score now
refuses, naming the cause, and never invents the number that is absent.
