#!/usr/bin/env node
/**
 * `ksor-content` — the content kernel's write-plane CLI: a THIN caller of
 * library functions (renderSchema/applySchema, buildGeneration, runGc); no
 * behavior lives here. Adapted from the oracle's sor-content-ingest /
 * sor-content-gc / sor-content-schema argparse shells (sor-agentfactory @
 * b554f91, sor_content/ingest/cli.py + gc.py) with ksor's exit-code contract:
 * 1 refused · 3 environment (the oracle used 2 for "cannot run"; ksor re-maps,
 * never copies). process.exitCode, never process.exit — stdout always flushes.
 *
 * Env: the DSN env var NAMED BY instance.md (database.dsn_env), GEMINI_API_KEY
 * (only when the instance's provider needs a key), KSOR_MAX_SHRINK /
 * KSOR_ALLOW_SHRINK (oracle names: SOR_MAX_SHRINK / SOR_ALLOW_SHRINK; flip
 * guard only).
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import pg from "pg";

import { contentPool, ContentStoreError } from "./db.js";
import { parseInstance, InstanceParseError, type ContentInstance } from "./instance.js";
import { applySchema, renderSchema } from "./schema.js";
import { buildShippedProvider, providerNeedsApiKey } from "./lib/providers/registry.js";
import type { EmbeddingProvider } from "./lib/embedding.js";
import { ManifestError } from "./ingest/manifest.js";
import { buildGeneration } from "./ingest/build.js";
import { checkEmbeddingSpace } from "./lib/space.js";
import { parseQueriesFile, runCalibration } from "./calibrate/run.js";
import { renderReport } from "./calibrate/math.js";
import { GeminiTextGenerator } from "./lib/providers/gemini.js";
import { runGc } from "./ingest/gc.js";

const REFUSED = 1;
const ENVIRONMENT = 3;

const USAGE = `ksor-content — the KSoR content kernel's write plane

Usage:
  ksor-content schema (--dim N | --instance PATH) [--apply]
      Print the rendered DDL for the embedding dimension to stdout.
      --instance reads the dimension from instance.md; --apply (with
      --instance) applies the DDL to the instance's database instead.
  ksor-content ingest --instance PATH --knowledge DIR [--flip] [--source-commit SHA]
  ksor-content calibrate --instance PATH [--queries-file PATH] [--ooc-file PATH]
                         [--generation N] [--per-node N] [--min-chars N]
      Build one generation from the knowledge tree: structure atomically,
      embed resumably, finalize behind the ready gate. --flip activates it
      (never implicit).
  ksor-content gc --instance PATH [--dry-run]
      Reap generations the §5 algebra allows (never active/rollback, 40-min
      token grace, ≥2 complete generations remain).

Exit codes: 0 ok · 1 refused · 3 environment
`;

function fail(code: number, message: string): number {
  process.stderr.write(message.endsWith("\n") ? message : message + "\n");
  return code;
}

/** Resolve the instance, or explain exactly which file refused and why. */
function loadInstance(path: string | undefined): ContentInstance | number {
  if (path === undefined) {
    return fail(REFUSED, "--instance PATH is required (the instance.md that names this corpus)");
  }
  try {
    return parseInstance(path);
  } catch (exc) {
    if (exc instanceof InstanceParseError) return fail(REFUSED, `${path}: ${exc.message}`);
    if (isFsError(exc)) {
      return fail(ENVIRONMENT, `cannot read ${path}: ${(exc as Error).message}`);
    }
    throw exc;
  }
}

/** The DSN comes only from the env var the instance NAMES — never a flag, never a file. */
function resolveDsn(instance: ContentInstance): string | number {
  const dsn = process.env[instance.dsnEnv] ?? "";
  if (dsn === "") {
    return fail(
      ENVIRONMENT,
      `${instance.dsnEnv} is unset (named by instance.md)\n` +
        `  fix: export ${instance.dsnEnv}='postgresql://...' and rerun`,
    );
  }
  return dsn;
}

/** The ingest composition root's provider step (oracle cli.py:58-74). */
function composeProvider(instance: ContentInstance): EmbeddingProvider | number {
  try {
    let apiKey: string | null = null;
    if (providerNeedsApiKey(instance.embeddingProvider)) {
      apiKey = process.env["GEMINI_API_KEY"] || null;
      if (apiKey === null) {
        return fail(
          ENVIRONMENT,
          "GEMINI_API_KEY is required (the instance's embedding provider needs a key)\n" +
            "  fix: export GEMINI_API_KEY=... and rerun",
        );
      }
    }
    return buildShippedProvider(instance.embeddingProvider, {
      apiKey,
      modelId: instance.embeddingModel,
      dim: instance.embeddingDim,
    });
  } catch (exc) {
    return fail(
      REFUSED,
      `instance embedding.provider: ${exc instanceof Error ? exc.message : String(exc)}`,
    );
  }
}

