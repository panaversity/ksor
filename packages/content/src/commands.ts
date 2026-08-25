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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import pg from "pg";

import { contentPool, ContentStoreError, INGEST_ROLE, runIngest } from "./db.js";
import { assertGovernanceServable } from "./governance-gate.js";
import { flip } from "./ingest/generation.js";
import {
  parseInstance,
  InstanceParseError,
  NoDatabaseDeclared,
  type ContentInstance,
} from "./instance.js";
import { applySchema, renderSchema, schemaVersion, SchemaStateError } from "./schema.js";
import { compareSchemaVersion, runMigrations } from "./migrate.js";
import { grantIngest, revokeIngest } from "./grant.js";
import {
  ledgerActs,
  ledgerDenials,
  listTakedowns,
  readLedger,
  type LedgerRow,
  type TakedownRow,
} from "./takedown-ops.js";
import { applyLedger, unmergedLines } from "./ingest/ledger-apply.js";
import { appendEntry, mintLedgerId, parseLedger, type LedgerEntry } from "./record/ledger.js";
import { resolveInstanceDir } from "./record/load.js";
import { parsePolicy } from "./record/policy.js";
import {
  authorizeActor,
  checkActorNamed,
  conceptPathOf,
  decideRowStep,
  expectedFor,
  planTakedown,
  subtreeDirOf,
  writesLedger,
  type VerbRefusal,
} from "./takedown-verb.js";
import { buildShippedProvider, providerNeedsApiKey } from "./lib/providers/registry.js";
import type { EmbeddingProvider } from "./lib/embedding.js";
import { ManifestError } from "./ingest/manifest.js";
import { buildGeneration, flipRefusal, RecordRefused, type BuildReport } from "./ingest/build.js";
import { checkEmbeddingSpace } from "./lib/space.js";
import { parseQueriesFile, runCalibration } from "./calibrate/run.js";
import { renderReport } from "./calibrate/math.js";
import { GATE_PREDICATE_DIGEST } from "./lib/search.js";
import { widestViewer } from "./lib/policy-row.js";
import { overlapAdvice } from "./calibrate/overlap.js";
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
  ksor ingest --instance PATH [--flip] [--source-commit SHA]
      Build one generation from the record beside instance.md: run the record
      checker, require a fresh build.lock.json, apply the takedown ledger, then
      structure atomically, embed resumably, finalize behind the ready gate.
      --flip activates it (never implicit). The source commit is read from git
      when the tree is in a repository; --source-commit overrides it.
  ksor calibrate --instance PATH [--queries-file PATH] [--ooc-file PATH]
                 [--generation N] [--per-node N] [--min-chars N]
      Measure the abstention floor for this corpus and report it. A
      measurement that does not separate in-corpus from out-of-corpus prints
      the diagnosis and NO floor: there is no safe number to paste.
  ksor grant --instance PATH [--revoke]
      Authorize ingest for the instance's tenant (the row row-level security
      requires), or withdraw it. Idempotent; reports the state it established.
  ksor takedown --actor ACTOR [--instance PATH] [--scope node|subtree]
                --reason TEXT [--file-only] <stable-id>
                --actor ACTOR (--revoke ENTRY-ID | --removed ENTRY-ID) [--reason TEXT]
                --apply | --list | --ledger        (read or replay; no --actor)
      Withdraw a document from EVERY surface, ledger first: the act is appended
      to .ksor/takedowns.yaml — committed, append-only, read by the site — and
      then, when the record declares a database and its DSN is present, written
      as the denylist row the door reads. A record with no database gets
      takedown through the ledger alone. --scope subtree denies a directory and
      every descendant; --file-only records the entry without the row;
      --revoke lifts a denial by naming its entry id (never by deleting a line)
      and --removed records that a denied document was deleted; --apply writes
      every unapplied entry's row under its own recorded actor. --list shows
      what is denied, --ledger the recorded governance acts.
      --actor names WHO is performing the act and is REQUIRED to write the
      ledger: the entry is the evidence that a person withdrew this document, a
      name guessed from the shell attributes nothing, and the policy's
      takedown_authorities must name it.
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
/**
 * WHY a generation could not name the commit that produced it.
 *
 * Three different states used to collapse into one word, and the message built
 * from it named only the first: "knowledge/ is not in a git repository". For a
 * freshly scaffolded project that is FALSE — `ksor init` runs `git init`
 * (`init/index.ts:95`), so the repository exists and merely has no commit yet,
 * and `rev-parse HEAD` fails with "unknown revision" rather than because
 * nothing is there. The reader was sent to `git init`, which they had already
 * done, in the one message that governs provenance.
 */
