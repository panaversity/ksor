/**
 * The kernel's view of `instance.md` (adapted from oracle SC/instance.py
 * under decision 11 — an adaptation, not a port: ksor has ONE instance file
 * whose `name:` is the identity, so there is no separate content-instance
 * bundle, no `brand` (tool names are fixed: search, outline, read — one
 * obvious way), and no book-shaped corpus keys).
 *
 * Format 2 (record spec §3): the document is read by the record module's ONE
 * instance reader (`record/instance.ts`, real YAML — decision 26), so the
 * checker, `ksor build` and this kernel cannot read the file two ways. What
 * this module adds is the binding of the deployment groups the kernel
 * CONSUMES — `database`, `embedding`, `retrieval`, `budgets` — each a closed
 * zod object, refused rather than ignored on an unknown key. The audience
 * model no longer lives here: it is the policy's (`.ksor/governance.yaml`),
 * ingested onto the run row the door binds to.
 *
 * The Markdown BODY below the frontmatter is the MCP server's instructions,
 * in full.
 */

import { readFileSync } from "node:fs";
import { z } from "zod";

import { EMBED_DIM, EMBED_MODEL } from "./config.js";
import type { AbstainConfig } from "./lib/abstain.js";
import { parseInstanceDocument, type InstanceDocument } from "./record/instance.js";

/** Mirrors `schema.ts`'s ceiling, so a bad `dim:` is refused when instance.md is
 *  PARSED rather than when the DDL is rendered. The why lives there. */
export const EMBED_DIM_MAX = 2000;
export const SUPPORTED_FORMATS: readonly number[] = [2];

export class InstanceParseError extends Error {
  constructor(what: string, why: string, fix: string) {
    super(`${what}\n  why: ${why}\n  fix: ${fix}`);
    this.name = "InstanceParseError";
  }
}

/**
 * A record that declares no `database:` block at all — the level-0 shape
 * `ksor init` emits, and a legitimate state, not a typo.
 *
 * It carries the instance NAME because `ksor takedown` answers FOR such a
 * record rather than refusing: with no database the ledger entry is the whole
 * act (record spec §5). Everyone else catches `InstanceParseError` and refuses
 * exactly as before.
 */
export class NoDatabaseDeclared extends InstanceParseError {
  readonly instanceName: string;
  constructor(instanceName: string, what: string, why: string, fix: string) {
    super(what, why, fix);
    this.name = "NoDatabaseDeclared";
    this.instanceName = instanceName;
  }
}

const KERNEL_GROUPS = ["database", "embedding", "retrieval", "budgets"] as const;

// A floor is a NUMBER (calibrated gate), `null`/absent (no gate — honest
// absence, "will not refuse out-of-corpus questions"), or the literal
// `uncalibrated` — DECLARED intent to gate that has not been measured yet,
// which REFUSES every serve until a floor is pasted (the fail-closed
// invariant, now representable — review, 2026-08-19).
const floorSchema = z.union([z.number(), z.null(), z.literal("uncalibrated")]);

const groupSchemas = {
  database: z.object({
    dsn_env: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/, "an environment variable NAME (the instance never holds a DSN)"),
    tenant_id: z.string().min(1).optional(),
  }),
  embedding: z.object({
    provider: z.string().min(1).default("gemini"),
    model: z.string().min(1).default(EMBED_MODEL),
    dim: z
      .number()
      .int()
      .min(1)
      // The reason travels with the refusal. Declaring `dim:` in instance.md is
      // the path the scaffold documents, and it used to fail here with only
      // zod's "expected number to be <=2000" — no mention of what 2000 is or
      // why, so an adopter whose model emits more had nothing to act on.
      .max(EMBED_DIM_MAX, {
        error: `at most ${EMBED_DIM_MAX}: this schema declares VECTOR columns and indexes one directly, and pgvector's HNSW takes a vector to ${EMBED_DIM_MAX}`,
      })
      .default(EMBED_DIM),
  }),
  retrieval: z.object({
    /**
     * The Postgres text-search configuration the KEYWORD arm stems with.
     * Declared here because changing it later is a re-ingest: the column is
     * STORED, so the value has to be settled before a corpus exists (audit
     * finding 20).
     */
    text_search_config: z
      .string()
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "text_search_config must be a bare Postgres configuration name (lowercase, e.g. `english`, `spanish`, `simple`)",
      )
      .default("english"),
    vector_floor: floorSchema.default(null),
    // The digest of the predicate the floor was measured under, written by
    // `ksor calibrate` beside the number. Absent on a floor calibrated before
    // the predicate had a name — which is a floor measured without today's
    // lifecycle window and trust arm, so absence refuses rather than passes.
    floor_digest: z.union([z.string(), z.null()]).default(null),
    // The keyword floor is a degraded-path number or null only — the
    // uncalibrated-refuses state is a property of the VECTOR gate.
    keyword_floor: z.union([z.number(), z.null()]).default(null),
  }),
  budgets: z.object({
    maximum_response_characters: z.number().int().min(1).default(120_000),
  }),
} as const;

