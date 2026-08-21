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

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import pg from "pg";

import { contentPool, ContentStoreError, INGEST_ROLE } from "./db.js";
import { assertGovernanceServable } from "./governance-gate.js";
import {
  parseInstance,
  InstanceParseError,
  NoDatabaseDeclared,
  type ContentInstance,
} from "./instance.js";
import { applySchema, renderSchema, schemaVersion } from "./schema.js";
import { compareSchemaVersion, runMigrations } from "./migrate.js";
import { grantIngest, revokeIngest } from "./grant.js";
import {
  applyTakedown,
  deniedStableIds,
  deniedSubtreeDirs,
  denylistManifest,
  listTakedowns,
  readLedger,
  revokeTakedown,
} from "./takedown-ops.js";
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

const USAGE = `ksor — the KSoR content kernel's write plane

Usage:
  ksor schema (--dim N | --instance PATH) [--apply]
      Print the rendered DDL for the embedding dimension to stdout.
      --instance reads the dimension from instance.md; --apply (with
      --instance) provisions the instance's database, or migrates an
      existing one forward through schema/migrations/.
  ksor ingest --instance PATH --knowledge DIR [--flip] [--source-commit SHA]
      Build one generation from the knowledge tree: structure atomically,
      embed resumably, finalize behind the ready gate. --flip activates it
      (never implicit). The source commit is read from git when the tree is in
      a repository; --source-commit overrides it.
  ksor calibrate --instance PATH [--queries-file PATH] [--ooc-file PATH]
                 [--generation N] [--per-node N] [--min-chars N]
      Measure the abstention floor for this corpus and report it. A
      measurement that does not separate in-corpus from out-of-corpus prints
      the diagnosis and NO floor: there is no safe number to paste.
  ksor grant --instance PATH [--revoke]
      Authorize ingest for the instance's tenant (the row row-level security
      requires), or withdraw it. Idempotent; reports the state it established.
  ksor takedown --instance PATH [--actor NAME]
                (<stable-id> --reason TEXT [--subtree]
                 | --list | --ledger | --revoke <stable-id> | --export PATH)
      Deny a document from EVERY surface. Default scope is the node itself;
      --subtree denies its descendants too. --export writes the manifest the
      site build reads, so a takedown reaches the human surface as well.
      --ledger prints the recorded governance acts: who denied what, when.
      --actor names WHO is performing the act in that ledger; it defaults to the
      operating user. Governance governs acts, so the row has to name someone.
  ksor gc --instance PATH [--dry-run]
      Reap generations the §5 algebra allows (never active/rollback, 40-min
      token grace, ≥2 complete generations remain).

Exit codes: 0 ok · 1 refused · 3 environment
`;

/**
 * The USAGE block for ONE verb — the lines from its `ksor <verb>` heading up to
 * the next one. Sliced from the same string the full usage prints, so a flag
 * cannot be documented in one place and missing from the other.
 */
export function usageFor(command: string): string {
  const lines = USAGE.split("\n");
  // A verb's block starts at its own `  ksor <verb>` heading and runs to the
  // NEXT such heading — including any continuation of the usage line itself,
  // which the previous slice cut off, so `ingest --help` printed no
  // description and `calibrate --help` printed ingest's (round-3 review).
  const isHeading = (l: string): boolean => /^ {2}ksor \S/.test(l);
  const start = lines.findIndex((l) => isHeading(l) && l.trimStart().startsWith(`ksor ${command}`));
  if (start === -1) return USAGE;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(isHeading);
  // Trim trailing blank lines, then add exactly ONE newline. The previous form
  // only fired when trailing whitespace already existed, so every verb except
  // `gc` printed with no final newline and the shell prompt landed mid-line —
  // and `gc` alone also carried the "Exit codes" footer, because it is the last
  // block (round-9 review of PR 43).
  return `${[lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join("\n").replace(/\s+$/, "")}\n`;
}

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

/**
 * The commit the corpus was ingested from, resolved from git when the tree is
 * in a repository.
 *
 * `--source-commit` has always existed and the golden path never passed it, so
 * EVERY generation an adopter produced recorded the literal string
 * "unspecified" — product principle 6 requires a build to record the exact
 * corpus that produced it, and a placeholder records nothing (review
 * 2026-08-20). Resolved here rather than in the scaffold script so it is right
 * however the verb is invoked. A tree that is not a repository, or a git that
 * is not installed, still records the honest sentinel rather than failing an
 * ingest over provenance metadata.
 */
