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

/**
 * The largest embedding dimension this schema will render.
 *
 * It is the ceiling for the shape we USE, not pgvector's ceiling: `schema.sql`
 * declares two `VECTOR(dim)` columns and indexes one of them directly, and
 * pgvector's HNSW and IVFFlat take a `vector` to 2000. They take a `halfvec` to
 * **4000**, reachable by indexing an expression — `hnsw ((embedding::halfvec(N))
 * halfvec_cosine_ops)` — which we do not do, so 2000 binds here.
 *
 * Said precisely because the old wording ("pgvector vector + HNSW ceiling")
 * read as pgvector's own limit and sent a reader off to change providers over a
 * wall that is not one (verified live against a real database, 2026-08-21:
 * a halfvec(3072) expression index plans an Index Scan).
 *
 * Raising it is a decision, not a constant: every query site would have to use
 * the same cast as the index or fall silently back to a sequential scan, and
 * the halfvec arm's float16 rounding lands on the score the abstention gate
 * reads. Recorded in issue #49, along with why 1536 stays — Google's own MTEB
 * table has 1536 at 68.17 against 2048's 68.16, so there is no quality
 * gradient to climb up there.
 */
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
/**
 * The shipped text-search configuration, rendered per instance the way the
 * dimension is. It appears exactly once, in the STORED generated column.
 */
const SHIPPED_TS_CONFIG = "english";
const TS_TOKEN = /to_tsvector\('english', content\)/g;
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
export function renderSchemaText(
  text: string,
  dim: number,
  textSearchConfig: string = SHIPPED_TS_CONFIG,
): string {
  if (!Number.isInteger(dim) || dim < 1 || dim > EMBED_DIM_MAX) {
    throw new Error(
      `dim must be an integer in 1..${EMBED_DIM_MAX} — this schema indexes a vector column directly, and pgvector's HNSW takes a vector to 2000 — got ${JSON.stringify(dim)}`,
    );
  }
  verifyTemplate(text, EMBED_DIM);
  const withTs = renderTsConfig(text, textSearchConfig);
  if (dim === EMBED_DIM) return withTs; // byte-for-byte at the shipped dim
  const rendered = withTs.replace(SHIPPED_TOKEN, `VECTOR(${dim})`);
  verifyTemplate(rendered, dim);
  if (new RegExp(`\\bvector\\(${EMBED_DIM}\\)`, "i").test(rendered)) {
    throw new Error(
      "schema render left the shipped-dimension token behind — refusing half-rendered DDL",
    );
  }
  return rendered;
}

/**
 * Substitute the record's text-search configuration into the generated column.
 *
 * Refused rather than escaped: the value is spliced into DDL, so it is
 * validated as a bare identifier at BOTH ends — `instance.ts` rejects anything
 * that is not `[a-z][a-z0-9_]*`, and this refuses again rather than trust its
 * caller.
 */
function renderTsConfig(text: string, config: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(config)) {
    throw new Error(
      `text_search_config ${JSON.stringify(config)} is not a bare Postgres configuration name ` +
        "(lowercase letters, digits and underscores, e.g. `english`, `spanish`, `simple`)",
    );
  }
  const found = text.match(TS_TOKEN) ?? [];
  if (found.length !== 1) {
    throw new Error(
      `schema template drift: expected to_tsvector('${SHIPPED_TS_CONFIG}', content) exactly once, found ${found.length}`,
    );
  }
  return config === SHIPPED_TS_CONFIG
    ? text
    : text.replace(TS_TOKEN, `to_tsvector('${config}', content)`);
}

export function renderSchema(dim: number, source?: string, textSearchConfig?: string): string {
  return renderSchemaText(
    readFileSync(source ?? schemaSqlPath(), "utf8"),
    dim,
    textSearchConfig ?? SHIPPED_TS_CONFIG,
  );
}

/** Apply the rendered DDL to a fresh database (idempotence is the DDL's own concern). */
export async function applySchema(
  pool: pg.Pool,
  dim: number,
  textSearchConfig?: string,
): Promise<void> {
  await pool.query(renderSchema(dim, undefined, textSearchConfig));
}

/**
 * The text-search configuration a database's `search_tsv` column was BUILT
 * with, read back from the catalogue — or null when the column is absent.
 *
 * `search_tsv` is STORED and GENERATED, so changing `retrieval.text_search_
 * config` after a corpus exists does not restem anything: the stored vectors
 * keep the old language while queries arrive in the new one, and the keyword
 * arm silently stops matching. The value has to be checked, not assumed
 * (audit finding 20).
 */
export async function storedTextSearchConfig(pool: pg.Pool): Promise<string | null> {
  const r = await pool.query(
    "SELECT pg_get_expr(d.adbin, d.adrelid) AS expr FROM pg_attrdef d " +
      "JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum " +
      "WHERE d.adrelid = 'chunks'::regclass AND a.attname = 'search_tsv'",
  );
  const expr = (r.rows[0] as { expr?: string } | undefined)?.expr;
  if (expr === undefined) return null;
  return /to_tsvector\(\s*'([a-z0-9_]+)'::regconfig/.exec(expr)?.[1] ?? null;
}

export class TextSearchConfigMismatch extends ContentStoreError {
  override readonly name: string = "TextSearchConfigMismatch";
  constructor(declared: string, stored: string) {
    super("schema");
    this.message =
      `instance.md declares retrieval.text_search_config: ${declared}, but this database's ` +
      `chunks.search_tsv was generated with '${stored}'\n` +
      "  why: search_tsv is a STORED generated column — the existing rows keep the old " +
      "language while queries arrive in the new one, so the keyword arm stops matching " +
      "without erroring\n" +
      `  fix: keep retrieval.text_search_config: ${stored}, or provision a NEW database at ` +
      `${declared} and re-ingest — a different stemming is a different index, the way a ` +
      "different embedding model is a different space";
  }
}
