/**
 * The forward-migration path, against a real database.
 *
 * Before this there was none: `schema.sql` provisioned a fresh database and the
 * documented remedy for an out-of-date one was "drop and recreate", which
 * destroys `retrieval_log` and `takedown_denylist` — the only two tables that
 * cannot be rebuilt from markdown. These tests drive a 2.1-shaped database
 * forward to 2.2 and assert both halves: the shape changes, and the rows that
 * could not be rebuilt survive.
 */

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  compareSchemaVersion,
  migrationsDir,
  parseMigrationName,
  planMigrations,
  runMigrations,
} from "./migrate.js";
import { applySchema, schemaVersion } from "./schema.js";
import { assertGovernanceServable } from "./governance-gate.js";
import { runRead } from "./db.js";
import { AUDIENCE_ALLOWED, audienceGucs } from "./lib/audience.js";
import type { ContentInstance } from "./instance.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = `ksor_migrate_test_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
const TENANT = "migrate-corp";

/** What 2.2 added and 2.5 still carries (2.5 drops `visibility` for `audience`). */
const NEW_COLUMNS = ["corpus_id", "doc_status", "owner", "provenance", "superseded_by"];
/** What 2.5 adds to the node row (research/okf-native.md §4.1). */
const PROFILE_COLUMNS = [
  "audience",
  "sources",
  "verified",
  "generated",
  "approval",
  "deprecated",
  "effective_from",
  "stale_after",
  "trust_tier",
];

