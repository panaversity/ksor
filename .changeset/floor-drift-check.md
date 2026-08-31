---
"@panaversity/ksor": patch
---

`ksor calibrate --check` reports whether a declared abstention floor is still
holding, from the record's own traffic.

A floor is measured once and the record then grows. As it does, questions that
used to be out-of-corpus start scoring above a fixed number, so the record
answers what it used to refuse — no error, nothing logged, and the same
`gate: { floor: … }` in every envelope. AGENTS.md forbids copying a calibrated
constant between corpora; the same reasoning applies across time within one
corpus, and nothing enforced it (#182).

It needs no telemetry and no new dependency: every search already leaves an
audit row carrying the gate's own signal, on both sides of the gate, so this is
one indexed query — no provider key, no embedding call, no LLM. It reports the
abstain rate, the percentiles of answered top scores, and how many answers
landed within 0.01 of the floor (the size of the decision in this project's own
gold, not a threshold somebody picked).

**It never fails a run**, and that is the design rather than a limitation. A
stale floor wants re-measuring; failing a build for one would make the shortest
way out deleting `vector_floor` — turning the abstention gate off entirely to
clear the error, which is the escape `build/lifecycle-notice.ts` refuses to
create for a passed review date. It is also a monitor and not a measurement: it
can say a floor has gone permissive against real traffic, never that it is too
strict for questions nobody asked, and it says so rather than reporting a
healthy-looking nothing on a record no one queries.
