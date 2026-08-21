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

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readdirSync } from "node:fs";

import {
  compareSchemaVersion,
  migrationsDir,
  parseMigrationName,
  planMigrations,
  runMigrations,
} from "./migrate.js";
import { applySchema, schemaVersion } from "./schema.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_migrate_test";
const TENANT = "migrate-corp";

const NEW_COLUMNS = [
  "corpus_id",
  "visibility",
  "doc_status",
  "owner",
  "provenance",
  "superseded_by",
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
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB}`);
    const dsn = new URL(adminDsn);
    dsn.pathname = `/${DB}`;
    pool = new Pool({ connectionString: dsn.toString() });
    await applySchema(pool, 1536);

    // Wind the database BACK to 2.1: drop what 2.2 added and restate the
    // version, so the migration runs against the shape an existing adopter has.
    await pool.query(
      `ALTER TABLE content_nodes ${NEW_COLUMNS.map((c) => `DROP COLUMN ${c}`).join(", ")}`,
    );
    await pool.query("DROP INDEX IF EXISTS idx_nodes_visibility");
    // …and back past 2.3 and 2.4 too, or those steps run against a database
    // that ALREADY has what they add. Every migration file is idempotent
    // (`ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS`, role guards), so
    // they succeeded while doing NOTHING — and `applied.length > 0` could not
    // tell one step from three. Replacing the whole 2.3 -> 2.4 file with
    // `SELECT 1;` left the db tier green four runs in a row, which is exactly
    // the "a missing step silently skips a schema change" failure decision 16
    // names (round-8 review of #43).
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

  it("migrates 2.1 -> the version this build requires, and records each step", async () => {
    const required = schemaVersion();
    expect(compareSchemaVersion("2.1", required)).toBeLessThan(0);

    const report = await runMigrations(pool, "2.1", required);
    expect(report.from).toBe("2.1");
    expect(report.to).toBe(required);
    // The COUNT, not "more than zero": the chain is 2.1 -> 2.2 -> 2.3 -> 2.4,
    // and a step that quietly does nothing is the failure this walk exists to
    // catch. Update this number when a migration is added — deliberately, so
    // adding one is a decision and not a drift.
    expect(report.applied.length, `applied: ${report.applied.join(", ")}`).toBe(3);
    expect(await version()).toBe(required);
  });

  it("each step actually did its work — not just reported success", async () => {
    // Every migration file is idempotent, so "it ran" and "it changed
    // something" are different claims. Assert one artifact per step.
    const has = async (sql: string, params: unknown[]): Promise<boolean> =>
      (await pool.query(sql, params)).rowCount !== 0;

    expect(
      await has(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'content_nodes' AND column_name = 'visibility'",
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

  it("is idempotent — a second run at the current version does nothing", async () => {
    const required = schemaVersion();
    const again = await runMigrations(pool, required, required);
    expect(again.applied).toEqual([]);
    expect(await version()).toBe(required);
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