function isFsError(exc: unknown): boolean {
  return exc instanceof Error && typeof (exc as { code?: unknown }).code === "string";
}

/** Failures past the explicit branches: refusals are data problems; codes mean the world broke. */
function classifyFailure(exc: unknown): number {
  if (exc instanceof InstanceParseError || exc instanceof ManifestError) return REFUSED;
  // A pg SQL error (a 23514 CHECK, a 23505 unique violation during ingest) is a
  // DATA problem the operator fixes in the corpus — REFUSED (exit 1), not
  // ENVIRONMENT. Its SQLSTATE `code` is a string, which isFsError below would
  // otherwise mis-read as an OS/fs failure (review 2026-08-19). Checked before
  // isFsError; a genuine connection failure is not a DatabaseError.
  if (exc instanceof pg.DatabaseError) return REFUSED;
  if (exc instanceof ContentStoreError || isFsError(exc)) return ENVIRONMENT;
  return REFUSED;
}

async function withPool<T>(dsn: string, op: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const pool = contentPool(dsn, 4);
  try {
    return await op(pool);
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------

async function schemaCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      dim: { type: "string" },
      instance: { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  if (values.dim !== undefined && values.instance !== undefined) {
    return fail(
      REFUSED,
      "schema: pass --dim OR --instance, not both (one source of truth for the dimension)",
    );
  }
  if (values.dim === undefined && values.instance === undefined) {
    return fail(REFUSED, "schema: pass --dim N or --instance PATH\n" + USAGE);
  }

  let dim: number;
  let instance: ContentInstance | null = null;
  if (values.dim !== undefined) {
    dim = intFlag("--dim", values.dim);
    if (!Number.isInteger(dim) || dim < 1) {
      return fail(
        REFUSED,
        `schema: --dim must be a positive integer, got ${JSON.stringify(values.dim)}`,
      );
    }
  } else {
    const loaded = loadInstance(values.instance);
    if (typeof loaded === "number") return loaded;
    instance = loaded;
    dim = instance.embeddingDim;
  }

  if (!values.apply) {
    process.stdout.write(renderSchema(dim));
    return 0;
  }
  if (instance === null) {
    return fail(
      REFUSED,
      "schema: --apply needs --instance (the instance names the DSN env var; --dim alone names no database)",
    );
  }
  const dsn = resolveDsn(instance);
  if (typeof dsn === "number") return dsn;
  await withPool(dsn, (pool) => applySchema(pool, dim));
  process.stdout.write(`schema: applied at dim ${dim} (database named by ${instance.dsnEnv})\n`);
  return 0;
}

async function ingestCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      instance: { type: "string" },
      knowledge: { type: "string" },
      flip: { type: "boolean", default: false },
      "source-commit": { type: "string" },
    },
  });
  if (values.knowledge === undefined) {
    return fail(REFUSED, "--knowledge DIR is required (the folder of Markdown to ingest)");
  }
  const instance = loadInstance(values.instance);
  if (typeof instance === "number") return instance;
  const dsn = resolveDsn(instance);
  if (typeof dsn === "number") return dsn;
  const provider = composeProvider(instance);
  if (typeof provider === "number") return provider;

  const report = await withPool(dsn, async (pool) => {
    // The pre-spend refusal: embedding into a database whose vector columns
    // or persisted model disagree with the declared space wastes real money
    // and poisons cosine — a PROVEN mismatch refuses before any embed call.
    const space = await checkEmbeddingSpace(
      pool,
      instance.tenantId,
      instance.embeddingModel,
      instance.embeddingDim,
    );
    if (space.missingTables.length > 0) {
      // The oracle's pre-spend refusal, restored (review round 2,
      // 2026-08-19): without it a half-applied schema allocated, embedded
      // the WHOLE corpus, and only then failed in finalize on the missing
      // table — after the spend, unrecoverable by carry-forward.
      throw new Error(
        `the schema is half-applied (missing: ${space.missingTables.join(", ")}) — ` +
          "ingesting now would embed the whole corpus and then fail in finalize, after the spend.\n" +
          `  fix: finish applying the DDL (ksor-content schema --instance ... --apply), then ingest`,
      );
    }
    if (space.reason !== null) {
      process.stderr.write(`embedding-space check skipped: ${space.reason}\n`);
    }
    try {
      return await buildGeneration(pool, instance, {
        knowledgeDir: values.knowledge!,
        // Provenance is recorded honestly: without --source-commit the sources
        // rows say so rather than carrying a guessed SHA.
        sourceCommit: values["source-commit"] ?? "unspecified",
        flip: values.flip ?? false,
        provider,
        onLog: (line) => process.stdout.write(line + "\n"),
      });
    } catch (exc) {
      // The most common first-run failure deserves its remedy: the grant
      // table IS ingest authorization (a CLI flag is not authorization).
      if (exc instanceof Error && /row-level security/i.test(exc.message)) {
        throw new Error(
          `ingest was refused by the database's row-level security — the grant table has no row ` +
            `authorizing this tenant.\n  why: who may WRITE a tenant's corpus is decided in the ` +
            `database, not by a flag\n  fix: psql "$${instance.dsnEnv}" -c "INSERT INTO ` +
            `ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', '${instance.tenantId}')"`,
        );
      }
      throw exc;
    }
  });
  process.stdout.write(
    `ingest: generation ${report.generation} — ${report.nodes} nodes, ${report.chunks} chunks; ` +
      `embedded ${report.embedded}, carried ${report.carried}, failed ${report.failed}\n`,
  );
  if (report.refusal !== null) return fail(REFUSED, report.refusal);
  // A flip was already narrated by the build log ("FLIPPED active generation
  // -> N"); only the withheld state still needs saying.
  if (!report.flipped) process.stdout.write("ready; flip withheld (pass --flip to activate)\n");
  return 0;
}