export function detectSourceCommit(knowledgeDir: string | undefined): string {
  if (knowledgeDir === undefined) return "unspecified";
  try {
    const head = execFileSync("git", ["-C", knowledgeDir, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!/^[0-9a-f]{40}$/.test(head)) return "unspecified";
    // A dirty tree did NOT produce that commit; say so rather than citing a
    // commit whose bytes differ from what was just ingested.
    // Path-scoped: a dirty file elsewhere in the repository says nothing about
    // whether the RECORD that was ingested matches the commit (review of PR #43).
    const dirty = execFileSync("git", ["-C", knowledgeDir, "status", "--porcelain", "--", "."], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return dirty === "" ? head : `${head}-dirty`;
  } catch {
    return "unspecified";
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
  // An argument the parser does not know is a REFUSAL — the operator mistyped
  // a flag. Node's parseArgs raises ERR_PARSE_ARGS_* with a string `code`,
  // which isFsError below duck-types as an OS failure, so `--knowledg` exited
  // 3 ("the environment cannot run ksor") for a typo (review 2026-08-20).
  // Checked BEFORE isFsError for exactly that reason.
  if (isArgParseError(exc)) return REFUSED;
  if (exc instanceof ContentStoreError || isFsError(exc)) return ENVIRONMENT;
  return REFUSED;
}

/** Node's parseArgs failures: ERR_PARSE_ARGS_UNKNOWN_OPTION and its siblings. */
function isArgParseError(exc: unknown): boolean {
  const code = (exc as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("ERR_PARSE_ARGS_");
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
  // Re-runnable. The DDL is plain CREATE TABLE, so applying it twice fails on
  // "relation already exists" — which made `schema --apply` a step an operator
  // had to REMEMBER whether they had taken, and made any setup sequence
  // non-repeatable. An already-provisioned database is success, reported as
  // such: the desired state is what the caller asked for (2026-08-20).
  //
  // The state read is a VERSION, never a presence check. A bare
  // `.catch(() => null)` here treated "unreachable", "wrong database" and
  // "permission denied" as "schema not applied" and then tried to re-apply the
  // DDL over live data; and any recorded version, however old, reported
  // "nothing to do" while `serve` refused the same database (review 2026-08-20).
  const required = schemaVersion();
  const state = await withPool(dsn, (pool) => readSchemaState(pool));
  if (state.kind === "uninitialized") {
    await withPool(dsn, (pool) => applySchema(pool, dim));
    process.stdout.write(
      `schema: applied ${required} at dim ${dim} (database named by ${instance.dsnEnv})\n`,
    );
    return 0;
  }

  const cmp = compareSchemaVersion(state.version, required);
  if (cmp === 0) {
    process.stdout.write(
      `schema: already applied (schema_meta ${state.version}) — nothing to do\n`,
    );
    return 0;
  }
  if (cmp > 0) {
    // A NEWER writer provisioned this database. Migrating backwards is not a
    // thing; say so and let the operator upgrade the tool rather than silently
    // proceeding against a shape this build does not know.
    process.stdout.write(
      `schema: database is ${state.version}, ahead of the ${required} this build writes — ` +
        "nothing to do (upgrade ksor to match, or point at another database)\n",
    );
    return 0;
  }

  const report = await withPool(dsn, (pool) => runMigrations(pool, state.version, required));
  if (report.applied.length === 0) {
    process.stdout.write(
      `schema: already applied (schema_meta ${state.version}) — nothing to do\n`,
    );
    return 0;
  }
  process.stdout.write(
    `schema: migrated ${report.from} -> ${report.to} ` +
      `(${report.applied.length} step${report.applied.length === 1 ? "" : "s"}: ` +
      `${report.applied.join(", ")})\n`,
  );
  return 0;
}

type SchemaState = { kind: "uninitialized" } | { kind: "applied"; version: string };

/**
 * What version this database carries — distinguishing "never initialized" from
 * "cannot be read". Only the two SQLSTATEs that mean *reachable but
 * uninitialized* (42P01 no such table, 3D000 no such database) count as
 * uninitialized; everything else propagates, so a connection failure or a
 * permission problem can never be mistaken for an empty database and answered
 * by re-applying DDL over live rows.
 */
async function readSchemaState(pool: pg.Pool): Promise<SchemaState> {
  try {
    const r = await pool.query(
      "SELECT schema_version FROM schema_meta ORDER BY applied_at DESC LIMIT 1",
    );
    const version = (r.rows[0] as { schema_version?: string } | undefined)?.schema_version;
    if (version === undefined || version === "") {
      // The TABLE exists, so the DDL has run — the row is just missing. Calling
      // that "uninitialized" re-runs the full CREATE TABLE over live tables and
      // dies on an opaque 42P07 (review of PR #43).
      throw new ContentStoreError(
        "schema_meta exists but records no version — this database was initialized and then " +
          "lost its version row. Re-applying the DDL over live tables would fail on existing " +
          "relations; restore the row with the version the data actually has, e.g.\n" +
          "  INSERT INTO schema_meta (schema_version, compatible_from) VALUES ('2.3', '2.0');",
      );
    }
    return { kind: "applied", version };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "42P01" || code === "3D000") return { kind: "uninitialized" };
    throw error;
  }
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
  // Resolved once and REPORTED: this is the last link in the provenance chain
  // (answer -> passage -> document -> generation -> commit -> reviewed source).
  // Leaving it silent is how every adopter shipped "unspecified" without
  // noticing the chain terminated one link early.
  const sourceCommit = values["source-commit"] ?? detectSourceCommit(values.knowledge);
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
          `  fix: finish applying the DDL (ksor schema --instance ... --apply), then ingest`,
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
        sourceCommit,
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
            `database, not by a flag\n  fix: ksor grant --instance <instance.md>`,
        );
      }
      throw exc;
    }
  });
  if (report.unchanged) {
    // The record already serves these exact bytes at this commit: no
    // generation consumed, nothing embedded. Re-running ingest is the ordinary
    // refresh loop, so an unedited record must cost nothing to re-ingest.
    process.stdout.write(
      `ingest: unchanged — generation ${report.generation} already serves this corpus\n`,
    );
    return 0;
  }
  process.stdout.write(
    sourceCommit === "unspecified"
      ? "source: unspecified — knowledge/ is not in a git repository, so this generation " +
          "cannot be traced back to a reviewed commit\n"
      : `source: ${sourceCommit}\n`,
  );
  process.stdout.write(
    `ingest: generation ${report.generation} — ${report.nodes} nodes, ${report.chunks} chunks; ` +
      `embedded ${report.embedded}, carried ${report.carried}, failed ${report.failed}\n`,
  );
  if (report.refusal !== null) return fail(REFUSED, report.refusal);

  // The act that CREATES the record must refuse where serving it would.
  // `ingest --flip` exited 0 on a generation `ksor serve` then refused to boot
  // on, so the deploy step was green and the container crash-looped — with the
  // site and `pnpm check` both reporting the problem and the publishing act
  // silent (round-6 review of #43).
  const governance = await withPool(dsn, (pool) =>
    assertGovernanceServable(pool, instance, report.generation).then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    ),
  );
  if (governance !== null) {
    return fail(
      REFUSED,
      `generation ${report.generation} was built, but no surface can serve it\n` +
        `  ${governance.split("\n").join("\n  ")}`,
    );
  }
  // A flip was already narrated by the build log ("FLIPPED active generation
  // -> N"); only the withheld state still needs saying.
  if (!report.flipped) process.stdout.write("ready; flip withheld (pass --flip to activate)\n");
  return 0;
}

