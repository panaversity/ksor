/**
 * A migrated database and a fresh one must be the SAME database.
 *
 * `schema.sql` is the DDL source of truth for a fresh database and
 * `schema/migrations/` brings an existing one forward (decision 16). Nothing
 * held the two outputs together: `migrate.db.test.ts` asserts the new columns
 * by NAME only, so a constraint the migration adds and the schema file does not
 * — or the reverse — is a second schema that no suite runs against. Every
 * guarantee in this kernel is SQL, so "the adopter who upgraded" and "the
 * adopter who started today" would be running different guarantees.
 *
 * This builds both and diffs them: columns, constraints, indexes, RLS policies
 * and their force flags, table privileges, triggers, and the `schema_meta`
 * range. Two things are deliberately NOT compared, and the reasons are the
 * point:
 *
 *   ordinal position   `ALTER TABLE ... ADD COLUMN` appends, and there is no
 *                      SQL that inserts a column in the middle. A migrated
 *                      2.5 therefore CANNOT match a fresh one's column order,
 *                      and no predicate in this kernel reads one — every
 *                      statement names its columns. Comparing sets is the
 *                      strongest claim that is also achievable.
 *
 *   column comments    `COMMENT ON` in a migration documents the STEP; the
 *                      same column's comment in `schema.sql` documents the
 *                      shape. They are prose for a human reading `\d+`, read
 *                      by nothing.
 */

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "./migrate.js";
import { applySchema, schemaVersion } from "./schema.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const FRESH_DB = `ksor_parity_fresh_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
const MIGRATED_DB = `ksor_parity_migrated_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;

/** What 2.2 added to `content_nodes` and 2.5 still carries. */
const V22_NODE_COLUMNS = ["corpus_id", "doc_status", "owner", "provenance", "superseded_by"];
/** What 2.5 added to `content_nodes`. */
const V25_NODE_COLUMNS = [
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

/**
 * Each probe reads ONE kind of catalog fact as key → value, so a divergence
 * names the object it is about rather than a row number in a dump.
 */
const PROBES = {
  columns: `SELECT table_name || '.' || column_name AS k,
                   data_type || ' | udt=' || udt_name || ' | null=' || is_nullable
                     || ' | default=' || coalesce(column_default, '-') AS v
              FROM information_schema.columns WHERE table_schema = 'public'`,
  constraints: `SELECT conrelid::regclass::text || '.' || conname AS k,
                       pg_get_constraintdef(oid) AS v
                  FROM pg_constraint WHERE connamespace = 'public'::regnamespace`,
  indexes: `SELECT indexname AS k, indexdef AS v FROM pg_indexes WHERE schemaname = 'public'`,
  policies: `SELECT tablename || '.' || policyname AS k,
                    cmd || ' | roles=' || array_to_string(roles, ',')
                      || ' | using=' || coalesce(qual, '-')
                      || ' | check=' || coalesce(with_check, '-') AS v
               FROM pg_policies WHERE schemaname = 'public'`,
  rowSecurity: `SELECT relname AS k,
                       'enabled=' || relrowsecurity::text || ' force=' || relforcerowsecurity::text AS v
                  FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`,
  privileges: `SELECT grantee || ' -> ' || table_name || '.' || privilege_type AS k, 'granted' AS v
                 FROM information_schema.role_table_grants WHERE table_schema = 'public'`,
  triggers: `SELECT tgrelid::regclass::text || '.' || tgname AS k, pg_get_triggerdef(oid) AS v
               FROM pg_trigger WHERE NOT tgisinternal`,
  // The CURRENT row only. `schema_meta` is a history, so a migrated database
  // legitimately holds a row per step it walked and a fresh one holds exactly
  // one — the claim is that both end up declaring the same version and the same
  // compatibility range, not that they remember the same journey.
  schemaMeta: `SELECT 'current' AS k,
                      schema_version || ' | compatible_from=' || compatible_from AS v
                 FROM schema_meta ORDER BY applied_at DESC, ctid DESC LIMIT 1`,
} as const;

type ProbeName = keyof typeof PROBES;

describe.runIf(adminDsn !== "")(
  "a migrated database is the same database as a fresh one (db)",
  () => {
    let admin: pg.Pool;
    let fresh: pg.Pool;
    let migrated: pg.Pool;
    let applied: readonly string[] = [];

    const dsnFor = (db: string): string => {
      const url = new URL(adminDsn);
      url.pathname = `/${db}`;
      return url.toString();
    };

    const create = async (db: string): Promise<pg.Pool> => {
      const { Pool } = (await import("pg")).default;
      await admin.query(`CREATE DATABASE ${db}`);
      const pool = new Pool({ connectionString: dsnFor(db) });
      await applySchema(pool, 1536);
      return pool;
    };

    beforeAll(async () => {
      const { Pool } = (await import("pg")).default;
      admin = new Pool({ connectionString: adminDsn });
      fresh = await create(FRESH_DB);
      migrated = await create(MIGRATED_DB);

      // Wind the second one back to the 2.1 shape an existing adopter has, then
      // walk it forward through the SHIPPED chain. Same recipe as
      // migrate.db.test.ts — deliberately, because a rewind that diverged from
      // that one would be measuring a database no adopter has.
      await migrated.query(
        `ALTER TABLE content_nodes ${[...V22_NODE_COLUMNS, ...V25_NODE_COLUMNS]
          .map((c) => `DROP COLUMN ${c}`)
          .join(", ")}`,
      );
      await migrated.query("DROP INDEX IF EXISTS idx_nodes_audience");
      await migrated.query(
        "ALTER TABLE ingestion_runs DROP COLUMN build_id, DROP COLUMN policy," +
          " DROP COLUMN policy_sha256, DROP COLUMN ledger_ids, DROP COLUMN schema_version",
      );
      await migrated.query(
        "ALTER TABLE takedown_denylist DROP COLUMN ledger_id, DROP COLUMN actor," +
          " DROP COLUMN applied_at, DROP COLUMN revoked_ledger_id, DROP COLUMN revoked_at, DROP COLUMN expected",
      );
      await migrated.query("ALTER TABLE sources DROP COLUMN frontmatter");
      await migrated.query("DROP POLICY IF EXISTS takedown_write ON takedown_denylist");
      await migrated.query("DROP POLICY IF EXISTS tenant_read ON retrieval_log");
      await migrated.query(
        "REVOKE INSERT, UPDATE, DELETE ON takedown_denylist FROM sor_content_ingest",
      );
      await migrated.query("DROP OWNED BY sor_content_auditor").catch(() => undefined);
      await migrated.query("DROP ROLE IF EXISTS sor_content_auditor").catch(() => undefined);
      await migrated.query("DELETE FROM schema_meta");
      await migrated.query(
        "INSERT INTO schema_meta (schema_version, compatible_from) VALUES ('2.1', '2.0')",
      );

      const report = await runMigrations(migrated, "2.1", schemaVersion());
      applied = report.applied;
    }, 180_000);

    afterAll(async () => {
      await fresh?.end().catch(() => undefined);
      await migrated?.end().catch(() => undefined);
      for (const db of [FRESH_DB, MIGRATED_DB]) {
        await admin?.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => undefined);
      }
      await admin?.end().catch(() => undefined);
    });

    it("walked the whole shipped chain to get here", () => {
      // If the rewind missed something the chain no-ops and this suite compares a
      // fresh database against itself — green, and proving nothing.
      expect(applied.length, `applied: ${applied.join(", ")}`).toBe(4);
    });

    const read = async (pool: pg.Pool, probe: ProbeName): Promise<Map<string, string>> => {
      const r = await pool.query<{ k: string; v: string }>(PROBES[probe]);
      return new Map(r.rows.map((row) => [row.k, String(row.v)]));
    };

    const diff = async (probe: ProbeName): Promise<string[]> => {
      const a = await read(fresh, probe);
      const b = await read(migrated, probe);
      const out: string[] = [];
      for (const k of [...new Set([...a.keys(), ...b.keys()])].sort()) {
        if (a.get(k) === b.get(k)) continue;
        out.push(
          `${k}\n     fresh: ${a.get(k) ?? "(absent)"}\n  migrated: ${b.get(k) ?? "(absent)"}`,
        );
      }
      return out;
    };

    /**
     * The one difference that is REAL and tolerated, asserted rather than
     * assumed. Saying "ordinals cannot match" in a comment and then not
     * comparing them leaves a reader unable to tell a deliberate exclusion from
     * an oversight — and if they ever DID match, the rewind above stopped
     * exercising the migration and every other case here is vacuous.
     */
    it("differs on column ORDER, and only on column order", async () => {
      const ordinals = `SELECT table_name || '.' || column_name AS k, ordinal_position::text AS v
                          FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'content_nodes'`;
      const a = await fresh.query<{ k: string; v: string }>(ordinals);
      const b = new Map(
        (await migrated.query<{ k: string; v: string }>(ordinals)).rows.map((r) => [r.k, r.v]),
      );
      const moved = a.rows.filter((r) => b.get(r.k) !== r.v).map((r) => r.k);
      expect(
        moved.length,
        "ALTER TABLE appends, so a migrated governance column cannot land where schema.sql puts it",
      ).toBeGreaterThan(0);
    });

    for (const probe of Object.keys(PROBES) as ProbeName[]) {
      it(`agrees on ${probe}`, async () => {
        expect(await diff(probe), `fresh vs migrated ${probe}`).toEqual([]);
      });
    }
  },
);

describe.runIf(adminDsn === "")("schema parity (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