export type ProvenanceGap = "no-repo" | "no-commit" | "no-git" | "not-asked";

export function provenanceGap(knowledgeDir: string | undefined): ProvenanceGap {
  if (knowledgeDir === undefined) return "not-asked";
  const run = (args: readonly string[]): { ok: boolean; out: string } => {
    try {
      return {
        ok: true,
        out: execFileSync("git", ["-C", knowledgeDir, ...args], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim(),
      };
    } catch {
      return { ok: false, out: "" };
    }
  };
  // `git --version` distinguishes "git is not installed" from "this is not a
  // repository" — `ksor init` already warns about the former and must not be
  // contradicted here.
  if (!run(["--version"]).ok && !run(["rev-parse", "--git-dir"]).ok) return "no-git";
  if (!run(["rev-parse", "--git-dir"]).ok) return "no-repo";
  return "no-commit";
}

/** The remedy for each, because the reader's next command differs. */
export function provenanceNotice(gap: ProvenanceGap): string {
  const why = "so this generation cannot be traced back to a reviewed commit";
  switch (gap) {
    case "no-commit":
      return (
        `source: unspecified — knowledge/ is in a git repository with no commits yet, ${why}.\n` +
        "  fix: commit the record (git add knowledge && git commit) and re-run"
      );
    case "no-repo":
      return (
        `source: unspecified — knowledge/ is not in a git repository, ${why}.\n` +
        "  fix: git init, commit the record, and re-run"
      );
    case "no-git":
      return (
        `source: unspecified — git is not installed, ${why}.\n` +
        "  fix: install git, or pass --source-commit <sha> if the record is versioned elsewhere"
      );
    case "not-asked":
      return `source: unspecified — no knowledge directory was given, ${why}.`;
  }
}

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
  // A REACHABLE database whose recorded state is wrong is a data problem the
  // operator fixes — REFUSED, like every other data problem above. Only a
  // genuine store outage is ENVIRONMENT.
  if (exc instanceof SchemaStateError) return REFUSED;
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

  // The record's stemming is rendered into the DDL, the way its dimension is.
  // `--dim` alone names no record, so it falls back to the shipped default.
  const tsConfig = instance?.textSearchConfig;
  if (!values.apply) {
    process.stdout.write(renderSchema(dim, undefined, tsConfig));
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
    await withPool(dsn, (pool) => applySchema(pool, dim, tsConfig));
    process.stdout.write(
      `schema: applied ${required} at dim ${dim}, text search ${tsConfig ?? "english"} ` +
        `(database named by ${instance.dsnEnv})\n`,
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
      throw new SchemaStateError(
        "schema_meta exists but records no version — this database was initialized and then " +
          "lost its version row. Re-applying the DDL over live tables would fail on existing " +
          "relations; restore the row with the version the data actually has, e.g.\n" +
          `  INSERT INTO schema_meta (schema_version, compatible_from) VALUES ('${schemaVersion()}', '2.0');`,
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
      flip: { type: "boolean", default: false },
      "source-commit": { type: "string" },
    },
  });
  const instance = loadInstance(values.instance);
  if (typeof instance === "number") return instance;
  // The record root is where instance.md lives: `knowledge/`, `.ksor/` and
  // build.lock.json resolve from it (build spec §1). `--knowledge` is GONE —
  // it could only ever name that one directory, and a flag that works while
  // being absent from `--help` is a trap. Passing it now refuses as any
  // unknown flag does, and `ksor migrate` strips it from the scripts the old
  // scaffold shipped.
  const recordRoot = dirname(resolve(values.instance!));
  const knowledgeDir = join(recordRoot, "knowledge");
  // Resolved once and REPORTED: this is the last link in the provenance chain
  // (answer -> passage -> document -> generation -> commit -> reviewed source).
  // Leaving it silent is how every adopter shipped "unspecified" without
  // noticing the chain terminated one link early.
  const sourceCommit = values["source-commit"] ?? detectSourceCommit(knowledgeDir);
  const dsn = resolveDsn(instance);
  if (typeof dsn === "number") return dsn;
  const provider = composeProvider(instance);
  if (typeof provider === "number") return provider;

  let report: BuildReport;
  try {
    report = await withPool(dsn, async (pool) => {
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
          recordRoot,
          // Provenance is recorded honestly: without --source-commit the sources
          // rows say so rather than carrying a guessed SHA.
          sourceCommit,
          // NEVER flip inside the build when the caller asked for one: the
          // governance gate below has to run against the new generation BEFORE
          // it becomes the active one. Checking after the flip reported the
          // problem and published anyway — a command that exits 1 with the
          // record's active pointer already moved, which is exactly what the
          // shrink guard does NOT do (it refuses inside the build and leaves the
          // old generation serving). Found live against Neon, 2026-08-21.
          flip: false,
          provider,
          onLog: (line) => process.stdout.write(line + "\n"),
          onReport: (line) => process.stderr.write(line + "\n"),
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
  } catch (exc) {
    // The record refused — the checker, the lock gate or the ledger baseline.
    // Nothing was written; the slug is the first stderr line (principle 4).
    if (exc instanceof RecordRefused) return fail(REFUSED, exc.message);
    throw exc;
  }
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
      ? provenanceNotice(provenanceGap(knowledgeDir)) + "\n"
      : `source: ${sourceCommit}\n`,
  );
  process.stdout.write(
    `ingest: generation ${report.generation} — ${report.nodes} nodes, ${report.chunks} chunks; ` +
      `embedded ${report.embedded}, carried ${report.carried}, failed ${report.failed}\n`,
  );
  // SAY what will not be found. A chunk classified as navigation is stored,
  // embedded and readable — and excluded from every retrieval arm. Since
  // decision 22 that classification is a SHAPE (link-dominated, or too little
  // text left to answer anything) rather than a length, so what lands here is
  // usually an index page and no longer, as it once was, most of a handbook.
  //
  // Not a refusal — a record made largely of link pages can be perfectly
  // healthy. But "honest absence, never silent weakness" applies to publishing
  // as much as to answering, and an adopter should not need SQL to learn which
  // of their pages can only be reached by name.
  if (report.unsearchable > 0) {
    const pct = Math.round((report.unsearchable / Math.max(report.chunks, 1)) * 100);
    process.stdout.write(
      `  not searchable: ${report.unsearchable} of ${report.chunks} chunk(s) (${pct}%) read as ` +
        `navigation rather than content — stored and readable, but no search returns them\n`,
    );
    if (report.unsearchableSources.length > 0) {
      const named = report.unsearchableSources.slice(0, 10).join(", ");
      const more =
        report.unsearchableSources.length - Math.min(10, report.unsearchableSources.length);
      process.stdout.write(
        `  FOUND ONLY BY NAME: ${named}${more > 0 ? `, and ${more} more` : ""} — ` +
          "no searchable chunk at all — a page of links reads as navigation; give it " +
          "prose of its own, or reach it by slug\n",
      );
    }
  }
  if (report.refusal !== null) return fail(REFUSED, report.refusal);

  // The act that CREATES the record must refuse where serving it would.
  // `ingest --flip` exited 0 on a generation `ksor serve` then refused to boot
  // on, so the deploy step was green and the container crash-looped — with the
  // site and `pnpm check` both reporting the problem and the publishing act
  // silent (round-6 review of #43).
  const governance = await withPool(dsn, (pool) =>
    assertGovernanceServable(pool, instance, report.generation, {
      report: (line) => process.stderr.write(line + "\n"),
    }).then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    ),
  );
  if (governance !== null) {
    return fail(
      REFUSED,
      `generation ${report.generation} was built and NOT activated — no surface could serve it\n` +
        `  ${governance.split("\n").join("\n  ")}\n` +
        `  note: generation ${report.generation} is left behind, un-activated; \`ksor gc\` reaps it ` +
        "once the grace window passes. The previously active generation still serves.",
    );
  }

  // Governance is clean, so activate — the act the caller asked for, performed
  // only after everything that could refuse it has run.
  //
  // The shrink guard runs HERE, in the same transaction as the flip, because
  // this command is now the only thing that flips. It used to live inside
  // `buildGeneration`'s flip branch, and moving the flip out of the build to
  // put the governance gate ahead of it silently retired the guard on this
  // path: a record that lost 80% of its documents published without a word
  // (found live 2026-08-21). One decision, `flipRefusal`, shared by both.
  if (values.flip === true && !report.unchanged) {
    const refusal = await withPool(dsn, (pool) =>
      runIngest(pool, instance.tenantId, async (client) => {
        const stop = await flipRefusal(client, {
          tenantId: instance.tenantId,
          corpusId: instance.corpusId,
          newGeneration: report.generation,
          force: false,
          log: (line) => process.stdout.write(line + "\n"),
        });
        if (stop !== null) return stop;
        await flip(client, {
          tenantId: instance.tenantId,
          corpusId: instance.corpusId,
          toGeneration: report.generation,
        });
        return null;
      }),
    );
    if (refusal !== null) return fail(REFUSED, refusal);
    process.stdout.write(`FLIPPED active generation -> ${report.generation}\n`);
  }
  // Only the WITHHELD state still needs saying — the flip above narrates
  // itself. `report.flipped` is always false now (the build never flips; this
  // command does, after the governance gate), so the caller's intent is what
  // decides, not the build's report.
  if (values.flip !== true) {
    process.stdout.write("ready; flip withheld (pass --flip to activate)\n");
  }
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

  const report = await withPool(dsn, async (pool) =>
    runCalibration(pool, {
      tenantId: instance.tenantId,
      corpusId: instance.corpusId,
      // The floor is a property of the RECORD, not of one caller's tier, so
      // calibration measures the widest viewer there is: `public` plus every
      // audience the ingested policy registers. Named rather than left to the
      // `*` sentinel, because the sentinel is a scope no door ever binds and a
      // floor must be measured on a set the door can actually serve.
      viewer: await widestViewer(pool, instance),
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
  process.stdout.write(renderReport(report, GATE_PREDICATE_DIGEST) + "\n");
  const advice = overlapAdvice(report);
  if (advice !== null) process.stdout.write(advice);
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

/** One governance act per line, newest first: when, what, who, detail. */
function printLedger(rows: readonly LedgerRow[]): void {
  if (rows.length === 0) {
    process.stdout.write("ledger: no governance acts recorded for this corpus yet\n");
    return;
  }
  for (const r of rows) {
    const when = r.createdAt.toISOString().replace("T", " ").slice(0, 19);
    process.stdout.write(`${when}\t${r.action}\t${r.actor}\t${JSON.stringify(r.detail)}\n`);
  }
}

/** One denial in force per line: what, at which scope, why. */
function printDenials(rows: readonly TakedownRow[]): void {
  if (rows.length === 0) {
    process.stdout.write("takedown: nothing is denied in this corpus\n");
    return;
  }
  for (const r of rows) process.stdout.write(`${r.stableId}\t${r.scope}\t${r.reason}\n`);
}

async function takedownCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      instance: { type: "string" },
      reason: { type: "string" },
      scope: { type: "string" },
      revoke: { type: "string" },
      removed: { type: "string" },
      apply: { type: "boolean", default: false },
      "file-only": { type: "boolean", default: false },
      list: { type: "boolean", default: false },
      ledger: { type: "boolean", default: false },
      actor: { type: "string" },
    },
  });

  const refuse = (r: VerbRefusal): number => fail(REFUSED, `${r.slug}: ${r.why}\n  fix: ${r.fix}`);

  const planned = planTakedown({
    stableId: positionals[0],
    scope: values.scope,
    reason: values.reason,
    revoke: values.revoke,
    removed: values.removed,
    apply: values.apply,
    list: values.list,
    ledger: values.ledger,
  });
  if (!planned.ok) return refuse(planned.refusal);
  const { mode, reason } = planned;

  // The record root is where instance.md lives, resolved through the ONE
  // helper `build`, `migrate` and `ingest` share (build spec §1): the ledger,
  // the policy and the bundle all hang off it.
  const instancePath =
    values.instance ??
    (resolveInstanceDir(process.cwd()) === null
      ? undefined
      : join(resolveInstanceDir(process.cwd())!, "instance.md"));
  if (instancePath === undefined) {
    return fail(
      REFUSED,
      "--instance PATH is required (no instance.md was found at or above the working directory)",
    );
  }
  const root = dirname(resolve(instancePath));

  // The POLICY decides who may do this, and it is read — and enforced — before
  // any DSN is resolved: an unauthorised actor is an argument error (exit 1),
  // never "the environment cannot run ksor" (exit 3). The half that needs no
  // file runs FIRST, so a missing --actor is never reported as a missing
  // policy just because the record also has something else wrong with it.
  if (writesLedger(mode)) {
    const unnamed = checkActorNamed(values.actor);
    if (unnamed !== null) return refuse(unnamed);
    const policyPath = join(root, ".ksor", "governance.yaml");
    const parsed = parsePolicy(
      existsSync(policyPath) ? readFileSync(policyPath, "utf8") : null,
      ".ksor/governance.yaml",
    );
    if (!parsed.ok) {
      return fail(
        REFUSED,
        parsed.refusals
          .map((r) => `${r.slug}: ${r.path}\n  why: ${r.why}\n  fix: ${r.fix}`)
          .join("\n"),
      );
    }
    const denied = authorizeActor(values.actor, parsed.policy);
    if (denied !== null) return refuse(denied);
  }

  // A record that declares no `database:` is a legitimate level-0 shape, not a
  // typo: it gets takedown through the ledger alone (record spec §5).
  let instance: ContentInstance | null = null;
  let declaresDatabase = true;
  try {
    instance = parseInstance(instancePath);
  } catch (exc) {
    if (exc instanceof NoDatabaseDeclared) declaresDatabase = false;
    else {
      const loaded = loadInstance(instancePath);
      return typeof loaded === "number" ? loaded : REFUSED;
    }
  }

  const ledgerPath = join(root, ".ksor", "takedowns.yaml");
  const ledgerText = existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf8") : null;
  const parsedLedger = parseLedger(ledgerText, ".ksor/takedowns.yaml");
  if (!parsedLedger.ok) {
    return fail(
      REFUSED,
      parsedLedger.refusals
        .map((r) => `${r.slug}: ${r.path}\n  why: ${r.why}\n  fix: ${r.fix}`)
        .join("\n"),
    );
  }

  // ── the read-only modes: no actor, no ledger write ──────────────────────
  if (mode.kind === "list" || mode.kind === "ledger" || mode.kind === "apply") {
    if (instance === null) {
      if (mode.kind === "apply") {
        process.stdout.write(
          "takedown: instance.md declares no database, so there is nothing to apply — " +
            "the ledger IS the record and the site reads it at its next build\n",
        );
        return 0;
      }
      // Both flags are answerable from the committed file at this rung, and
      // refusing them broke the documented workflow: `--revoke` takes a LEDGER
      // ENTRY id and `--ledger` is what lists it, so a level-0 adopter had to
      // open the YAML by hand to revoke anything.
      process.stdout.write(
        `${mode.kind === "ledger" ? "ledger" : "takedown"}: from .ksor/takedowns.yaml — ` +
          "instance.md declares no database, so the committed ledger is the whole state\n",
      );
      if (mode.kind === "ledger") {
        printLedger(ledgerActs(parsedLedger.ledger));
      } else {
        printDenials(ledgerDenials(parsedLedger.ledger));
      }
      return 0;
    }
    const dsn = resolveDsn(instance);
    if (typeof dsn === "number") return dsn;
    if (mode.kind === "apply") {
      const applied = await withPool(dsn, (pool) =>
        runIngest(pool, instance!.tenantId, (c) => applyLedger(c, instance!, parsedLedger.ledger)),
      );
      process.stdout.write(
        applied.changed === 0
          ? "takedown: every ledger entry was already applied — nothing changed\n"
          : `takedown: applied ${applied.changed} denial row(s) from .ksor/takedowns.yaml\n`,
      );
      for (const line of unmergedLines(applied.unmerged)) process.stderr.write(line + "\n");
      return 0;
    }
    if (mode.kind === "ledger") {
      // The §7 trail, read through the auditor role (schema 2.3).
      printLedger(await withPool(dsn, (pool) => readLedger(pool, instance!, 50)));
      return 0;
    }
    printDenials(await withPool(dsn, (pool) => listTakedowns(pool, instance!)));
    return 0;
  }

  // ── the writing modes ───────────────────────────────────────────────────
  const dsnEnv = instance?.dsnEnv ?? "the DSN variable";
  const step = decideRowStep({
    declaresDatabase,
    dsnPresent: instance !== null && (process.env[instance.dsnEnv] ?? "") !== "",
    dsnEnv,
    fileOnly: values["file-only"],
  });
  if (!step.ok) return refuse(step.refusal);

  const at = new Date().toISOString();
  const actor = values.actor!.trim();
  let entry: LedgerEntry;
  if (mode.kind === "deny") {
    const target = conceptPathOf(mode.stableId) ?? subtreeDirOf(mode.stableId)!;
    entry = {
      kind: "denial",
      id: mintLedgerId(at),
      by: actor,
      at,
      reason,
      stableId: mode.stableId,
      scope: mode.scope,
      // What the verb SAW: a denial may precede the document it names
      // (decision 14), and `expected` is how the checker later tells a
      // deliberate removal from a rename that would republish.
      expected: expectedFor(existsSync(join(root, target))),
    };
  } else {
    const target = parsedLedger.ledger.entries.find((e) => e.id === mode.target);
    if (target === undefined || target.kind !== "denial") {
      return refuse({
        slug: "ksor-takedown-unknown-entry",
        why:
          target === undefined
            ? `\`${mode.target}\` is no entry in .ksor/takedowns.yaml`
            : `\`${mode.target}\` is a ${target.kind} — only a denial can be revoked or recorded as removed`,
        fix: "name the denial's entry id (the `id:` line in .ksor/takedowns.yaml)",
      });
    }
    entry =
      mode.kind === "revoke"
        ? { kind: "revocation", id: mintLedgerId(at), by: actor, at, reason, revokes: target.id }
        : { kind: "amendment", id: mintLedgerId(at), by: actor, at, reason, amends: target.id };
  }

  // FILE FIRST, always. The entry is the record of the act; the row is a
  // projection of it, and `--apply` can always rebuild the row from the file
  // while nothing can rebuild the file from the row.
  writeFileSync(ledgerPath, appendEntry(ledgerText, entry), "utf8");
  process.stdout.write(
    `takedown: ${describe(entry)}\n  recorded as \`${entry.id}\` in .ksor/takedowns.yaml — commit it: the site publishes from the ledger\n`,
  );

  if (step.step === "entry-only") {
    process.stdout.write(`  ${step.why}\n`);
    return 0;
  }

  const dsn = resolveDsn(instance!);
  if (typeof dsn === "number") return dsn;
  const reparsed = parseLedger(readFileSync(ledgerPath, "utf8"), ".ksor/takedowns.yaml");
  if (!reparsed.ok) {
    return fail(
      ENVIRONMENT,
      `the ledger entry \`${entry.id}\` was written, and re-reading .ksor/takedowns.yaml refused it\n` +
        reparsed.refusals.map((r) => `  ${r.slug}: ${r.why}`).join("\n"),
    );
  }
  try {
    const applied = await withPool(dsn, (pool) =>
      runIngest(pool, instance!.tenantId, (c) => applyLedger(c, instance!, reparsed.ledger)),
    );
    process.stdout.write(
      applied.changed === 0
        ? "  the denylist row already said exactly this — no surface changed\n"
        : "  the row is written — no surface serves it from this request on\n",
    );
    for (const line of unmergedLines(applied.unmerged)) process.stderr.write(line + "\n");
  } catch (exc) {
    // The entry is on disk and the row is not: say so, and name the one command
    // that closes the gap. Exit 3 — the act was recorded, the environment failed.
    return fail(
      ENVIRONMENT,
      `the ledger entry \`${entry.id}\` is written, and the denylist row is NOT: ` +
        `${exc instanceof Error ? exc.message : String(exc)}\n` +
        "  why: the ledger is the record of the act and is written first, so nothing is lost — " +
        "but until the row exists the door keeps serving what the repository says is withdrawn\n" +
        `  fix: commit the entry, then run \`ksor takedown --instance ${instancePath} --apply\` ` +
        "where the database is reachable (it applies every unapplied entry under its recorded actor)",
    );
  }
  return 0;
}

/** One line naming the act, for the operator watching. */
function describe(entry: LedgerEntry): string {
  if (entry.kind === "denial") {
    return `${entry.stableId} denied (scope: ${entry.scope}, expected: ${entry.expected})`;
  }
  if (entry.kind === "revocation") return `revoked \`${entry.revokes}\``;
  // Not "the document": `--removed` reaches a SUBTREE denial too, where what
  // was deleted is a directory. The entry does not carry the scope, and the
  // line does not need it — what the denial names is what is recorded gone.
  return `\`${entry.amends}\` amended: what it denies is recorded as removed`;
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