/**
 * Does this project actually READ the manifest we just wrote?
 *
 * A scaffold is adopter-owned (decision 4), so upgrading the CLI does not touch
 * their `system/site` or their `package.json`. A project scaffolded before the
 * manifest existed has neither the build step that exports it nor the staging
 * code that reads it — so a takedown was imposed, the CLI's own remedy line was
 * followed exactly, the site was rebuilt, and the withdrawn document was still
 * in `out/docs/` and `llms.txt` while the MCP door on the same database refused
 * it. Decision 19 says a surface that refuses must refuse on BOTH surfaces, and
 * the upgrade path broke that silently (round-7 review of #43, reproduced).
 *
 * Detecting it is cheap and the export is the only place that can: it is the
 * moment the operator is looking, and it knows both ends.
 */
function manifestConsumerWarnings(instancePath: string, exportPath: string): string[] {
  const root = dirname(resolve(instancePath));
  const out: string[] = [];
  const readIf = (rel: string): string | null => {
    try {
      return readFileSync(join(root, rel), "utf8");
    } catch {
      return null;
    }
  };

  const manifestName = basename(exportPath);
  const pkg = readIf("package.json");
  if (pkg !== null && !/takedown[^"]*--export|export-denylist/.test(pkg)) {
    out.push(
      `  WARNING: this project's package.json never runs the export, so a plain \`pnpm build\`\n` +
        `  publishes the site WITHOUT it. Add to "scripts":\n` +
        `    "export-denylist": "ksor takedown --instance instance.md --export ${manifestName}"\n` +
        `  and chain it: "build": "pnpm export-denylist && pnpm -C system/site build"\n`,
    );
  }

  const staging = readIf(join("system", "site", "lib", "stage-knowledge.ts"));
  if (staging !== null && !staging.includes(manifestName)) {
    out.push(
      `  WARNING: this project's system/site/lib/stage-knowledge.ts does not read\n` +
        `  ${manifestName}, so the site will publish withdrawn documents no matter how often\n` +
        `  you export. The site is yours (it is copied into your repo, not linked), so an\n` +
        `  upgrade does not update it: re-scaffold that file from a current \`ksor init\`,\n` +
        `  or port the denylist read into it.\n`,
    );
  }
  return out;
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

async function grantCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      instance: { type: "string" },
      revoke: { type: "boolean", default: false },
    },
  });
  const instance = loadInstance(values.instance);
  if (typeof instance === "number") return instance;
  const dsn = resolveDsn(instance);
  if (typeof dsn === "number") return dsn;
  const revoke = values.revoke ?? false;
  const outcome = await withPool(dsn, (pool) =>
    revoke ? revokeIngest(pool, instance.tenantId) : grantIngest(pool, instance.tenantId),
  );
  // Report the STATE established, never merely "ok" — a repeat run must be
  // distinguishable from the first (specs/ksor/grant/spec.md).
  const said = {
    granted: `granted: ${INGEST_ROLE} may now ingest ${instance.tenantId}`,
    "already-granted": `already granted: ${INGEST_ROLE} could already ingest ${instance.tenantId}`,
    revoked: `revoked: ${INGEST_ROLE} may no longer ingest ${instance.tenantId}`,
    "not-granted": `not granted: ${INGEST_ROLE} could not ingest ${instance.tenantId} anyway`,
  }[outcome];
  process.stdout.write(said + "\n");
  return 0;
}

