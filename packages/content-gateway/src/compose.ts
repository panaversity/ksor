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
  GovernanceGateError,
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
   * Re-runs EVERY fail-closed boot check — schema compatibility and the
   * governance gate — or resolves immediately once they have passed. `null`
   * when boot already verified them.
   *
   * These are the only fail-closed checks that the database is new enough and
   * that its governance can be honoured, and at boot they can only be WARNINGS
   * when the store is unreachable — which on a serverless compute is the
   * ordinary cold start, not an exception. They then never ran again, so an
   * instance that skipped them stayed unverified for its whole life: every tool
   * call failing on a missing column, or the restricted half served, while
   * `/health` and `/ready` both report green (rounds 4 and 6 of the #43
   * review). Handing the retry to the readiness probe closes that: an instance
   * whose boot checks have not passed is NOT ready, which is exactly what the
   * word means, and they keep trying until the database answers.
   */
  readonly verifyBoot: (() => Promise<void>) | null;
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

  // EVERY fail-closed boot check, in one place, so that deferring them defers
  // ALL of them and retrying retries ALL of them.
  //
  // They were two separate things and the governance gate ran only on the
  // branch where the schema check had SUCCEEDED — so a cold start whose first
  // connect failed skipped governance permanently, and the readiness retry
  // re-ran only the schema half. Proved live: with the store down at boot and
  // up twelve seconds later, /ready answered {"ready":true} and `read` returned
  // a `visibility: internal` document in full from a record declaring no
  // audience model (round-6 review of #43 — a hole in round 5's own fix).
  //
  // A too-old schema and a governance violation are both REFUSALS and throw
  // from here; only an unreachable store defers.
  const bootChecks = async (): Promise<void> => {
    await assertSchemaCompatible(pool);
    await assertGovernanceServable(pool, instance);
  };

  let verifyBoot: (() => Promise<void>) | null = null;
  try {
    // Retried like a serving read, not attempted once: a cold serverless
    // compute takes a measured 4-10s to wake and the first connection fails at
    // the connection level, which is precisely when a deploy runs.
    await withPgRetry(bootChecks, { attempts: 3 });
  } catch (error) {
    // A refusal is a refusal whenever it is discovered — never deferred into a
    // "maybe later" that lets the door open in the meantime.
    if (error instanceof SchemaVersionError || error instanceof GovernanceGateError) throw error;
    console.error(
      `boot checks DEFERRED: content store unreachable (${error instanceof Error ? error.name : "Error"}) — ` +
        "this instance reports NOT READY until schema AND governance both verify",
    );
    let verified = false;
    verifyBoot = async (): Promise<void> => {
      if (verified) return;
      await bootChecks();
      verified = true;
      console.error("boot checks passed on retry — instance is now ready");
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
  return { ctx, instance, pool, spaceSkipReason, version, verifyBoot };
}
