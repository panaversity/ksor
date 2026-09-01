/**
 * Composition (oracle main.py's boot order, adapted): instance → DSN via
 * the declared env NAME → provider → pool → space guard → service context.
 * Auth is built by the door that needs it (http.ts) — BEFORE the pool
 * serves anything; a loopback bind is the local-equivalent door and is the
 * only posture that may run with auth explicitly disabled.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type pg from "pg";
import {
  pooledEndpointFor,
  prewarmPool,
  tlsPosture,
  withPgRetry,
} from "@panaversity/ksor-postgres";
import { currentActor, RequiredEnvError } from "@panaversity/ksor-gateway-kit";
import {
  assertGovernanceServable,
  assertSchemaCompatible,
  ContentStoreError,
  storedTextSearchConfig,
  TextSearchConfigMismatch,
  buildShippedProvider,
  checkEmbeddingSpace,
  contentPool,
  contentPoolMin,
  parseTrustFloor,
  parseViewer,
  servingPolicy,
  validateViewer,
  embedQueryVlit,
  keyRingFromEnv,
  MissingProviderKeyError,
  parseInstanceText,
  type ContentInstance,
  type ServiceContext,
  instancePathOf,
  providerKeyEnv,
} from "@panaversity/ksor-content";

import { bootHeader, bootLine } from "./boot-report.js";
import { classSuffix, isRefusal } from "./refusal-body.js";

import { loadGateway } from "./gateway-load.js";
import { verifyGatewaySurface } from "./gateway-verify.js";
import { buildServer } from "./server.js";
import { tallyHandlers } from "./tools.js";
import type { Registration } from "./server.js";

export interface Composition {
  readonly ctx: ServiceContext;
  /** The record's own registration; the compiled default when it ships no file. */
  readonly registration: Registration;
  readonly instance: ContentInstance;
  readonly pool: pg.Pool;
  /** null when checked-clean; a reason string when skipped (rides /health). */
  readonly spaceSkipReason: string | null;
  /**
   * The viewer list the operator ASKED this door to serve (`KSOR_AUDIENCE`),
   * before validation. `ctx.viewer` is what it actually serves — the two differ
   * only while the boot checks are deferred, and the boot report needs the ask:
   * an unauthenticated public bind has to state the restricted tiers it is
   * about to hand out, not the fail-closed placeholder it holds meanwhile.
   */
  readonly requestedViewer: readonly string[];
  readonly version: string;
  /**
   * Re-runs EVERY fail-closed boot check — schema compatibility, the
   * governance gate, and the viewer list this door may serve — or resolves
   * immediately once they have passed. `null` when boot already verified them.
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
  /**
   * Have the boot checks passed? Synchronous, so a probe can SAY so without
   * running them.
   *
   * `verifyBoot` cannot answer this: it stays non-null after a successful
   * retry, so it distinguishes "was deferred at boot" and not "is verified
   * now" — and the only way to ask it was to await a database round trip from
   * inside a health handler.
   */
  readonly bootVerified: () => boolean;
}