function parseGeneration(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  return intFlag("--generation", raw);
}

/** A flag that must be a non-negative integer — a typo is a REFUSAL (exit 1),
 * not a raw NaN threaded downstream into an opaque "database down" (review
 * finding, 2026-08-19). */
function intFlag(name: string, raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new InstanceParseError(
      `${name} must be a non-negative integer, got ${JSON.stringify(raw ?? null)}`,
      "a numeric flag typo must fail as a refusal, not surface as a spurious environment error",
      `pass ${name} <n>`,
    );
  }
  return Number(raw);
}

async function calibrateCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      instance: { type: "string" },
      "queries-file": { type: "string" },
      "ooc-file": { type: "string" },
      generation: { type: "string" },
      "per-node": { type: "string" },
      "min-chars": { type: "string" },
    },
  });
  const instance = loadInstance(values.instance);
  if (typeof instance === "number") return instance;
  const dsn = resolveDsn(instance);
  if (typeof dsn === "number") return dsn;
  const provider = composeProvider(instance);
  if (typeof provider === "number") return provider;

  let queries: string[] | null = null;
  if (values["queries-file"] !== undefined) {
    queries = parseQueriesFile(readFileSync(values["queries-file"], "utf8"));
  }
  let textGenerator: GeminiTextGenerator | null = null;
  if (queries === null) {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (apiKey === undefined || apiKey === "") {
      return fail(
        REFUSED,
        "the synthesized door needs GEMINI_API_KEY (it writes one probe question per sampled " +
          "passage) — or calibrate with zero LLM: --queries-file PATH (one in-corpus question per line)",
      );
    }
    textGenerator = new GeminiTextGenerator({ apiKey });
  }
  const ooc =
    values["ooc-file"] === undefined
      ? null
      : parseQueriesFile(readFileSync(values["ooc-file"], "utf8"));

  const report = await withPool(dsn, (pool) =>
    runCalibration(pool, {
      tenantId: instance.tenantId,
      corpusId: instance.corpusId,
      provider,
      generation: parseGeneration(values.generation),
      queries,
      textGenerator,
      oocProbes: ooc,
      perNode:
        values["per-node"] === undefined ? undefined : intFlag("--per-node", values["per-node"]),
      minChars:
        values["min-chars"] === undefined ? undefined : intFlag("--min-chars", values["min-chars"]),
    }),
  );
  process.stdout.write(renderReport(report) + "\n");
  return 0;
}

async function gcCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      instance: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const instance = loadInstance(values.instance);
  if (typeof instance === "number") return instance;
  const dsn = resolveDsn(instance);
  if (typeof dsn === "number") return dsn;
  const report = await withPool(dsn, (pool) =>
    runGc(pool, instance, { dryRun: values["dry-run"] ?? false }),
  );
  if (report.collectable.length === 0) {
    process.stdout.write("gc: nothing collectable (active/rollback/grace all hold)\n");
    return 0;
  }
  if (report.dryRun) {
    process.stdout.write(
      `gc (dry-run): would reap generations [${report.collectable.join(", ")}]\n`,
    );
    return 0;
  }
  for (const generation of report.reaped) {
    process.stdout.write(`gc: reaped generation ${generation}\n`);
  }
  return 0;
}

// ---------------------------------------------------------------------------

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(USAGE);
    return command === undefined ? REFUSED : 0;
  }
  try {
    switch (command) {
      case "schema":
        return await schemaCommand(rest);
      case "ingest":
        return await ingestCommand(rest);
      case "calibrate":
        return await calibrateCommand(rest);
      case "gc":
        return await gcCommand(rest);
      default:
        return fail(REFUSED, `unknown command ${JSON.stringify(command)}\n` + USAGE);
    }
  } catch (exc) {
    return fail(classifyFailure(exc), exc instanceof Error ? exc.message : String(exc));
  }
}

process.exitCode = await main(process.argv.slice(2));
