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
import {
  pooledEndpointFor,
  prewarmPool,
  tlsAdvisory,
  withPgRetry,
} from "@panaversity/ksor-postgres";
import { currentActor, RequiredEnvError } from "@panaversity/ksor-gateway-kit";
import {
  assertGovernanceServable,
  assertSchemaCompatible,
  buildShippedProvider,
  checkEmbeddingSpace,
  contentPool,
  contentPoolMin,
  visibleTiers,
  embedQueryVlit,
  EmbeddingSpaceMismatch,
  keyRingFromEnv,
  MissingProviderKeyError,
  parseInstanceText,
  SchemaVersionError,
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
  /**
   * Re-runs the schema compatibility gate, or resolves immediately once it has
   * passed. `null` when boot already verified it.
   *
   * The gate is the only fail-closed check that the database is new enough, and
   * at boot it could only be a WARNING when the store was unreachable — which
   * on a serverless compute is the ordinary cold start, not an exception. It
   * then never ran again, so an instance that skipped it stayed unverified for
   * its whole life: with a too-old schema every tool call fails on a missing
   * column while `/health` and `/ready` both report green (round-4 review of
   * #43). Handing the retry to the readiness probe closes that: an instance
   * whose schema is unverified is NOT ready, which is exactly what the word
   * means, and the check keeps trying until the database answers.
   */
  readonly verifySchema: (() => Promise<void>) | null;
}

export async function compose(instancePath: string, version: string): Promise<Composition> {
  let instanceText: string;
  try {
    instanceText = readFileSync(instancePath, "utf8");
  } catch (error) {
    // A missing instance.md is an ENVIRONMENT precondition (exit 3), not a
    // crash — the operator is not in a KSoR project or has not run `ksor init`.
    if ((error as { code?: unknown }).code === "ENOENT") {
      throw new RequiredEnvError(
        `instance.md not found at ${instancePath} — run \`ksor init\`, or run \`ksor serve\` ` +
          "from your KSoR project root (it reads ./instance.md).",
      );
    }
    throw error;
  }
  const instanceDigest = createHash("sha256").update(instanceText).digest("hex");
  const instance = parseInstanceText(instanceText);

  const dsn = process.env[instance.dsnEnv];
  if (dsn === undefined || dsn.trim() === "") {
    // A RequiredEnvError so main.ts classifies it as an ENVIRONMENT failure
    // (exit 3), not a refusal (exit 1) — the CLI exit-code contract (review
    // finding, 2026-08-19: a plain Error here exited 1).
    throw new RequiredEnvError(
      `${instance.dsnEnv} is not set — instance.md names it as the database DSN variable ` +
        `(database.dsn_env); export it with the Postgres connection string before serving`,
    );
  }

  let provider;
  try {
    provider = buildShippedProvider(instance.embeddingProvider, {
      apiKey: process.env["GEMINI_API_KEY"] ?? null,
      modelId: instance.embeddingModel,
      dim: instance.embeddingDim,
    });
  } catch (error) {
    // A missing API key is an ENVIRONMENT failure (exit 3), not a refusal —
    // the ksor-content CLI classifies it that way and the gateway must agree.
    // Matched by TYPE, never by message prose: a reworded message must not
    // silently revert this to exit 1 (review, 2026-08-19).
    if (error instanceof MissingProviderKeyError) {
      throw new RequiredEnvError(error.message);
    }
    throw error;
  }

  // Classification only — logged with the REASON, never the DSN.
  console.error(
    `db endpoint: ${pooledEndpointFor(dsn) ? "transaction-pooled" : "direct"} (classified from the DSN shape)`,
  );
  const pool = contentPool(dsn);

  // Fail closed on a database OLDER than this build needs: a reachable,
  // too-old schema refuses to boot with a legible exit-3 message naming
  // `ksor schema --apply` (which now migrates it forward), instead of erroring
  // per-request on a missing column while /health reports healthy. An UNREACHABLE store is not this
  // gate's concern — it is a warning, handled by the space check below.
  let verifySchema: (() => Promise<void>) | null = null;
  try {
    // Retried like a serving read, not attempted once: a cold serverless
    // compute takes a measured 4-10s to wake and the first connection fails at
    // the connection level, which is precisely when a deploy runs.
    await withPgRetry(() => assertSchemaCompatible(pool), { attempts: 3 });
  } catch (error) {
    if (error instanceof SchemaVersionError) throw error;
    console.error(
      `schema version check DEFERRED: content store unreachable (${error instanceof Error ? error.name : "Error"}) — ` +
        "this instance reports NOT READY until the check passes",
    );
    let verified = false;
    verifySchema = async (): Promise<void> => {
      if (verified) return;
      await assertSchemaCompatible(pool);
      verified = true;
      console.error("schema version check passed on retry — instance is now ready");
    };
  }

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

  // Which half of the record this door serves — validated HERE, at boot. An
  // unknown or un-narrowable tier used to surface per REQUEST, so a
  // misconfigured deployment looked healthy and failed one caller at a time
  // (round-1 review of #43).
  // Trimmed, as the site trims it: a mounted secret with a trailing newline
  // otherwise refuses at boot naming a tier that looks identical to a declared
  // one (round-2 review of #43).
  const audience = (process.env["KSOR_AUDIENCE"] ?? "").trim() || null;
  visibleTiers(
    { audiences: instance.audiences, defaultVisibility: instance.defaultVisibility },
    audience,
  );
  if (audience !== null) console.error(`serving audience: ${audience}`);

  // Two states the SITE refuses to build in, which the door used to serve in:
  // a generation built before governance reached the node row (every document
  // then reads as the widest tier), and a document declaring `visibility:` in a
  // record that declares no model (an author restricted something and nothing
  // enforces it). Fail closed at BOOT, so a misconfiguration is one loud
  // refusal rather than a leak per request (round-5 review of #43).
  //
  // Skipped when the store is unreachable: that is the deferred-schema case
  // above, and readiness already withholds this instance until it can answer.
  if (verifySchema === null) {
    await assertGovernanceServable(pool, instance);
  }

  const advisory = tlsAdvisory(dsn);
  if (advisory !== null) console.error(advisory);

  // Prewarm is OPT-IN (KSOR_CONTENT_POOL_MIN, default 0). `min` alone cannot
  // do this — pg-pool never opens connections eagerly — so the dial is honoured
  // HERE or it is a lie. Default 0 means a quiet server holds no open
  // connection at all; set it above 0 to trade that for a warm first request.
  const floor = contentPoolMin();
  if (floor > 0) {
    const opened = await prewarmPool(pool, floor);
    console.error(`db pool: prewarmed ${opened} connection(s)`);
  }

  const ctx: ServiceContext = {
    pool,
    instance,
    ring: keyRingFromEnv(process.env["KSOR_SNAPSHOT_KEYS"]),
    instanceDigest,
    embedQuery: (query: string) => embedQueryVlit(query, { provider }),
    // The §7 rows must name the verified caller (a row that says
    // "anonymous" for a bearer-verified read proves nothing — review
    // finding 2026-08-19); the kit's AsyncLocalStorage carries it.
    actor: currentActor,
    // Which half of the record this door serves. The SAME variable the site's
    // per-audience build reads, so one record cannot mean two things across the
    // two surfaces. Unset = the least-privileged tier: a door that cannot
    // establish who is asking must not hand out the restricted half (before
    // schema 2.2 it handed out ALL of it, because ingest dropped `visibility:`
    // and the door had nothing to filter on — review 2026-08-20).
    audience,
  };
  return { ctx, instance, pool, spaceSkipReason, version, verifySchema };
}