export async function compose(rawInstancePath: string, version: string): Promise<Composition> {
  // `--instance` accepts a DIRECTORY everywhere else — `build` documents it and
  // the write-plane verbs were fixed to match. Reading the argument directly
  // meant `serve --instance .` answered `EISDIR`, a raw errno naming no rule and
  // no fix, on the one flag a person is most likely to type as `.`. One
  // resolver, every verb (found on a live walk, 2026-08-25).
  const instancePath = instancePathOf(rawInstancePath);
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
      // The provider names its own key variable (#25) — this root no longer
      // spells one vendor's, so a record that declares `openai` gets its key.
      apiKey: process.env[providerKeyEnv(instance.embeddingProvider) ?? ""] ?? null,
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

  // Classification only — logged with the REASON, never the DSN. The TLS half
  // states what ksor DID (see pinnedTlsDsn); it is not a warning forwarded at
  // an adopter who wrote a perfectly ordinary connection string.
  console.error(bootHeader(instance.corpusId));
  {
    const endpoint = pooledEndpointFor(dsn) ? "transaction-pooled endpoint" : "direct endpoint";
    const tls = tlsPosture(dsn);
    console.error(bootLine("db", tls === null ? `${endpoint} · local` : `${endpoint} · ${tls}`));
  }
  const pool = contentPool(dsn);

  // The viewer list the operator asked for, from env alone — no database, so
  // the ask survives a store that never answers.
  // Trimmed, as the site trims it: a mounted secret with a trailing newline
  // otherwise refuses at boot naming a tier that looks identical to a declared
  // one (round-2 review of #43).
  const requestedViewer = parseViewer(process.env["KSOR_AUDIENCE"]);
  // …and what this door serves until that ask has been VALIDATED against the
  // policy: `public`, the one list legal for every record. Widened only inside
  // the boot checks below, so a door that has not reached the policy row cannot
  // serve the restricted half of the record.
  let viewer: readonly string[] = ["public"];

  // What /health says about the embedding-space guard. It starts as "has not
  // run" rather than null, because null is what a PASS looks like and this is
  // the state where nothing has been compared yet.
  let spaceSkipReason: string | null = "not yet verified — boot checks have not passed";

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
  // The set has grown twice since, both times because a check OUTSIDE it was
  // found to be off for the life of a process that had merely started cold:
  // the viewer list (which decides how much of the record may be served) and
  // the embedding-space guard (which decides whether a similarity score means
  // anything). Both belong to the same rule — a check decided by the DATABASE
  // belongs to the set that defers and retries together.
  //
  // Everything here that is a verdict rather than an outage is a REFUSAL and
  // throws: a too-old schema, a stemming mismatch, a governance violation, an
  // unregistered audience, a proven embedding-space mismatch. Only an
  // unreachable store defers.
  const bootChecks = async (): Promise<void> => {
    await assertSchemaCompatible(pool);
    // The stemming the stored column was BUILT with must match what queries
    // will use, or the keyword arm silently stops matching (audit finding 20).
    const stored = await storedTextSearchConfig(pool);
    if (stored !== null && stored !== instance.textSearchConfig) {
      throw new TextSearchConfigMismatch(instance.textSearchConfig, stored);
    }
    await assertGovernanceServable(pool, instance);
    // Which half of the record this door serves — a BOOT CHECK, because it is
    // decided by a ROW: the viewer is a LIST (record spec §2.4) validated
    // against the registry the ACTIVE generation was ingested with, and the
    // policy lives on the run row, not in a file the container carries. A
    // record with no generation yet has no registry, so only `[public]` can be
    // served — which is what `[]` validates.
    //
    // It sat just BELOW the deferred block instead, an unguarded `runRead`. So
    // a cold start against a suspended serverless Postgres — decision 17's
    // exact target — printed "boot checks DEFERRED … NOT READY" and then threw
    // two statements later, exiting 3 and crash-looping the deploy. The line
    // was falsified by the same boot that printed it.
    //
    // An unknown or un-narrowable tier is still a REFUSAL and still surfaces
    // HERE rather than one request at a time (round-1 review of #43); it is
    // re-thrown from the catch below with the other refusals.
    const policy = await servingPolicy(pool, instance);
    viewer = validateViewer(policy?.registry ?? [], requestedViewer);
    console.error(bootLine("audience", viewer.join(",")));

    // One database, one embedding space. This was the ONE fail-closed check a
    // cold start switched off for the life of the process: it was caught here,
    // reduced to a skip reason, and — unlike the checks above — never run
    // again. So a door that booted against a sleeping database and recovered
    // reported /ready true and then ran cosine across two embedding spaces,
    // with the calibrated `vector_floor` measured in a space the record no
    // longer used. Abstention, a product invariant, decided by noise; the only
    // trace on /health, which needs a bearer, so no probe ever saw it
    // (review finding 3).
    //
    // `storeUnreachable` is a TYPED field, not a reason string, because the
    // guard swallows its own statement failures: without it a database that
    // dropped between the query above and this one would return `checked:
    // false` and this whole set would report SUCCESS with the space never
    // compared — the same fail-open shape one layer down.
    const space = await checkEmbeddingSpace(
      pool,
      instance.tenantId,
      instance.embeddingModel,
      instance.embeddingDim,
    );
    if (space.storeUnreachable) {
      throw new ContentStoreError(`embedding-space guard: ${space.reason ?? "unknown"}`);
    }
    spaceSkipReason = space.reason;
    if (spaceSkipReason !== null) {
      console.error(`embedding-space check skipped: ${spaceSkipReason}`);
    }
  };

  let verifyBoot: (() => Promise<void>) | null = null;
  // Replaced by the closure's own flag on the deferred path below.
  let bootVerified = (): boolean => true;
  try {
    // Retried like a serving read, not attempted once: a cold serverless
    // compute takes a measured 4-10s to wake and the first connection fails at
    // the connection level, which is precisely when a deploy runs.
    await withPgRetry(bootChecks, { attempts: 3 });
  } catch (error) {
    // A refusal is a refusal whenever it is discovered — never deferred into a
    // "maybe later" that lets the door open in the meantime.
    //
    // Every class here is decided by a row the store ANSWERED with, so none of
    // them can be the cold start this branch exists for. Deferring one printed
    // "content store unreachable (TextSearchConfigMismatch)" about a database
    // that had just replied, and left the door retrying forever a verdict no
    // retry can change.
    if (isRefusal(error)) throw error;
    console.error(
      `boot checks DEFERRED: content store unreachable${classSuffix(error)} — ` +
        "this instance reports NOT READY until schema AND governance both verify",
    );
    // …and the WHOLE error, to the logs.
    //
    // This line said only the class name, and `pg` reports most connection
    // failures as a bare `Error` — so an operator whose deploy came up NOT
    // READY was told "content store unreachable (Error)" and nothing about
    // which host, which user, or whether it was DNS, TLS or a password. The
    // detail did exist, but only from the first request onwards, in
    // `handleMcp`'s catch: an instance nobody called never explained itself at
    // all.
    //
    // Safe HERE and not on the wire, which is the same split `handleMcp` makes
    // for the same reason: stderr is the operator's, and a driver error naming
    // the database host is exactly what they need and exactly what a caller
    // must not receive.
    console.error(
      `  cause: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    // Say what that means for the audience, rather than printing no line at
    // all: the ask is known, and what is served until the checks pass is
    // nothing.
    console.error(
      bootLine(
        "audience",
        `not resolved — requested ${requestedViewer.join(",")}; this door refuses every ` +
          "request until the boot checks pass",
      ),
    );
    // Memoize the IN-FLIGHT attempt, not only the settled result.
    //
    // The door awaits this on every request until it passes, and `bootChecks`
    // is a schema query plus a `runRead` with five attempts, linear backoff and
    // a 30s deadline. Sharing only the RESULT meant a burst against a waking
    // database started one whole chain per request — up to KSOR_MAX_INFLIGHT
    // (64) concurrent chains against a 20-connection pool, each holding a
    // checkout for up to 30s. That is the pool-exhaustion amplifier /ready's
    // coalescing was rewritten to prevent, rebuilt on a hotter path (round-9
    // review of #43).
    //
    // One attempt at a time: concurrent callers share it, and the next caller
    // after a FAILED attempt starts a fresh one, so an unreachable store is
    // still retried — just never in parallel with itself.
    let verified = false;
    bootVerified = (): boolean => verified;
    let inFlight: Promise<void> | null = null;
    verifyBoot = async (): Promise<void> => {
      if (verified) return;
      if (inFlight !== null) return inFlight;
      const attempt = bootChecks().then(
        () => {
          verified = true;
          inFlight = null;
          console.error("boot checks passed on retry — instance is now ready");
        },
        (error: unknown) => {
          inFlight = null;
          throw error;
        },
      );
      inFlight = attempt;
      return attempt;
    };
  }

  // The deployment's own trust floor — the half of "configuration tightens" a
  // caller cannot reach. Validated HERE rather than per request, for the same
  // reason the viewer list is validated in the boot checks: a misspelled tier
  // that fell back to `unverified` would serve the record the operator meant to
  // restrict and look healthy doing it. It stays out of the deferred set
  // because it reads ENV, not a row — there is nothing here to be unreachable.
  const minTrustTier = parseTrustFloor(process.env["KSOR_MIN_TRUST_TIER"]);
  console.error(bootLine("trust", minTrustTier));

  // Prewarm is OPT-IN (KSOR_CONTENT_POOL_MIN, default 0). `min` alone cannot
  // do this — pg-pool never opens connections eagerly — so the dial is honoured
  // HERE or it is a lie. Default 0 means a quiet server holds no open
  // connection at all; set it above 0 to trade that for a warm first request.
  const floor = contentPoolMin();
  if (floor > 0) {
    const opened = await prewarmPool(pool, floor);
    console.error(bootLine("db pool", `prewarmed ${opened} connection(s)`));
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
    // two surfaces. Unset = `[public]`: a door that cannot establish who is
    // asking must not hand out the restricted half (before schema 2.2 it handed
    // out ALL of it, because ingest dropped `visibility:` and the door had
    // nothing to filter on — review 2026-08-20).
    //
    // A GETTER, not a value. Validation happens inside the boot checks, which a
    // cold start defers, and the serving statements read this per call
    // (`servingScope`) — copied by value it would freeze at the fail-closed
    // `[public]` for the whole life of a door that later recovered, which is a
    // SILENT narrowing where the point of the fail-closed value is that nothing
    // is served through it at all.
    get viewer(): readonly string[] {
      return viewer;
    },
    // A caller may raise this per call (`min_trust_tier`); `tightenTrustFloor`
    // is what makes sure they can never lower it.
    minTrustTier,
  };
  // Resolved at boot, before the door opens: a bad gateway file must refuse
  // loudly rather than serve a surface nobody asked for.
  const registration = await loadGateway(instancePath);

  // Verify the surface this record will actually SERVE, before the door opens.
  // The registration file is adopter-owned code, so nothing structural stops it
  // dropping a framework description — and a door that lost one looks perfectly
  // healthy while its agent quietly stops abstaining. Built on a throwaway
  // server: the door constructs a fresh one per request, so closing this one
  // touches nothing. Costs no database round trip.
  // The tally is taken around the BUILD, so the check can tell a record that
  // dropped a tool from one serving a ksor handler behind a surface it cannot
  // inspect (`ksor-gateway-unverifiable`).
  const built = tallyHandlers(() => buildServer(ctx, version, registration));
  await verifyGatewaySurface(built.value, { registered: built.registered });

  return {
    ctx,
    instance,
    pool,
    // A getter, for the same reason `ctx.viewer` is one: the guard now runs
    // inside the deferred set, so this is written after the object is built.
    get spaceSkipReason(): string | null {
      return spaceSkipReason;
    },
    requestedViewer,
    version,
    verifyBoot,
    bootVerified: () => bootVerified(),
    registration,
  };
}
