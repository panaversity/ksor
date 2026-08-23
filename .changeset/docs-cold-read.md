---
"@panaversity/ksor": patch
---

`deploying.md` and `ingesting.md` were each read by someone who had never used
the tool, told to find where the document stranded them. Both were, in the
reviewer's phrase, "the second half of a guide whose first half doesn't exist" —
prose by someone who had forgotten what it is like not to have the environment
already working. This is that first half, plus the contradictions the read
surfaced.

**A prerequisites block on both pages.** `ingesting.md` used the word "provider"
five times without ever naming Gemini, saying which variable holds the key, or
where to get one — a hard blocker on line 1. Neither page said the database needs
pgvector, where `knowledge/` lives, or which directory the commands run from.
`deploying.md` now opens with the four things that must exist and the order they
happen in, because its own text described skipping ingest as "the single most
common 'it deployed but does not work'" while telling the reader publishing was
"not on this page's critical path".

**A wrong claim about `gc`, corrected.** `ingesting.md` said `gc` "reaps the ones
nothing points at any more" directly after promising the previous generation as a
rollback target — reading as though the routine `pnpm refresh` destroys the safety
net it just created. It does not: `gc` never collects the active generation, the
rollback generation, or any generation a live snapshot token could pin, and always
leaves at least two standing.

**A verification section on both.** Neither page showed how to tell a working
record from a broken one — the failure `ingesting.md` opens by warning about had
no instrument. `deploying.md` gained the same for auth.

**Corrections found by the read:** the local `docker run` example could not work
as written (a container binds `0.0.0.0`, so it needs `KSOR_AUTH=disabled-public`
even on a laptop); the summary table sold the site as "upload a folder to any
static host" while its build refuses without a DSN; `KSOR_AUTH` had no documented
value for the SSO path (you unset it); `KSOR_ALLOWED_HOSTS`, `KSOR_ALLOWED_ORIGINS`
and snapshot-key rotation had no formats; `KSOR_MCP_RESOURCE_URL` was ambiguous
about the `/mcp` path; and an ordinary ingest needs a site rebuild too, which was
stated only for takedowns.

The pooler section — the longest technical passage in `ingesting.md`, about a
classification the same section calls informational — is cut to four sentences.
