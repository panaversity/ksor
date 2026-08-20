/**
 * Ingest authorization (specs/ksor/grant/spec.md).
 *
 * The row in `ingest_tenant_grants` IS the authorization: row-level security
 * refuses every write to a tenant's corpus without it, and a CLI flag is not
 * authorization. This module performs that act through `pg` — the same driver
 * every other verb uses — so finishing setup never requires dropping out of
 * ksor into `psql`.
 *
 * Deliberately NOT folded into `schema --apply`: applying DDL and authorizing
 * writes are different acts, routinely by different people with different
 * database privileges, and a schema step that granted itself write access
 * would make the tool its own authorizer.
 */

import type pg from "pg";

import { INGEST_ROLE } from "./db.js";

/** What the act established — reported, never merely "ok". */
export type GrantOutcome = "granted" | "already-granted" | "revoked" | "not-granted";

/** The corpus schema has not been applied, so there is no grant table yet. */
export class SchemaNotAppliedError extends Error {
  constructor() {
    super(
      "the corpus schema is not applied to this database, so there is no grant table to write\n" +
        "  why: authorization lives in the schema's own table — it cannot be granted before the DDL exists\n" +
        "  fix: run `ksor schema --instance <instance.md> --apply`, then grant",
    );
    this.name = "SchemaNotAppliedError";
  }
}

/** Postgres: relation does not exist. */
const UNDEFINED_TABLE = "42P01";

function rethrow(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === UNDEFINED_TABLE
  ) {
    throw new SchemaNotAppliedError();
  }
  throw error;
}

/**
 * Authorize ingest for `tenantId`. Idempotent: granting an existing grant is
 * success, reported as `already-granted`.
 */
export async function grantIngest(pool: pg.Pool, tenantId: string): Promise<GrantOutcome> {
  try {
    const result = await pool.query(
      "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [INGEST_ROLE, tenantId],
    );
    return result.rowCount === 0 ? "already-granted" : "granted";
  } catch (error) {
    rethrow(error);
  }
}

/**
 * Withdraw ingest authorization for `tenantId`. Idempotent: revoking an absent
 * grant is success, reported as `not-granted`. A grant primitive that cannot
 * revoke is incomplete.
 */
export async function revokeIngest(pool: pg.Pool, tenantId: string): Promise<GrantOutcome> {
  try {
    const result = await pool.query(
      "DELETE FROM ingest_tenant_grants WHERE role_name = $1 AND tenant_id = $2",
      [INGEST_ROLE, tenantId],
    );
    return result.rowCount === 0 ? "not-granted" : "revoked";
  } catch (error) {
    rethrow(error);
  }
}
