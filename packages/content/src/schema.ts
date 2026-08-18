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

/** pgvector vector + HNSW ceiling. */
export const EMBED_DIM_MAX = 2000;

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