export interface ContentInstance {
  /** The corpus identity — instance.md's `name:` (the one sanctioned identity key). */
  readonly name: string;
  readonly corpusId: string;
  readonly tenantId: string;
  /** The display title (the root index's heading) and the one-sentence description that seeds `llms.txt` and `server.json`. */
  readonly title: string;
  readonly description: string;
  /** The upgrade stamp `ksor init` wrote; null on a hand-written instance. */
  readonly toolchain: { readonly requires: string; readonly scaffolded: string } | null;
  /** The NAME of the env var holding the DSN; the composition root resolves it. */
  readonly dsnEnv: string;
  readonly abstain: AbstainConfig;
  readonly maximumResponseCharacters: number;
  /** The MCP server's instructions (the body, edge-trimmed). */
  readonly instructions: string;
  /** Transport name (registry key, never persisted). */
  readonly embeddingProvider: string;
  /** The Postgres text-search configuration the keyword arm stems with. */
  readonly textSearchConfig: string;
  /** model + dim are the persisted IDENTITY of the embedding space. */
  readonly embeddingModel: string;
  readonly embeddingDim: number;
}

function bindGroup<K extends (typeof KERNEL_GROUPS)[number]>(
  doc: InstanceDocument,
  group: K,
): z.infer<(typeof groupSchemas)[K]> | null {
  const raw = doc[group];
  if (raw === null) return null;
  const parsed = groupSchemas[group].strict().safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new InstanceParseError(
      `instance.md ${group}.${issue?.path.join(".") ?? ""}: ${issue?.message ?? "invalid"}`,
      "the instance parse fails closed — a misdeclared key must never become a silently different deployment",
      `fix the ${group}: block; unknown keys are refused, not ignored`,
    );
  }
  return parsed.data as z.infer<(typeof groupSchemas)[K]>;
}

/**
 * Parse the kernel's view of an instance.md. The record module's reader does
 * the shape work (format 2, the closed key set, the moved keys); this binds
 * the kernel groups. `database:` is required to serve, and the caller that
 * needs a database refuses without it.
 */
export function parseInstanceText(text: string): ContentInstance {
  const read = parseInstanceDocument(text);
  if (!read.ok) {
    const first = read.refusals[0]!;
    throw new InstanceParseError(`instance.md: ${first.slug} — ${first.why}`, first.why, first.fix);
  }
  const doc = read.instance;
  const name = doc.name;
  const database = bindGroup(doc, "database");
  if (database !== null && database.tenant_id !== undefined && database.tenant_id !== name) {
    // ksor is one corpus per instance, and generation content is scoped by
    // TENANT only (chunks/sources/nodes carry no corpus_id). Two corpora
    // sharing a tenant would let GC on one delete the other's live rows
    // (review finding, 2026-08-19). Forcing tenant == name keeps them 1:1.
    throw new InstanceParseError(
      `database.tenant_id (${JSON.stringify(database.tenant_id)}) must equal the instance name (${JSON.stringify(name)})`,
      "the kernel scopes a corpus by its tenant; a tenant shared across corpora makes GC delete the wrong rows",
      "remove database.tenant_id (it defaults to the name), or set it equal to the name",
    );
  }
  if (database === null) {
    throw new NoDatabaseDeclared(
      name,
      "instance.md declares no database: block",
      "the kernel serves from a Postgres corpus store; without database.dsn_env there is nothing to open",
      "add:\n  database:\n    dsn_env: KSOR_DB_URL\nand export that variable with the DSN",
    );
  }
  const embedding = bindGroup(doc, "embedding") ?? groupSchemas.embedding.parse({});
  // The fake provider's persisted space is ALWAYS "fake-embed-001" (it
  // hard-overrides any model id), so an instance declaring provider: fake
  // must reflect that or the first ingest writes fake-embed-001 while the
  // space guard checks the gemini default — a permanently wedged corpus from
  // config that never looked wrong (review, 2026-08-19).
  const embeddingModel = embedding.provider === "fake" ? "fake-embed-001" : embedding.model;
  const retrieval = bindGroup(doc, "retrieval") ?? groupSchemas.retrieval.parse({});
  const budgets = bindGroup(doc, "budgets") ?? groupSchemas.budgets.parse({});
  return {
    name,
    corpusId: name,
    tenantId: name, // 1:1 with the corpus — see the tenant_id guard above
    title: doc.title,
    description: doc.description,
    toolchain: doc.toolchain,
    dsnEnv: database.dsn_env,
    abstain: {
      vectorFloor: retrieval.vector_floor,
      keywordFloor: retrieval.keyword_floor,
      floorDigest: retrieval.floor_digest,
    },
    textSearchConfig: retrieval.text_search_config,
    maximumResponseCharacters: budgets.maximum_response_characters,
    instructions: doc.instructions,
    embeddingProvider: embedding.provider,
    embeddingModel,
    embeddingDim: embedding.dim,
  };
}

export function parseInstance(path: string): ContentInstance {
  return parseInstanceText(readFileSync(path, "utf8"));
}