async function takedownCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      instance: { type: "string" },
      reason: { type: "string" },
      subtree: { type: "boolean", default: false },
      list: { type: "boolean", default: false },
      ledger: { type: "boolean", default: false },
      revoke: { type: "string" },
      export: { type: "string" },
      actor: { type: "string" },
    },
  });
  // A failed export must leave NO manifest, not a stale one. The site fails
  // CLOSED on a missing manifest (it cannot tell "nothing denied" from "nobody
  // asked") and fails OPEN on a stale one, which looks authoritative and can
  // predate the very takedown being published. So the target is removed BEFORE
  // the attempt: every path that does not write a fresh answer leaves none.
  // The scaffold used to do this in the npm script; a governance guarantee does
  // not belong in a shell string the adopter owns and can edit (found live,
  // round 4 of the #43 review — an unreachable database exited 3 and left the
  // previous run's manifest in place).
  if (values.export !== undefined) rmSync(values.export, { force: true });

  // --export runs inside `pnpm build`, so it is the ONE takedown mode that must
  // ANSWER for a record with no database instead of refusing — a level-0
  // project has to be able to build. It writes `source: "none"`, the shape the
  // site reads as "no database declared, nothing can be denied", and exits 0.
  //
  // ONE no-database shape reaches here: the level-0 record that declares no
  // `database:` block, which refuses during PARSING before any DSN is
  // consulted (found live in round 4, after removing the scaffold's `|| true`
  // made `pnpm build` fail on a freshly scaffolded record).
  //
  // A record that DECLARES a database and has no DSN is NOT this case and is
  // refused below — writing `source: "none"` for it published a withdrawn
  // document. This comment described that fail-open as legitimate for forty
  // lines after it was closed (round-9 review of PR 43).
  //
  // Everything else — database configured and unreachable, permission denied,
  // a malformed instance.md — still exits non-zero. That is precisely what the
  // `|| true` used to swallow: the export "succeeded", wrote nothing, and the
  // site build then refused with a remedy pointing back at the command that had
  // just silently failed (round-3 review of #43).
  const exportNothing = (corpusId: string, why: string): number => {
    const manifest = denylistManifest(corpusId, [], new Date(), "none");
    writeFileSync(values.export!, JSON.stringify(manifest, null, 2) + "\n");
    process.stdout.write(
      `takedown: ${why}, so this record has no database to ask. ` +
        `Wrote source="none" (nothing denied) to ${values.export}.\n`,
    );
    // The consumer check is about the PROJECT, not the database: a level-0
    // project upgrading has the same broken chain, and this is the moment the
    // operator is looking.
    if (values.instance !== undefined) {
      for (const warning of manifestConsumerWarnings(values.instance, values.export!)) {
        process.stderr.write(warning);
      }
    }
    return 0;
  };

  if (values.export !== undefined && values.instance !== undefined) {
    try {
      parseInstance(values.instance);
    } catch (exc) {
      if (exc instanceof NoDatabaseDeclared) {
        return exportNothing(exc.instanceName, "instance.md declares no database: block");
      }
      // Any other parse failure is a real refusal — fall through to loadInstance,
      // which reports it with its remedy.
    }
  }

  const loaded = loadInstance(values.instance);
  if (typeof loaded === "number") return loaded;
  const instance = loaded;

  // NOT a no-database case. A record that DECLARES a database has one; this
  // host merely cannot reach it, and those are opposite answers. Writing
  // `source: "none"` here published a withdrawn document: the site's `isDenied`
  // reads only `manifest.denied` and never `source`, so file PRESENCE is the
  // whole fail-closed gate — and this path created the file. The live shape is
  // a Vercel build (the site is database-free by decision 11, so the DSN lives
  // only in the serving runtime): `pnpm build` printed "nothing denied",
  // exited 0, and shipped the withdrawn document to /docs and llms.txt
  // (round-4 review of #43 — a hole this very branch had just opened).
  if (values.export !== undefined && (process.env[instance.dsnEnv] ?? "") === "") {
    return fail(
      ENVIRONMENT,
      `${instance.dsnEnv} is unset, and instance.md declares a database (named by ` +
        `database.dsn_env)\n` +
        "  why: a takedown lives in that database. Without it this build cannot tell 'nothing " +
        "is denied' from 'nobody asked', and publishing a withdrawn document is the failure " +
        "this export exists to prevent\n" +
        `  fix: export ${instance.dsnEnv}='postgresql://...' for the build, or remove the ` +
        "database: block if this record has no database",
    );
  }

  const dsn = resolveDsn(instance);
  if (typeof dsn === "number") return dsn;
  // Who performed the act. Governance governs ACTS: the ledger row has to name
  // someone, and "unknown" is a worse answer than the operating user.
  const actor = values.actor ?? process.env["USER"] ?? process.env["USERNAME"] ?? "operator";

  if (values.export !== undefined) {
    // EXPANDED here, where the tree lives: the site has no parent_id to walk.
    // The subtree DIRECTORIES go too, because the expanded list can only name
    // what the active generation contains — and the site builds from disk,
    // where a document added under a withdrawn section already exists.
    const { rows, subtrees } = await withPool(dsn, async (pool) => ({
      rows: await deniedStableIds(pool, instance),
      subtrees: await deniedSubtreeDirs(pool, instance),
    }));
    const manifest = denylistManifest(instance.corpusId, rows, new Date(), "database", subtrees);
    writeFileSync(values.export, JSON.stringify(manifest, null, 2) + "\n");
    const also = subtrees.length === 0 ? "" : ` and ${subtrees.length} subtree(s)`;
    process.stdout.write(
      `takedown: exported ${rows.length} denial(s)${also} to ${values.export}\n`,
    );
    for (const warning of manifestConsumerWarnings(values.instance!, values.export)) {
      process.stderr.write(warning);
    }
    return 0;
  }

  if (values.ledger) {
    // The §7 trail, read through the auditor role (schema 2.3). Before it, the
    // ledger had FORCE row-level security, an INSERT policy and no reader at
    // all — written forever, readable by nobody.
    const rows = await withPool(dsn, (pool) => readLedger(pool, instance, 50));
    if (rows.length === 0) {
      process.stdout.write("ledger: no governance acts recorded for this corpus yet\n");
      return 0;
    }
    for (const r of rows) {
      const when = r.createdAt.toISOString().replace("T", " ").slice(0, 19);
      process.stdout.write(`${when}\t${r.action}\t${r.actor}\t${JSON.stringify(r.detail)}\n`);
    }
    return 0;
  }

  if (values.list) {
    const rows = await withPool(dsn, (pool) => listTakedowns(pool, instance));
    if (rows.length === 0) {
      process.stdout.write("takedown: nothing is denied in this corpus\n");
      return 0;
    }
    for (const r of rows) {
      process.stdout.write(`${r.stableId}\t${r.scope}\t${r.reason}\n`);
    }
    return 0;
  }

  if (values.revoke !== undefined) {
    const outcome = await withPool(dsn, (pool) =>
      revokeTakedown(pool, instance, { stableId: values.revoke!, actor }),
    );
    process.stdout.write(
      outcome.changed
        ? `takedown: lifted — ${outcome.stableId} serves again from the next request\n`
        : `takedown: ${outcome.stableId} was not denied; nothing to lift\n`,
    );
    return 0;
  }

  const stableId = positionals[0];
  if (stableId === undefined || stableId === "") {
    return fail(
      REFUSED,
      "takedown: name the document's stable_id, or pass --list / --revoke / --export\n" +
        "  the stable_id is what search and read report as provenance.stable_id",
    );
  }
  if (values.reason === undefined || values.reason.trim() === "") {
    // A denial with no recorded reason is an unexplained hole in the record.
    return fail(
      REFUSED,
      "takedown: --reason TEXT is required — a denial with no recorded reason is an " +
        "unexplained hole in the record, and this row is the only place it is written down",
    );
  }
  const scope = values.subtree ? "subtree" : "node";
  const outcome = await withPool(dsn, (pool) =>
    applyTakedown(pool, instance, {
      stableId,
      scope,
      reason: values.reason!,
      actor,
    }),
  );
  process.stdout.write(
    outcome.changed
      ? `takedown: ${outcome.stableId} denied (scope: ${scope}) — no surface serves it from now on\n`
      : `takedown: ${outcome.stableId} was already denied with the same scope and reason\n`,
  );
  if (outcome.resolves === false) {
    // Recorded, but it currently names nothing — almost always a typo, and the
    // difference between "withdrawn" and "still serving" is the whole point.
    process.stdout.write(
      `  WARNING: no document in the serving generation has the stable_id ` +
        `${JSON.stringify(outcome.stableId)}. The denial is recorded (it will apply if that id ` +
        `ever appears), but nothing is withdrawn right now — check the id with ` +
        `\`ksor takedown --instance ${values.instance} --list\` or the provenance.stable_id a ` +
        `search result reports.\n`,
    );
  }
  process.stdout.write(
    "  the SITE reads a manifest, not the database: run " +
      "`ksor takedown --instance ... --export <path>` before building it, or the human " +
      "surface keeps publishing this document\n",
  );
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

