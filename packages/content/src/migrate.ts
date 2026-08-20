/**
 * Forward migrations for the content schema.
 *
 * `schema/schema.sql` provisions a FRESH database at the current version and
 * stays the DDL source of truth (decision 12). This module is the other half:
 * bringing an EXISTING database forward, which the schema file alone cannot do
 * once an adopter has rows. The recorded gap — "no schema migration runner ...
 * before adopters do, a forward-migration path is owed" (docs/status.md) — is
 * this.
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
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_meta (schema_version, compatible_from) VALUES ($1, $2)",
        [step.to, step.from],
      );
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // the connection is gone; the original error is the one that matters
      }
      throw error;
    } finally {
      client.release();
    }
    applied.push(step.filename);
  }
  return { from: current, to: plan.at(-1)?.to ?? current, applied };
}
