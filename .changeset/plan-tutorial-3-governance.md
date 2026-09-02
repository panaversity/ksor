---
"@panaversity/ksor": patch
---

Tutorial 3, _Governance in practice_ (`docs/tutorials/03-governance-in-practice.md`), walked end to end on a scaffold with no database and no key and pasted as it ran: a second audience (`internal`) and what the public and employee site builds each put in `llms.txt`; a `verified` entry and the trust tier it moves; `ksor.effective_from` and `stale_after` under `ksor build --as-of`, with the lock diffed at one instant twice and at two instants; a deprecated document and its successor as the page shows them; a takedown written to the ledger with `--file-only`, the `ksor-takedown-dangling` refusal on a renamed file, and a revocation. Eleven refusals fire on the way, each shown with its why and fix.

Two tests grow with it: `skill-triggers.integration.test.ts` accounts for every prompt the tutorial gives (one fires `add-sources`; the rest are governance acts no skill mediates), and `docs-truth.integration.test.ts` holds the new file to the rule that a printed `build_id` says what moves it.
