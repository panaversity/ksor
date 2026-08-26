---
"@panaversity/ksor": patch
---

The three embed tuning variables now take effect when set in `.env`.
`KSOR_EMBED_TIMEOUT_S`, `KSOR_QUERY_EMBED_TIMEOUT_S` and `KSOR_EMBED_CACHE_MAX`
were read once at module load — before the CLI applies `.env` in `main()` — so
a value set there was silently ignored and the default stood. An adopter who
set `KSOR_EMBED_CACHE_MAX` to fit a small runtime, for instance, still got the
~250 MB default cache and could OOM in production with nothing pointing at why.
The reads now happen at use. Exported shell variables were unaffected and still
are.
