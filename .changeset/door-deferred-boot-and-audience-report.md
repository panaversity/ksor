---
"@panaversity/ksor": patch
---

A cold start against a sleeping database no longer crash-loops the door, and an unauthenticated public bind says what it is actually handing out.

**`ksor serve` meant it when it said DEFERRED.** The door is built to come up when the content store is unreachable — it announces `boot checks DEFERRED … NOT READY`, refuses every request, and retries until the database answers, because a serverless Postgres waking from suspend is an ordinary deploy, not an exception. One read sat outside that guard: the viewer list is validated against the ingested policy's registry, which is a row, and reading it threw two statements after the DEFERRED line had already printed. The process exited 3, the platform restarted it, and it did the same thing again — a crash loop for a database that was merely asleep. That read is now one of the boot checks, so deferring defers it too, and until it passes the door holds the one viewer list that is legal for every record: `public`. Nothing is served through it, because an unverified instance refuses every request.

**A refusal is no longer deferred as though it were an outage.** A stemming mismatch between `instance.md` and the stored `search_tsv`, and a `KSOR_AUDIENCE` naming an audience the policy does not register, are both decided by a row the database ANSWERED with. They were caught by the deferral branch, which reported `content store unreachable` about a store that had just replied and left the door retrying a verdict no retry can change. Both now refuse at boot, where they can be fixed.

**`KSOR_AUTH=disabled-public` now states what it reaches.** The boot report carried two facts and never their product: one line said the door was unauthenticated, another said `audience public,internal`, and a door serving the internal half of the record to anonymous callers read exactly like one serving only the public half. The auth line now names the restricted tiers by name — and stops saying "the whole record" when only the public audience is being served, so the loud sentence means something when it is true.
