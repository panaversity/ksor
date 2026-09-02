---
"@panaversity/ksor": patch
---

Five tests now hold what they claimed. Nothing served changes; what changes is what a green run proves.

- **The audit-degraded signal is held on every serving arm, and on the wire.** `search`'s hit arm, its abstained arm, `read` and `outline` each answer `audit: "degraded"` when their §7 audit row is shed, and drop the field once it lands — asserted through real Postgres, with the landed state proven by the rows themselves. The three tool output schemas are driven with the real handlers' replies in both states, so a field the service emits and the schema refuses can no longer pass unseen.
- **Guard rule 12 evaluates each suite's own scratch-database expression** into the name it will mint and hands THAT to the reaper's parser, instead of a literal the guard wrote for itself. `randomBytes(2)` — both halves present, four hex characters where the grammar wants six — now refuses naming the evaluated name; `["ksor", …].join("_")` builders are read too.
- **`sync-status-version` refuses a prerelease by name** (`ksor-status-version-prerelease`): a snapshot such as `0.0.1-dev-…` never reaches `docs/status.md`, which names only what a plain `npm install` resolves. Its core is a pure function with a colocated unit test.
- **`probe-deadline` runs on a fake clock in the unit tier** — the file went from 8.2s to 0.3s and the tier from 11.6s to 4.1s — and asserts the deadline fires AT the budget rather than within two seconds of it. One real-clock case, a pool against a socket that accepts and never speaks, lives in the db tier.
- **Every `KSOR_E2E`-gated browser suite says how to run it** — the playwright install from `packages/ksor`, then the `KSOR_E2E=1` command — and a root `pnpm test:e2e` runs all three.
