/**
 * The kernel's view of `instance.md` (adapted from oracle SC/instance.py
 * under decision 11 — an adaptation, not a port: ksor has ONE instance file
 * whose `name:` is the identity, so there is no separate content-instance
 * bundle, no `brand` (tool names are fixed: search, outline, read — one
 * obvious way), and no book-shaped corpus keys).
 *
 * The grammar is deliberately the format checker's restricted frontmatter
 * grammar — top-level keys, one nesting level, `- ` lists, ` #` comments,
 * duplicates refused — because two parsers reading one file two ways is how
 * a record silently means two things (the visibility review's lesson,
 * 2026-08-19). No anchors, no tags, no interpolation: an env reference
 * exists only as a declared `*_env` NAME the composition root resolves.
 *
 * The Markdown BODY below the frontmatter is the authored agent-surface
 * instructions — byte-preserved, stripped only at the edges.
 */

import { readFileSync } from "node:fs";
import { z } from "zod";

import { EMBED_DIM, EMBED_MODEL } from "./config.js";
import type { AbstainConfig } from "./lib/abstain.js";

export const EMBED_DIM_MAX = 2000;
export const SUPPORTED_FORMATS: readonly number[] = [1];

export class InstanceParseError extends Error {
  constructor(what: string, why: string, fix: string) {
    super(`${what}\n  why: ${why}\n  fix: ${fix}`);
    this.name = "InstanceParseError";
  }
}

function unknownKey(key: string): never {
  throw new InstanceParseError(
    `instance.md declares an unknown top-level key: ${key}`,
    "the instance key set is closed so a key never means two things — a misspelled retrieval: " +
      "or a stray value line would otherwise turn the abstention gate off silently",
    "fix the spelling, nest it under the block it belongs to, or remove it",
  );
}

// ---------------------------------------------------------------------------
// The restricted frontmatter grammar (the checker's, exactly): BOM strip,
// CRLF normalize, lax close (a ---- line closes).

interface Frontmatter {
  readonly scalars: Map<string, string>;
  readonly maps: Map<string, Map<string, string>>;
  readonly lists: Map<string, string[]>;
  readonly body: string;
}

