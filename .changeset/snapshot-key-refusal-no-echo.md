---
"@panaversity/ksor": patch
---

A malformed `KSOR_SNAPSHOT_KEYS` entry no longer has its text echoed into the
refusal message. The likeliest operator mistake — pasting a bare secret without
its `kid=` prefix — put that secret verbatim into an error that lands in
whatever collects logs. The refusal now names the entry's position and length
only, and keeps the remedy line.
