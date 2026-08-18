/**
 * Composition (oracle main.py's boot order, adapted): instance → DSN via
 * the declared env NAME → provider → pool → space guard → service context.
 * Auth is built by the door that needs it (http.ts) — BEFORE the pool
 * serves anything; stdio is the local loopback-equivalent door and runs
 * with auth off by construction.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type pg from "pg";
import { pooledEndpointFor } from "@panaversity/ksor-platform";
import {
  buildShippedProvider,
  checkEmbeddingSpace,
  contentPool,
  embedQueryVlit,
  EmbeddingSpaceMismatch,
  keyRingFromEnv,
  parseInstanceText,
  type ContentInstance,
  type ServiceContext,
} from "@panaversity/ksor-content";

export interface Composition {
  readonly ctx: ServiceContext;
  readonly instance: ContentInstance;
  readonly pool: pg.Pool;
  /** null when checked-clean; a reason string when skipped (rides /health). */
  readonly spaceSkipReason: string | null;
  readonly version: string;
}

export async function compose(instancePath: string, version: string): Promise<Composition> {
  const instanceText = readFileSync(instancePath, "utf8");
  const instanceDigest = createHash("sha256").update(instanceText).digest("hex");
  const instance = parseInstanceText(instanceText);

  const dsn = process.env[instance.dsnEnv];
  if (dsn === undefined || dsn.trim() === "") {
    throw new Error(
      `${instance.dsnEnv} is not set — instance.md names it as the database DSN variable ` +
        `(database.dsn_env); export it with the Postgres connection string before serving`,
    );
  }

  const provider = buildShippedProvider(instance.embeddingProvider, {
    apiKey: process.env["GEMINI_API_KEY"] ?? null,
    modelId: instance.embeddingModel,
    dim: instance.embeddingDim,
  });

  // Classification only — logged with the REASON, never the DSN.
  console.error(
    `db endpoint: ${pooledEndpointFor(dsn) ? "transaction-pooled" : "direct"} (classified from the DSN shape)`,
  );
  const pool = contentPool(dsn);

  // A proven mismatch refuses to boot; an unreachable database is a warning
  // — serving starts and /health carries the unverified state.
  let spaceSkipReason: string | null = null;
  try {
    const check = await checkEmbeddingSpace(
      pool,
      instance.tenantId,
      instance.embeddingModel,
      instance.embeddingDim,
    );
    spaceSkipReason = check.reason;
    if (spaceSkipReason !== null) {
      console.error(`embedding-space check skipped: ${spaceSkipReason}`);
    }
  } catch (error) {
    if (error instanceof EmbeddingSpaceMismatch) throw error;
    spaceSkipReason = `content store unreachable (${error instanceof Error ? error.name : "Error"})`;
    console.error(`embedding-space check skipped: ${spaceSkipReason}`);
  }

  const ctx: ServiceContext = {
    pool,
    instance,
    ring: keyRingFromEnv(process.env["KSOR_SNAPSHOT_KEYS"]),
    instanceDigest,
    embedQuery: (query: string) => embedQueryVlit(query, { provider }),
  };
  return { ctx, instance, pool, spaceSkipReason, version };
}