const stripComment = (value: string): string =>
  /^["']/.test(value.trim()) ? value.trim() : value.replace(/\s+#.*$/, "").trim();

const unquote = (value: string): string => /^(['"])(.*)\1$/.exec(value)?.[2] ?? value;

export function parseFrontmatter(text: string): Frontmatter {
  const normalized = text.replace(/^﻿/, "").replaceAll("\r\n", "\n");
  const match = /^---\n([\s\S]*?)\n---/.exec(normalized);
  if (match === null || match[1] === undefined) {
    throw new InstanceParseError(
      "instance.md has no frontmatter block",
      "the frontmatter is the machine half of the instance definition; without it nothing is declared",
      "open the file with --- on line 1 and close the block with ---",
    );
  }
  const scalars = new Map<string, string>();
  const maps = new Map<string, Map<string, string>>();
  const lists = new Map<string, string[]>();
  let current: string | null = null;
  for (const raw of match[1].split("\n")) {
    const line = raw.replace(/[ \t]+$/, "");
    if (line === "" || /^[ \t]*#/.test(line)) continue;
    const top = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(line);
    if (top !== null && !line.startsWith(" ") && !line.startsWith("\t")) {
      current = top[1] ?? "";
      if (scalars.has(current) || maps.has(current) || lists.has(current)) {
        throw new InstanceParseError(
          `duplicate frontmatter key: ${current}`,
          "YAML refuses duplicate keys; a parser silently keeping the last write makes the file mean two things",
          `remove one of the ${current}: entries`,
        );
      }
      scalars.set(current, unquote(stripComment(top[2] ?? "")));
      continue;
    }
    const nested = /^[ \t]+([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(line);
    if (nested !== null && current !== null) {
      const child = maps.get(current) ?? new Map<string, string>();
      const key = nested[1] ?? "";
      if (child.has(key)) {
        throw new InstanceParseError(
          `duplicate key ${current}.${key}`,
          "duplicates make the declaration ambiguous",
          `remove one of the ${key}: entries under ${current}:`,
        );
      }
      child.set(key, unquote(stripComment(nested[2] ?? "")));
      maps.set(current, child);
      scalars.delete(current);
      continue;
    }
    const item = /^[ \t]*-[ \t]+(.*)$/.exec(line);
    if (item !== null && current !== null) {
      const list = lists.get(current) ?? [];
      const value = unquote(stripComment(item[1] ?? ""));
      if (value !== "") list.push(value);
      lists.set(current, list);
      scalars.delete(current);
      continue;
    }
    throw new InstanceParseError(
      `unreadable frontmatter line: ${JSON.stringify(line.trim())}`,
      "the instance grammar is deliberately small (scalars, one map level, lists) so every reader parses it identically",
      "write the key as `key: value`, `key:` with indented `sub: value` pairs, or `- item` list entries",
    );
  }
  const body = normalized.slice((match.index ?? 0) + match[0].length);
  return { scalars, maps, lists, body };
}

// ---------------------------------------------------------------------------
// The kernel keys, validated fail-closed.

const KERNEL_GROUPS = ["database", "embedding", "retrieval", "budgets"] as const;

// A floor is a NUMBER (calibrated gate), `null`/absent (no gate — honest
// absence, "will not refuse out-of-corpus questions"), or the literal
// `uncalibrated` — DECLARED intent to gate that has not been measured yet,
// which REFUSES every serve until a floor is pasted (the fail-closed
// invariant, now representable — review, 2026-08-19).
const floorSchema = z
  .union([
    z.literal("null"),
    z.literal(""),
    z.literal("uncalibrated"),
    z.string().regex(/^-?\d+(\.\d+)?$/),
  ])
  .transform((raw): number | null | "uncalibrated" =>
    raw === "uncalibrated" ? "uncalibrated" : raw === "null" || raw === "" ? null : Number(raw),
  );

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
    dim: z.coerce.number().int().min(1).max(EMBED_DIM_MAX).default(EMBED_DIM),
  }),
  retrieval: z.object({
    vector_floor: floorSchema.default(null),
    // The keyword floor is a degraded-path number or null only — the
    // uncalibrated-refuses state is a property of the VECTOR gate.
    keyword_floor: z
      .union([z.literal("null"), z.literal(""), z.string().regex(/^-?\d+(\.\d+)?$/)])
      .transform((raw): number | null => (raw === "null" || raw === "" ? null : Number(raw)))
      .default(null),
  }),
  budgets: z.object({
    maximum_response_characters: z.coerce.number().int().min(1).default(120_000),
  }),
} as const;

export interface ContentInstance {
  /** The corpus identity — instance.md's `name:` (the path/name IS the identity). */
  readonly name: string;
  readonly corpusId: string;
  readonly tenantId: string;
  /** The NAME of the env var holding the DSN; the composition root resolves it. */
  readonly dsnEnv: string;
  readonly abstain: AbstainConfig;
  readonly maximumResponseCharacters: number;
  /** The authored agent-surface instructions (the body, edge-trimmed). */
  readonly instructions: string;
  /** Transport name (registry key, never persisted). */
  readonly embeddingProvider: string;
  /** model + dim are the persisted IDENTITY of the embedding space. */
  readonly embeddingModel: string;
  readonly embeddingDim: number;
}

function bindGroup<K extends (typeof KERNEL_GROUPS)[number]>(
  fm: Frontmatter,
  group: K,
): z.infer<(typeof groupSchemas)[K]> | null {
  if (fm.scalars.has(group) && fm.scalars.get(group) !== "") {
    throw new InstanceParseError(
      `${group}: is a map, not a value (got ${JSON.stringify(fm.scalars.get(group))})`,
      "the kernel keys are declared as key groups so each field has one unambiguous home",
      `write it as:\n  ${group}:\n    <field>: <value>`,
    );
  }
  const raw = fm.maps.get(group);
  if (raw === undefined) return null;
  const parsed = groupSchemas[group].strict().safeParse(Object.fromEntries(raw));
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
 * Parse the kernel's view of an instance.md. `format` and `name` are
 * required (the scaffold always writes them); the kernel groups are
 * optional as a SET — but `database:` is required to serve, and the caller
 * that needs a database refuses without it.
 */
/**
 * The kernel's closed top-level key set. A key outside it is REFUSED, never
 * ignored — because a misspelled `retreival:` (or a `vector_floor:` line
 * pasted at column 0) that parsed to "no retrieval block" would silently
 * turn the abstention gate OFF and the corpus would answer out-of-corpus
 * questions forever, its only signal a /health line nobody reads (review
 * finding, 2026-08-19). `site`/`audiences`/`default_visibility` are the
 * scaffold-and-site keys the kernel does not consume but must tolerate;
 * the format checker owns their grammar.
 */
const KERNEL_TOP_LEVEL_KEYS = new Set([
  "format",
  "name",
  "ksor",
  "database",
  "embedding",
  "retrieval",
  "budgets",
  "site",
  "audiences",
  "default_visibility",
]);

export function parseInstanceText(text: string): ContentInstance {
  const fm = parseFrontmatter(text);
  for (const key of fm.scalars.keys()) {
    if (!KERNEL_TOP_LEVEL_KEYS.has(key)) unknownKey(key);
  }
  for (const key of fm.maps.keys()) {
    if (!KERNEL_TOP_LEVEL_KEYS.has(key)) unknownKey(key);
  }
  for (const key of fm.lists.keys()) {
    if (!KERNEL_TOP_LEVEL_KEYS.has(key)) unknownKey(key);
  }
  const format = fm.scalars.get("format");
  if (format === undefined || !SUPPORTED_FORMATS.includes(Number(format))) {
    throw new InstanceParseError(
      `instance format ${JSON.stringify(format ?? null)} unsupported (supported: ${SUPPORTED_FORMATS.join(", ")})`,
      "the format number is the compatibility contract between this kernel and the file",
      "set format: 1",
    );
  }
  const name = fm.scalars.get("name") ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) {
    throw new InstanceParseError(
      `instance name ${JSON.stringify(name)} is not a legal identity`,
      "the name is the corpus identity every citation carries (ascii lowercase, digits, hyphens)",
      "set name: to the project's slug (the init grammar)",
    );
  }
  const database = bindGroup(fm, "database");
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
    throw new InstanceParseError(
      "instance.md declares no database: block",
      "the kernel serves from a Postgres corpus store; without database.dsn_env there is nothing to open",
      "add:\n  database:\n    dsn_env: KSOR_DB_URL\nand export that variable with the DSN",
    );
  }
  const embedding = bindGroup(fm, "embedding") ?? groupSchemas.embedding.parse({});
  // The fake provider's persisted space is ALWAYS "fake-embed-001" (it
  // hard-overrides any model id), so an instance declaring provider: fake
  // must reflect that or the first ingest writes fake-embed-001 while the
  // space guard checks the gemini default — a permanently wedged corpus from
  // config that never looked wrong (review, 2026-08-19).
  const embeddingModel = embedding.provider === "fake" ? "fake-embed-001" : embedding.model;
  const retrieval = bindGroup(fm, "retrieval") ?? groupSchemas.retrieval.parse({});
  const budgets = bindGroup(fm, "budgets") ?? groupSchemas.budgets.parse({});
  return {
    name,
    corpusId: name,
    tenantId: name, // 1:1 with the corpus — see the tenant_id guard above
    dsnEnv: database.dsn_env,
    abstain: { vectorFloor: retrieval.vector_floor, keywordFloor: retrieval.keyword_floor },
    maximumResponseCharacters: budgets.maximum_response_characters,
    instructions: fm.body.trim(),
    embeddingProvider: embedding.provider,
    embeddingModel,
    embeddingDim: embedding.dim,
  };
}

export function parseInstance(path: string): ContentInstance {
  return parseInstanceText(readFileSync(path, "utf8"));
}
