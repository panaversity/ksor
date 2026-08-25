---
"@panaversity/ksor": patch
---

The shipped docs and the scaffold's own contract now describe the OKF-native
record rather than the one before it.

Every document `ksor init` emits, and every page in the package's `docs/`, had
sentences that stopped being true when the record became an OKF bundle. The
ones an adopter would have acted on:

- **`ksor takedown` was documented as needing a database**, with examples that
  omit the required `--actor`, pass `--subtree` (not a flag; the verb takes
  `--scope subtree`) and pass a stable id to `--revoke` (which takes a ledger
  entry id). None of the three commands ran. A takedown is ledger-first, so a
  record with no database can withdraw a document, and the actor must be a
  well-formed `human:`/`process:` id that `takedown_authorities` names.
- **`KSOR_AUDIENCE=<tier>` was documented in two places** and is refused: the
  value is a comma list that must include `public`, and admission is list
  overlap rather than a tier ordering.
- **The display title was documented as `instance.md`'s body `# H1`**, which
  no longer exists; it is the `title:` key.
- **A summary companion was documented as carrying no frontmatter**, which is
  now the one thing that refuses it: it carries exactly `type: Summary`.
- **`pnpm check` was credited with the quiz and slides audits.** Those run in
  the site build; `pnpm check` never ran them.
- The tool-surface numbers in the scaffold's AGENTS.md were the 2026-08-23
  measurement, taken before the trust floor and the per-hit governance block;
  they are the re-measured ones, each with its date, and `min_trust_tier` is
  now shown in the registration example it belongs to.
- The scaffold README's file table never named `.ksor/governance.yaml`,
  `.ksor/takedowns.yaml` or `build.lock.json`, which are committed record
  files an adopter has to understand.

`ingesting.md` also gains the remedy for a stale lock, which it never carried:
`ksor ingest` refuses `ksor-lock-stale` / `ksor-lock-missing`, the fix is always
`ksor build` and never an edit to the lock, and freshness covers seven sets —
the instance, the policy, the ledger, the concepts, the companions, the assets
and the generated indexes — so a refusal can name a file an adopter does not
think of as content.

No behaviour changed.
