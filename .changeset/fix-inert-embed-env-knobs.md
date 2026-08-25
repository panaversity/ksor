---
"@panaversity/ksor-content": patch
---

The three embed tuning variables (`KSOR_EMBED_TIMEOUT_S`, `KSOR_QUERY_EMBED_TIMEOUT_S`, `KSOR_EMBED_CACHE_MAX`) now take effect when set in `.env`. They were previously read into module-scope constants that evaluated before `loadDotEnv()` runs, so a value set only in `.env` (never exported into the shell) was silently ignored.
