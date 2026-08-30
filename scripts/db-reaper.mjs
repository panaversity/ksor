/**
 * Drop the scratch databases an INTERRUPTED db-tier run left behind.
 *
 * Vitest `globalSetup` for `vitest.db.config.ts`, so it runs once before the
 * tier and never during it.
 *
 * Why this exists at all: every `.db.test.ts` now bootstraps a database under a
 * name unique to its run (guard rule 12), which is what stops two runs against
 * one cluster from dropping each other's database `WITH (FORCE)` mid-INSERT —
 * the failure issue #166 opens with, and the one the fixed names caused. But
 * unique names alone would trade a visible failure for an invisible one: a run
 * killed with Ctrl-C never reaches its `afterAll`, and the database it made
 * stays on the cluster forever under a name nothing will ever reuse. So the
 * rename and the reaper land together; either half on its own is worse than
 * neither.
 *
 * Three conditions before anything is dropped, because a drop is not
 * recoverable:
 *
 *   1. the name parses as the scratch grammar, timestamp and all
 *      (`parseScratchName` — `ksor_` on its own is NOT evidence);
 *   2. that timestamp is at least REAP_AFTER_MS old, so a database a
 *      concurrent run created seconds ago and has not connected to yet is
 *      never a candidate;
 *   3. Postgres reports no backends on it — checked, and then relied on by
 *      dropping WITHOUT (FORCE), so a connection that arrives in between makes
 *      the drop fail rather than making it kill somebody's work.
 *
 * Failures here are reported and swallowed. The reaper is housekeeping: a
 * cluster that will not let us tidy up is not a reason to refuse to run the
 * tests, and the tests themselves say plainly enough when the database is
 * unusable.
 */

import { createRequire } from "node:module";

import { REAP_AFTER_MS, parseScratchName } from "./lib/db-scratch.mjs";

// `pg` is a dependency of ksor-postgres, not of the root workspace, and pnpm's
// strict layout means the root cannot resolve it. Anchoring `require` at that
// package's manifest borrows its resolution without adding a root devDependency
// for a housekeeping script.
const require = createRequire(new URL("../packages/postgres/package.json", import.meta.url));

export async function setup() {
  const adminDsn = process.env["KSOR_DB_URL"] ?? "";
  if (adminDsn === "") return;

  /** @type {import("pg")} */
  const pg = require("pg");
  const admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
  try {
    const { rows } = await admin.query(
      `SELECT d.datname AS name,
              (SELECT count(*)::int FROM pg_stat_activity a WHERE a.datname = d.datname) AS backends
         FROM pg_database d
        WHERE d.datname LIKE 'ksor\\_%' AND NOT d.datistemplate`,
    );
    const now = Date.now();
    const dropped = [];
    const skipped = [];
    for (const row of rows) {
      const parsed = parseScratchName(row.name, now);
      if (parsed === null) continue;
      const ageMs = now - parsed.createdAtMs;
      if (ageMs < REAP_AFTER_MS) continue;
      if (row.backends > 0) {
        skipped.push(`${row.name} (${row.backends} connection(s))`);
        continue;
      }
      try {
        // No (FORCE): if something connected between the count above and here,
        // this must fail rather than terminate it.
        await admin.query(`DROP DATABASE ${row.name}`);
        dropped.push(row.name);
      } catch (error) {
        skipped.push(`${row.name} (${error instanceof Error ? error.message : String(error)})`);
      }
    }
    if (dropped.length > 0) {
      console.log(
        `db-reaper: dropped ${dropped.length} scratch database(s) left by an interrupted run: ${dropped.join(", ")}`,
      );
    }
    if (skipped.length > 0) {
      console.log(`db-reaper: left in place: ${skipped.join(", ")}`);
    }
  } catch (error) {
    console.warn(
      `db-reaper: could not sweep stale scratch databases — ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await admin.end().catch(() => undefined);
  }
}
