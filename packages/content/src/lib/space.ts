/**
 * The boot-time embedding-space guard (oracle SC/lib/space.py, the
 * load-bearing slice): one database = one embedding space. Serving cosine
 * against vectors from a different model or dimension is nonsense wearing
 * a similarity score, so a PROVEN mismatch refuses to serve; an
 * unreachable or half-applied database is a SKIP with a named reason —
 * "slow, not down" — never a boot loop.
 */

import type pg from "pg";

import { runProbe } from "../db.js";

/** Written to yield ZERO ROWS, never an error, when the schema is absent. */
const COLUMNS_SQL = `
SELECT c.relname, a.atttypmod
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
 WHERE a.attrelid IN (to_regclass('chunks'), to_regclass('node_centroids'))
   AND a.attname = 'embedding'
   AND NOT a.attisdropped`;

const MODELS_SQL = `SELECT DISTINCT embedding_model FROM sources
 WHERE tenant_id = $1 AND embedding_model IS NOT NULL`;

export class EmbeddingSpaceMismatch extends Error {
  constructor(problems: string[]) {
    super(
      "embedding-space mismatch — a different space is a NEW database " +
        "(render its DDL at the declared dimension, ingest, recalibrate the floor); " +
        `the in-place path is refused: ${problems.join("; ")}`,
    );
    this.name = "EmbeddingSpaceMismatch";
  }
}

export interface SpaceCheck {
  readonly checked: boolean;
  readonly reason: string | null;
}

export async function checkEmbeddingSpace(
  pool: pg.Pool,
  tenantId: string,
  declaredModel: string,
  declaredDim: number,
): Promise<SpaceCheck> {
  let columns: { relname: string; atttypmod: number }[];
  let models: string[];
  try {
    columns = (await runProbe(pool, tenantId, (c) => c.query(COLUMNS_SQL))).rows as {
      relname: string;
      atttypmod: number;
    }[];
    models = (await runProbe(pool, tenantId, (c) => c.query(MODELS_SQL, [tenantId]))).rows.map(
      (r: { embedding_model: string }) => r.embedding_model,
    );
  } catch (error) {
    // The reason rides an unauthenticated /health body — class name only.
    return {
      checked: false,
      reason: `guard statement failed (${error instanceof Error ? error.name : "Error"})`,
    };
  }
  const byTable = new Map(columns.map((c) => [c.relname, c.atttypmod]));
  if (!byTable.has("chunks")) {
    return {
      checked: false,
      reason: "chunks.embedding not found (schema not applied to this database?)",
    };
  }
  // Proven facts FIRST over present columns (an early skip once masked a
  // wrong dimension), then the persisted model; half-applied comes last.
  const problems: string[] = [];
  for (const [table, typmod] of byTable) {
    if (typmod === -1) {
      problems.push(
        `${table}.embedding is an unconstrained vector (no dimension) but the declared space is ${declaredModel}/d${declaredDim}`,
      );
    } else if (typmod !== declaredDim) {
      problems.push(
        `${table}.embedding is vector(${typmod}) but the declared space is ${declaredModel}/d${declaredDim} (embedding.dim=${declaredDim})`,
      );
    }
  }
  if (models.length > 0 && (models.length !== 1 || models[0] !== declaredModel)) {
    problems.push(
      `tenant ${JSON.stringify(tenantId)} has persisted embedding_model [${models.join(", ")}] but the declared space is ${JSON.stringify(declaredModel)} (embedding.model)`,
    );
  }
  if (problems.length > 0) throw new EmbeddingSpaceMismatch(problems);
  if (!byTable.has("node_centroids")) {
    return {
      checked: false,
      reason:
        "node_centroids.embedding not found (schema half-applied — apply the rest of the DDL)",
    };
  }
  return { checked: true, reason: null };
}
