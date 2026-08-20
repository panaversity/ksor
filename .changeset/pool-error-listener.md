---
"@panaversity/ksor": patch
---

fix: `ksor serve` no longer exits when the database terminates an idle
connection. The Postgres pool had no `'error'` listener, so an idle client
dropped by a restart, a failover, or an administrative `pg_terminate_backend`
became an uncaught exception and killed the process instead of being discarded
and reconnected. Long-running servers were exposed to this on any routine
database maintenance; the pool now logs the discarded connection's error class
and keeps serving.