/**
 * Run the `ksor-content` CLI and return its exit code. Exported (not a
 * side-effecting bin) so the bundled kernel package can expose it as a second
 * bin without a double-run; the thin `cli-bin.ts` is the executable entry.
 */
export async function runContentCli(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(USAGE);
    return command === undefined ? REFUSED : 0;
  }
  // `ksor <verb> --help` answers for THAT verb. It used to reach parseArgs,
  // which refused `--help` as an unknown option — so the corpus verbs' flags
  // were documented nowhere the binary could reach (review 2026-08-20).
  if (rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(usageFor(command));
    return 0;
  }
  try {
    switch (command) {
      case "schema":
        return await schemaCommand(rest);
      case "ingest":
        return await ingestCommand(rest);
      case "calibrate":
        return await calibrateCommand(rest);
      case "grant":
        return await grantCommand(rest);
      case "takedown":
        return await takedownCommand(rest);
      case "gc":
        return await gcCommand(rest);
      default:
        return fail(REFUSED, `unknown command ${JSON.stringify(command)}\n` + USAGE);
    }
  } catch (exc) {
    if (isArgParseError(exc)) {
      return fail(
        REFUSED,
        `error: bad-args\n${exc instanceof Error ? exc.message : String(exc)}\n` +
          `  see: ksor ${command} --help`,
      );
    }
    return fail(classifyFailure(exc), exc instanceof Error ? exc.message : String(exc));
  }
}
