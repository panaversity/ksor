/**
 * Two applies at once must both succeed.
 *
 * `schema.sql` creates three roles, and roles are CLUSTER-GLOBAL — so
 * `IF NOT EXISTS ... THEN CREATE ROLE` is check-then-act across every database
 * on the instance. Two concurrent runs both see the role absent and both create
 * it. Measured on Postgres 17.7 before the fix: six concurrent applies against
 * an empty cluster, FIVE failed.
 *
 * It is not only a test-tier problem, which is why this lives beside the schema
 * rather than in a harness: `ksor schema --apply` runs the same DDL, so two
 * operators provisioning at once, or a deploy step racing a developer, hit it
 * identically (issue #166).
 *
 * The SQLSTATE that surfaces is `unique_violation` (23505) on
 * `pg_authid_rolname_index`, NOT `duplicate_object` (42710). That matters
 * because catching only `duplicate_object` is the obvious fix and does not
 * work — which is what this test is here to keep true.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { randomBytes } from "node:crypto";
import pg from "pg";

import { applySchema } from "./schema.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";

/**
 * Scratch databases for this suite: named so a leaked one is obviously ours,
 * UNIQUE per run, and stamped with the instant they were made. Fixed names
 * would have made this suite the thing it is testing for — two concurrent
 * `pnpm test:db` runs force-dropping each other's databases mid-apply, which is
 * issue #166's own symptom. The stamp is what lets `scripts/db-reaper.ts` drop
 * these if the run is interrupted before the `finally` below.
 */
const scratchName = (n: number): string =>
  `ksor_role_race_${n}_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;

/** The admin DSN with its database swapped — `pg` has no API for this. */
function dsnFor(dsn: string, database: string): string {
  const url = new URL(dsn);
  url.pathname = `/${database}`;
  return url.toString();
}

/** The roles `schema.sql` creates, in the order it creates them. */
const ROLES = ["sor_content_runtime", "sor_content_ingest", "sor_content_auditor"] as const;

describe.runIf(adminDsn !== "")("applying the schema concurrently (db)", () => {
  let admin: pg.Pool;
  /** Set when the roles could not be removed, which makes the race unreachable. */
  let unreachable = "";

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
    try {
      // The race only exists while the roles are ABSENT. Dropping them fails if
      // anything in the cluster still holds a grant, which is a real state on a
      // shared instance — so it is a skip with a stated reason, never a silent
      // pass on a test that proved nothing.
      await admin.query(`DROP ROLE IF EXISTS ${ROLES.join(", ")}`);
    } catch (error) {
      unreachable = error instanceof Error ? error.message : String(error);
    }
  }, 60_000);

  afterAll(async () => {
    await admin?.end();
  });

  it("six simultaneous applies all succeed, and every role exists after", async (ctx) => {
    if (unreachable !== "") {
      // A REAL skip, not a passing assertion. The race only exists while the
      // roles are absent, and they cannot be dropped while any database in the
      // cluster holds a grant — which is the normal state on a developer box
      // that has run this tier before. Reported as skipped so it can never read
      // as "the fix works"; CI gets a fresh service container, where it runs.
      ctx.skip(`the roles could not be dropped, so the race is unreachable: ${unreachable}`);
      return;
    }

    // Six SEPARATE DATABASES, one apply each — which is the real shape: two
    // `pnpm test:db` runs, or two operators provisioning, each own their
    // database and share only the cluster-global roles. Racing six applies
    // against ONE database instead races too — on `pg_extension_name_index`
    // first (`CREATE EXTENSION IF NOT EXISTS vector` is check-then-act as well),
    // then on `pg_type_typname_nsp_index`, since every CREATE TABLE makes a row
    // type. Those are different races and not ones `applySchema` promises to
    // survive: its contract is "a fresh database".
    const names = Array.from({ length: 6 }, (_unused, i) => scratchName(i));
    for (const name of names) {
      await admin.query(`CREATE DATABASE ${name}`);
    }
    const pools = names.map(
      (name) => new pg.Pool({ connectionString: dsnFor(adminDsn, name), max: 1 }),
    );
    try {
      const results = await Promise.allSettled(pools.map((pool) => applySchema(pool, 1536)));
      const rejected = results.flatMap((r) =>
        r.status === "rejected"
          ? [r.reason instanceof Error ? r.reason.message : String(r.reason)]
          : [],
      );
      expect(
        rejected,
        `${rejected.length}/${pools.length} applies failed: ${rejected.join(" | ")}`,
      ).toEqual([]);

      // The apply that LOST the race must still have created the roles it did
      // not create itself — three separate blocks, so a loser on the first does
      // not abandon the other two and leave the GRANTs below pointing at
      // nothing.
      const present = await admin.query<{ rolname: string }>(
        "SELECT rolname FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname",
        [[...ROLES]],
      );
      expect(
        present.rows.map((r) => r.rolname),
        "every role the DDL grants against must exist after the race",
      ).toEqual([...ROLES].sort());
    } finally {
      await Promise.all(pools.map((pool) => pool.end()));
      for (const name of names) {
        // Guarded like every other drop in this tier: a failed cleanup must not
        // replace the assertion's own failure with its own.
        await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => undefined);
      }
    }
  }, 120_000);
});