describe.runIf(adminDsn !== "")("forward migration (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;

  const columns = async (): Promise<string[]> => {
    const r = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'content_nodes'",
    );
    return r.rows.map((row: { column_name: string }) => row.column_name);
  };

  const version = async (): Promise<string> => {
    const r = await pool.query(
      "SELECT schema_version FROM schema_meta ORDER BY applied_at DESC LIMIT 1",
    );
    return String(r.rows[0].schema_version);
  };

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`CREATE DATABASE ${DB}`);
    const dsn = new URL(adminDsn);
    dsn.pathname = `/${DB}`;
    pool = new Pool({ connectionString: dsn.toString() });
    await applySchema(pool, 1536);

    // Wind the database BACK to 2.1: drop what 2.2 and 2.5 added and restate
    // the version, so the migration runs against the shape an existing adopter has.
    await pool.query(
      `ALTER TABLE content_nodes ${[...NEW_COLUMNS, ...PROFILE_COLUMNS].map((c) => `DROP COLUMN ${c}`).join(", ")}`,
    );
    await pool.query("DROP INDEX IF EXISTS idx_nodes_visibility");
    await pool.query(
      "ALTER TABLE ingestion_runs DROP COLUMN build_id, DROP COLUMN policy, DROP COLUMN policy_sha256, DROP COLUMN ledger_ids",
    );
    await pool.query(
      "ALTER TABLE takedown_denylist DROP COLUMN ledger_id, DROP COLUMN actor, DROP COLUMN applied_at, DROP COLUMN revoked_ledger_id, DROP COLUMN revoked_at, DROP COLUMN expected",
    );
    // …and back past 2.3 and 2.4 too, or those steps run against a database
    // that ALREADY has what they add. Each of the ADDITIVE steps is written so
    // that doing so is harmless (`ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF
    // EXISTS`, role guards), so they succeeded while doing NOTHING — and
    // `applied.length > 0` could not tell one step from three. Replacing the
    // whole 2.3 -> 2.4 file with `SELECT 1;` left the db tier green four runs
    // in a row, which is exactly the "a missing step silently skips a schema
    // change" failure decision 16 names (round-8 review of #43).
    //
    // Do NOT read that as "every migration file is idempotent", which is what
    // this comment used to say and is no longer true: 2.4 -> 2.5 MAPS a column
    // and then drops it, so its own UPDATE cannot run twice (see "the version
    // guard, not the file, is what stops a second application" below). What the
    // rewind needs is only that the steps it walks past do no harm here.
    await pool.query("ALTER TABLE ingestion_runs DROP COLUMN IF EXISTS schema_version");
    await pool.query("DROP POLICY IF EXISTS takedown_write ON takedown_denylist");
    await pool.query("DROP POLICY IF EXISTS tenant_read ON retrieval_log");
    await pool.query("REVOKE INSERT, UPDATE, DELETE ON takedown_denylist FROM sor_content_ingest");
    await pool.query("DROP OWNED BY sor_content_auditor").catch(() => undefined);
    await pool.query("DROP ROLE IF EXISTS sor_content_auditor").catch(() => undefined);
    await pool.query("DELETE FROM schema_meta");
    await pool.query(
      "INSERT INTO schema_meta (schema_version, compatible_from) VALUES ('2.1', '2.0')",
    );

    // Rows that exist BEFORE the migration, including the two kinds that no
    // re-ingest could reconstruct.
    await pool.query(
      "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 7)",
      [TENANT],
    );
    await pool.query(
      "INSERT INTO content_nodes (tenant_id, generation, stable_id, kind, slug, title)" +
        " VALUES ($1, 7, 'knowledge/pre-existing', 'document', 'pre-existing', 'Pre-existing')",
      [TENANT],
    );
    await pool.query(
      "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, scope, reason)" +
        " VALUES ($1, $1, 'knowledge/withdrawn', 'node', 'legal')",
      [TENANT],
    );
    await pool.query(
      "INSERT INTO retrieval_log (tenant_id, corpus_id, actor, action, detail)" +
        " VALUES ($1, $1, 'auditor', 'content_served', '{}'::jsonb)",
      [TENANT],
    );
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("starts from a database that genuinely lacks the 2.2 columns", async () => {
    expect(await version()).toBe("2.1");
    const before = await columns();
    for (const c of NEW_COLUMNS) expect(before, `${c} should be absent`).not.toContain(c);
  });

  it("migrates 2.1 -> 2.4, the last pre-profile shape, recording each step", async () => {
    const report = await runMigrations(pool, "2.1", "2.4");
    expect(report.from).toBe("2.1");
    expect(report.to).toBe("2.4");
    // The COUNT, not "more than zero": a step that quietly does nothing is the
    // failure this walk exists to catch.
    expect(report.applied.length, `applied: ${report.applied.join(", ")}`).toBe(3);
    expect(await version()).toBe("2.4");

    // Rows in the 2.4 shape — the ones the 2.5 step must MAP, not drop: a
    // ranked `visibility` and the three pre-profile authored statuses.
    for (const [id, visibility, docStatus] of [
      ["knowledge/approved-internal", "internal", "approved"],
      ["knowledge/in-review", "public", "review"],
      ["knowledge/superseded", null, "superseded"],
    ] as const) {
      await pool.query(
        "INSERT INTO content_nodes (tenant_id, generation, stable_id, kind, slug, title, corpus_id, visibility, doc_status)" +
          " VALUES ($1, 7, $2, 'document', $2, $2, $1, $3, $4)",
        [TENANT, id, visibility, docStatus],
      );
    }
  });

  it("migrates 2.4 -> the version this build requires (decision 16: walked, not sorted)", async () => {
    const required = schemaVersion();
    expect(compareSchemaVersion("2.4", required)).toBeLessThan(0);
    const report = await runMigrations(pool, "2.4", required);
    expect(report.applied, "exactly the 2.4 -> 2.5 step").toEqual(["2.4-2.5__okf-profile.sql"]);
    expect(await version()).toBe(required);
  });

  it("2.4 -> 2.5 maps carried rows onto the profile: visibility -> audience[], the authored status set", async () => {
    const r = await pool.query(
      "SELECT stable_id, audience, doc_status, trust_tier FROM content_nodes WHERE tenant_id = $1 ORDER BY stable_id",
      [TENANT],
    );
    const byId = new Map(r.rows.map((x: Record<string, unknown>) => [String(x.stable_id), x]));
    expect(byId.get("knowledge/approved-internal")).toMatchObject({
      audience: ["internal"],
      doc_status: "stable",
    });
    expect(byId.get("knowledge/in-review")).toMatchObject({
      audience: ["public"],
      doc_status: "draft",
    });
    expect(byId.get("knowledge/superseded")).toMatchObject({
      audience: null,
      doc_status: "deprecated",
    });
    // A carried row's trust is what the profile calls a stable, unverified concept.
    expect(byId.get("knowledge/approved-internal")?.["trust_tier"]).toBe(0);
    // A row that declared no status stays NULL, and `visibility` is gone.
    expect(byId.get("knowledge/pre-existing")?.["doc_status"]).toBeNull();
    expect(await columns()).not.toContain("visibility");
    await expect(
      pool.query("UPDATE content_nodes SET doc_status = 'approved' WHERE tenant_id = $1", [TENANT]),
      "the pre-profile status set is refused by the CHECK",
    ).rejects.toThrow(/doc_status|check/i);
  });

  it("2.4 -> 2.5 gives the run, the ledger row and the node row the profile's columns", async () => {
    const cols = async (table: string): Promise<string[]> =>
      (
        await pool.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
          [table],
        )
      ).rows.map((x: { column_name: string }) => x.column_name);
    for (const c of PROFILE_COLUMNS) expect(await columns(), c).toContain(c);
    for (const c of ["build_id", "policy", "policy_sha256", "ledger_ids"]) {
      expect(await cols("ingestion_runs"), c).toContain(c);
    }
    for (const c of ["ledger_id", "actor", "applied_at", "revoked_ledger_id", "revoked_at"]) {
      expect(await cols("takedown_denylist"), c).toContain(c);
    }
    const gin = await pool.query(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'content_nodes' AND indexname = 'idx_nodes_audience'",
    );
    expect(String(gin.rows[0]?.indexdef ?? ""), "the overlap predicate rides a GIN").toMatch(
      /gin/i,
    );
  });

  it("each step actually did its work — not just reported success", async () => {
    // Every migration file is idempotent, so "it ran" and "it changed
    // something" are different claims. Assert one artifact per step.
    const has = async (sql: string, params: unknown[]): Promise<boolean> =>
      (await pool.query(sql, params)).rowCount !== 0;

    expect(
      await has(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'content_nodes' AND column_name = 'doc_status'",
        [],
      ),
      "2.1 -> 2.2 puts governance on the node row",
    ).toBe(true);

    expect(
      await has("SELECT 1 FROM pg_policies WHERE policyname = 'takedown_write'", []),
      "2.2 -> 2.3 gives takedown a write plane",
    ).toBe(true);
    expect(
      await has("SELECT 1 FROM pg_roles WHERE rolname = 'sor_content_auditor'", []),
      "2.2 -> 2.3 gives the ledger a reader",
    ).toBe(true);

    expect(
      await has(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'ingestion_runs' AND column_name = 'schema_version'",
        [],
      ),
      "2.3 -> 2.4 stamps a generation with the schema it was built against — the column " +
        "assertGovernanceServable reads, so without it `serve` fails every boot check",
    ).toBe(true);
  });

  it("adds every governance column", async () => {
    const after = await columns();
    for (const c of NEW_COLUMNS) expect(after, `${c} should be present`).toContain(c);
  });

  it("backfills corpus_id on rows that predate the column", async () => {
    const r = await pool.query(
      "SELECT corpus_id FROM content_nodes WHERE tenant_id = $1 AND stable_id = $2",
      [TENANT, "knowledge/pre-existing"],
    );
    expect(r.rows[0].corpus_id).toBe(TENANT);
  });

  it("leaves NO index the serving predicate cannot use", async () => {
    // A btree on `visibility` cannot serve `coalesce(visibility, <runtime GUC>)`,
    // so it would be built and maintained and never read — the same defect the
    // HNSW arm was fixed for in this release. The migration drops it.
    const r = await pool.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'content_nodes'",
    );
    expect(r.rows.map((x: { indexname: string }) => x.indexname)).not.toContain(
      "idx_nodes_visibility",
    );
  });

  it("PRESERVES the two tables a drop-and-recreate would have destroyed", async () => {
    const denied = await pool.query("SELECT stable_id FROM takedown_denylist");
    expect(denied.rows.map((x: { stable_id: string }) => x.stable_id)).toEqual([
      "knowledge/withdrawn",
    ]);
    const log = await pool.query("SELECT actor FROM retrieval_log");
    expect(log.rows.map((x: { actor: string }) => x.actor)).toEqual(["auditor"]);
  });

  it("a second run at the current version plans nothing", async () => {
    const required = schemaVersion();
    const again = await runMigrations(pool, required, required);
    expect(again.applied).toEqual([]);
    expect(await version()).toBe(required);
  });

  /**
   * The contract decision 16 actually names, pinned (review 2026-08-25).
   *
   * Two files used to document a reliance on every migration FILE being
   * idempotent. It is not, and cannot be: 2.4 -> 2.5 reads `visibility` to fill
   * `audience` and then DROPS `visibility`, so its own UPDATE refuses on a
   * second run (`42703 column "visibility" does not exist`, asserted below).
   * Making a mapping step idempotent would mean wrapping every data statement
   * in an existence check — turning a readable SQL file into a DO-block
   * program — and it would buy the wrong thing anyway: an operator who runs an
   * already-applied step by hand should hear about it, not get a silent no-op
   * that leaves `schema_meta` untouched.
   *
   * What prevents a second application is the VERSION GUARD: `runMigrations`
   * re-reads `schema_meta` inside the advisory lock and returns "skipped"
   * unless the database is exactly at the step's `from`. This drives that guard
   * directly — a plan computed from a stale `current`, against a database that
   * has already passed the step, which is precisely the concurrent-runner race
   * the re-read was added for.
   */
  it("the version guard, not the file, is what stops a second application", async () => {
    const required = schemaVersion();
    expect(await version(), "the database has already passed 2.4 -> 2.5").toBe(required);

    // A plan that DOES contain the step: `current` is stale, as it is for the
    // loser of a race between two `ksor schema --apply` runs.
    const again = await runMigrations(pool, "2.4", required);
    expect(
      again.applied,
      "the step was planned and then skipped by the in-lock re-read — not re-applied",
    ).toEqual([]);
    expect(await version()).toBe(required);
  });

  it("and the guard is load-bearing: the step's own SQL refuses a second run", async () => {
    // Applied RAW, with no guard in front of it, so the assertion is about the
    // FILE. If this ever stops throwing, the file became idempotent and the
    // comments above (and in migrate.ts) are the thing to correct.
    const sql = readFileSync(join(migrationsDir(), "2.4-2.5__okf-profile.sql"), "utf8");
    await expect(
      pool.query(sql),
      "2.4 -> 2.5 maps `visibility` into `audience` and then drops it",
    ).rejects.toThrow(/visibility/);
  });

  /**
   * The migration header claims that until a re-ingest widens the audience
   * lists, "a pre-2.5 generation refuses to serve (GOVERNANCE_SINCE), so no
   * viewer is answered from a half-mapped row" — and nothing exercised that
   * against an actually-migrated database. `governance-gate.db.test.ts` proves
   * the gate with a hand-seeded run row; this proves the STATE a real migration
   * leaves behind reaches it (review 2026-08-25, finding 37).
   */
  it("the migrated record REFUSES to serve — the header's claim, on the real artifact", async () => {
    const instance = { tenantId: TENANT, corpusId: TENANT } as ContentInstance;
    await expect(assertGovernanceServable(pool, instance)).rejects.toThrow(
      /generation 7 was built against schema .*older than 2\.5/s,
    );
  });

  /**
   * …and the mapping itself, read by the predicate that decides who is served
   * rather than by a SELECT of the column. `visibility: internal` became
   * `audience: {internal}`, and that is what "this row is internal" MEANS on
   * the serving side.
   */
  it("the mapped audience drives the SERVING predicate, not just the column", async () => {
    const visibleTo = async (viewer: readonly string[]): Promise<string[]> =>
      runRead(
        pool,
        TENANT,
        async (c) =>
          (
            await c.query(
              `SELECT n.stable_id FROM content_nodes n WHERE n.tenant_id = $1 AND ${AUDIENCE_ALLOWED} ORDER BY n.stable_id`,
              [TENANT],
            )
          ).rows.map((r: { stable_id: string }) => r.stable_id),
        audienceGucs(viewer),
      );

    expect(await visibleTo(["public"])).toEqual(["knowledge/in-review"]);
    expect(await visibleTo(["public", "internal"])).toEqual([
      "knowledge/approved-internal",
      "knowledge/in-review",
    ]);
    // The rows that declared nothing stay invisible to everyone: the migration
    // maps what was declared and invents nothing (`audience` NULL overlaps no list).
    expect(await visibleTo(["public", "internal"])).not.toContain("knowledge/superseded");
    expect(await visibleTo(["public", "internal"])).not.toContain("knowledge/pre-existing");
  });

  it("the SHIPPED chain reaches the version schema.sql declares, from every step in it", () => {
    // Reads the real directory, not a fixture: a chain that cannot walk from an
    // earlier release to this one is the failure this module exists to prevent,
    // and hardcoding the filenames here would hide exactly that.
    const required = schemaVersion();
    const files = readdirSync(migrationsDir()).filter((f) => f.endsWith(".sql"));
    expect(files.length, "there is at least one migration").toBeGreaterThan(0);

    for (const file of files) {
      const { from } = parseMigrationName(file);
      const plan = planMigrations(from, files, required);
      expect(plan.at(-1)?.to, `the chain from ${from} ends at ${required}`).toBe(required);
    }
  });
});

describe.runIf(adminDsn === "")("forward migration (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
