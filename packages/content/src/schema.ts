/**
 * The DDL door (oracle SC/schema.py): `schema/schema.sql` is both a plain
 * valid SQL file at the shipped dimension and a template. A different
 * embedding space is a NEW database (one database = one embedding space) —
 * fresh DDL is rendered from the instance that will fill it, never
 * hand-edited.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

import { EMBED_DIM } from "./config.js";
import { ContentStoreError } from "./db.js";

/** pgvector vector + HNSW ceiling. */
export const EMBED_DIM_MAX = 2000;

/** The schema version schema.sql declares — parsed from the DDL so code and
 * the applied database share ONE source (a drift test pins the coupling). */
export function schemaVersion(): string {
  const text = readFileSync(schemaSqlPath(), "utf8");
  const m = /INSERT INTO schema_meta\s*\([^)]*\)\s*VALUES\s*\(\s*'([^']+)'/i.exec(text);
  if (m === null) {
    throw new Error(
      "schema.sql declares no schema_meta version — cannot determine the required version",
    );
  }
  return m[1]!;
}

function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * A database whose schema is missing or older than this build requires.
 * Subclasses ContentStoreError so the gateway's exit contract classifies it
 * exit 3, but with its OWN constructor: ContentStoreError wraps its argument in
 * "content store temporarily unavailable (…)", which would tell the operator to
 * chase connectivity for a schema problem (review 2026-08-19). This sets the
 * remediation message verbatim.
 */
export class SchemaVersionError extends ContentStoreError {
  override readonly name: string = "SchemaVersionError";
  constructor(message: string) {
    super("schema");
    this.message = message;
  }
}

/**
 * The database is REACHABLE and its recorded state is wrong — a data problem
 * the operator fixes, not an outage they wait out.
 *
 * `ContentStoreError`'s constructor takes a CLASS NAME and wraps it as "content
 * store temporarily unavailable (…)", because its job is to keep driver detail
 * off the MCP wire. Passing a whole remedy to it stuffed a multi-line fix
 * inside that parenthetical and told the operator to chase connectivity — and
 * `classifyFailure` mapped it to ENVIRONMENT (exit 3) for something that will
 * never fix itself. Same shape as `SchemaVersionError` above, and for the same
 * reason (round-9 review of PR 43).
 */
export class SchemaStateError extends ContentStoreError {
  override readonly name: string = "SchemaStateError";
  constructor(message: string) {
    super("schema");
    this.message = message;
  }
}

/**
 * Refuse to serve against a database that is missing the schema OR older than
 * this build needs — fail closed at boot with a legible message. Serving never
 * migrates on its own: a newer gateway on an older/absent schema would
 * otherwise answer /live and /health while erroring PER-REQUEST on a missing
 * table or column. Moving the database forward is a deliberate operator act
 * (`ksor schema --apply`, see migrate.ts). Queried with the pool's OWN role (schema_meta has no
 * RLS) so the raw SQLSTATE is visible: a missing schema_meta table (42P01) or
 * database (3D000) is "reachable but uninitialized" — the COMMON case, and it
 * refuses. A genuine connection failure is NOT this error's concern; it
 * propagates, and the caller treats an unreachable store as a warning.
 */
export async function assertSchemaCompatible(pool: pg.Pool): Promise<void> {
  const required = schemaVersion();
  let dbVersion: string | undefined;
  try {
    const r = await pool.query(
      "SELECT schema_version FROM schema_meta ORDER BY applied_at DESC LIMIT 1",
    );
    dbVersion = (r.rows[0] as { schema_version?: string } | undefined)?.schema_version;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "42P01" || code === "3D000") {
      throw new SchemaVersionError(
        "the content schema was never applied to this database — run the schema step " +
          "(ksor schema --apply) before serving.",
      );
    }
    throw error; // a genuine connection failure — the caller treats it as unreachable
  }
  if (dbVersion === undefined) {
    throw new SchemaVersionError(
      "schema_meta is empty — this database was not initialized by the schema step.",
    );
  }
  if (compareVersion(dbVersion, required) < 0) {
    throw new SchemaVersionError(
      `database schema is ${dbVersion}; this build requires >= ${required}. ` +
        "Run `ksor schema --instance instance.md --apply` to migrate it forward — " +
        "a newer gateway on an older database errors per-request on missing columns.",
    );
  }
}

export function schemaSqlPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "schema", "schema.sql");
}

const SHIPPED_TOKEN = /\bvector\(1536\)/gi;
const COLUMN_LINE = (dim: number): RegExp =>
  new RegExp(`^\\s*embedding\\s+vector\\(${dim}\\)`, "gim");

function verifyTemplate(text: string, dim: number): void {
  // Checked on EVERY render, the shipped dimension included: exactly two
  // occurrences, both as `embedding VECTOR(...)` column definitions.
  // Comments deliberately never spell the numeral.
  const tokens = text.match(new RegExp(`\\bvector\\(${dim}\\)`, "gi")) ?? [];
  const columns = text.match(COLUMN_LINE(dim)) ?? [];
  if (tokens.length !== 2 || columns.length !== 2) {
    throw new Error(
      `schema template drift: expected the vector(${dim}) token exactly twice, both as embedding ` +
        `columns; found ${tokens.length} token(s), ${columns.length} column(s) — ` +
        "refusing to hand out half-rendered DDL",
    );
  }
}

/** The pure core: render the given template text at the given dimension. */
export function renderSchemaText(text: string, dim: number): string {
  if (!Number.isInteger(dim) || dim < 1 || dim > EMBED_DIM_MAX) {
    throw new Error(
      `dim must be an integer in 1..${EMBED_DIM_MAX} (pgvector vector + HNSW ceiling), got ${JSON.stringify(dim)}`,
    );
  }
  verifyTemplate(text, EMBED_DIM);
  if (dim === EMBED_DIM) return text; // byte-for-byte, test-pinned
  const rendered = text.replace(SHIPPED_TOKEN, `VECTOR(${dim})`);
  verifyTemplate(rendered, dim);
  if (new RegExp(`\\bvector\\(${EMBED_DIM}\\)`, "i").test(rendered)) {
    throw new Error(
      "schema render left the shipped-dimension token behind — refusing half-rendered DDL",
    );
  }
  return rendered;
}

export function renderSchema(dim: number, source?: string): string {
  return renderSchemaText(readFileSync(source ?? schemaSqlPath(), "utf8"), dim);
}

/** Apply the rendered DDL to a fresh database (idempotence is the DDL's own concern). */
export async function applySchema(pool: pg.Pool, dim: number): Promise<void> {
  await pool.query(renderSchema(dim));
}
