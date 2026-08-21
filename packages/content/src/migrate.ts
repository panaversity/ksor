/**
 * Forward migrations for the content schema.
 *
 * `schema/schema.sql` provisions a FRESH database at the current version and
 * stays the DDL source of truth (decision 12). This module is the other half:
 * bringing an EXISTING database forward, which the schema file alone cannot do
 * once an adopter has rows. This closes the gap `docs/status.md` recorded as
 * "no schema migration runner ... a forward-migration path is owed" — an entry
 * that now reads "Schema migrations — DONE", so the quotation is history rather
 * than a live citation (round-9 review of PR 43).
 *
 * A migration names BOTH ends of the step it performs:
 * `schema/migrations/<from>-<to>__<slug>.sql`. Encoding only the target would
 * make "2.2 never existed" and "the 2.2 migration is missing" indistinguishable
 * from the directory listing, and the second silently skips a schema change —
 * the one failure a system of record cannot afford. With both ends recorded the
 * chain is walked, not sorted, so a gap is a refusal instead of a skip.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

import { withGuardedClient } from "@panaversity/ksor-postgres";

const NAME = /^(\d+(?:\.\d+)*)-(\d+(?:\.\d+)*)__([a-z0-9][a-z0-9-]*)\.sql$/;

export interface MigrationName {
  readonly from: string;
  readonly to: string;
  readonly slug: string;
}

export interface Migration extends MigrationName {
  readonly filename: string;
}

/** Numeric, component-wise: 10.0 is ABOVE 2.3, which a string compare inverts. */
export function compareSchemaVersion(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function migrationFilename(from: string, to: string, slug: string): string {
  return `${from}-${to}__${slug}.sql`;
}

export function parseMigrationName(filename: string): MigrationName {
  const m = NAME.exec(filename);
  if (m === null) {
    throw new Error(
      `not a migration filename: ${JSON.stringify(filename)} — ` +
        "migrations are named <from>-<to>__<slug>.sql, e.g. 2.1-2.2__governance-on-the-node-row.sql",
    );
  }
  const [, from, to, slug] = m as unknown as [string, string, string, string];
  if (compareSchemaVersion(from, to) >= 0) {
    throw new Error(
      `migration ${JSON.stringify(filename)} does not move forward: ${from} -> ${to}`,
    );
  }
  return { from, to, slug };
}

/**
 * The ordered steps that take `current` to `required`, walked through the chain
 * rather than sorted, so a missing step refuses instead of being skipped.
 * Empty when the database is already at — or ahead of — the required version:
 * a newer writer having run is not this build's problem to fix, and
 * `assertSchemaCompatible` already allows a forward-compatible reader.
 */
export function planMigrations(
  current: string,
  filenames: readonly string[],
  required: string,
): Migration[] {
  if (compareSchemaVersion(current, required) >= 0) return [];

  const byFrom = new Map<string, Migration>();
  for (const filename of filenames) {
    const parsed = parseMigrationName(filename);
    const existing = byFrom.get(parsed.from);
    if (existing !== undefined) {
      throw new Error(
        `duplicate migration from ${parsed.from}: ${existing.filename} and ${filename} — ` +
          "the chain must have exactly one step out of each version",
      );
    }
    byFrom.set(parsed.from, { ...parsed, filename });
  }

  const plan: Migration[] = [];
  let at = current;
  while (compareSchemaVersion(at, required) < 0) {
    const step = byFrom.get(at);
    if (step === undefined) {
      throw new Error(
        `no migration from ${at} — the database is at ${current} and this build requires ` +
          `${required}, but schema/migrations/ has no step out of ${at}. Applying a later step ` +
          "would skip whatever this one did; refusing.",
      );
    }
    if (compareSchemaVersion(step.to, required) > 0) {
      throw new Error(
        `migration ${step.filename} would overshoot: it takes the database to ${step.to}, ` +
          `past the ${required} this build knows how to read.`,
      );
    }
    plan.push(step);
    at = step.to;
  }
  return plan;
}

export function migrationsDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "schema", "migrations");
}

export interface MigrationReport {
  readonly from: string;
  readonly to: string;
  readonly applied: readonly string[];
}

/**
 * Apply the planned steps, each in its OWN transaction together with the
 * `schema_meta` row that records it — so an interrupted run leaves the database
 * at a version that is true, never half-migrated with a stale version claim.
 */
export async function runMigrations(
  pool: pg.Pool,
  current: string,
  required: string,
  options: { dir?: string; read?: (file: string) => string } = {},
): Promise<MigrationReport> {
  const dir = options.dir ?? migrationsDir();
  const read = options.read ?? ((file: string): string => readFileSync(file, "utf8"));
  const { readdirSync } = await import("node:fs");
  const filenames = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const plan = planMigrations(current, filenames, required);

  const applied: string[] = [];
  for (const step of plan) {
    const sql = read(path.join(dir, step.filename));
    // Guarded checkout: a connection dying mid-migration must reject, not
    // become an uncaught 'error' on a listener-less client (see
    // withGuardedClient in @panaversity/ksor-postgres).
    const outcome = await withGuardedClient(pool, async (client) => {
      try {
        await client.query("BEGIN");
        // search_path is bound here for the same reason every other transaction
        // binds it: unqualified DDL must not resolve against whatever the role's
        // default happens to be. scopedTxn is not used because a migration must
        // NOT run as the ingest role — it is DDL, executed by the applying user.
        await client.query("SELECT set_config('search_path', 'public', true)");
        // One migration at a time. Without this, two concurrent
        // `ksor schema --apply` runs both read the old version, both apply the
        // step, and both insert a schema_meta row — the second failing
        // mid-DDL against objects the first just created (review of PR #43).
        // Transaction-scoped, so it releases with the COMMIT or the ROLLBACK.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          "ksor-schema-migrate",
        ]);
        // Re-read INSIDE the lock. The plan was computed before waiting for it,
        // so a concurrent run may have already applied this exact step; a
        // second application only survives today because both shipped
        // migrations happen to be idempotent (round-1 review of #43).
        const current = await client.query(
          "SELECT schema_version FROM schema_meta ORDER BY applied_at DESC LIMIT 1",
        );
        // Carried forward with the NUMERIC comparison this module exists to
        // provide: SQL's min() on TEXT is lexicographic, so 10.0 would sort
        // below 2.0 — the exact bug compareSchemaVersion is here to avoid
        // (round-3 review of #43).
        const seen = await client.query("SELECT compatible_from FROM schema_meta");
        const compatibleFrom = seen.rows
          .map((r: { compatible_from: string }) => String(r.compatible_from))
          .filter((v) => v !== "")
          .reduce((lowest, v) => (compareSchemaVersion(v, lowest) < 0 ? v : lowest), step.from);
        const at = String(
          (current.rows[0] as { schema_version?: string } | undefined)?.schema_version ?? "",
        );
        if (at !== step.from) {
          await client.query("COMMIT");
          return "skipped";
        }
        await client.query(sql);
        await client.query(
          // compatible_from is the range this SCHEMA supports, not the version
          // we came from: recording step.from made a migrated database claim a
          // narrower range than a freshly provisioned one, so the two were no
          // longer equivalent (review of PR #43). Carry forward what the
          // database already records.
          "INSERT INTO schema_meta (schema_version, compatible_from) VALUES ($1, $2)",
          [step.to, compatibleFrom],
        );
        await client.query("COMMIT");
        return "applied";
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // the connection is gone; the original error is the one that matters
        }
        throw error;
      }
    });
    if (outcome === "applied") applied.push(step.filename);
  }
  return { from: current, to: plan.at(-1)?.to ?? current, applied };
}
