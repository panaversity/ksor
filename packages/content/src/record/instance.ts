/**
 * The instance document, `instance.md` format 2 (record spec §3): a
 * profile-shaped document BESIDE the bundle, not a concept — identity is not
 * knowledge, so it carries no `type`, `status` or `ksor.audience`, and the
 * lifecycle table does not apply to it. ONE reader: the checker, `ksor build`
 * and the kernel's `parseInstance` all go through this, so the file cannot
 * mean two things (decision 26). The deployment keys (`database`, `embedding`,
 * `retrieval`, `budgets`, `site`, `mcp_url`, `version`) are passed through as
 * parsed YAML; the kernel binds and validates the ones it consumes.
 */
import { z } from "zod";

import { splitFrontmatter } from "./frontmatter.js";
import type { Refusal } from "./refusal.js";

/** Keys that left the instance for the policy (audiences) or moved under `toolchain` (ksor). */
export const MOVED_INSTANCE_KEYS = ["audiences", "default_visibility", "ksor"] as const;

/** The closed key set: an unknown top-level key is refused, never ignored (a misspelled `retrieval:` would silently turn the abstention gate off). */
export const INSTANCE_KEYS = [
  "format",
  "name",
  "title",
  "description",
  "toolchain",
  "database",
  "embedding",
  "retrieval",
  "budgets",
  "site",
  "mcp_url",
  "version",
] as const;

/**
 * The closed key set INSIDE each group. A group is where a silently-ignored
 * key does the most damage: a misspelled `vector_flor:` leaves the abstention
 * gate off while the owner believes it is on (found live 2026-08-20). The
 * kernel's `groupSchemas` is the authority for these names and
 * `instance-keys-drift.test.ts` holds this map to it.
 */
export const NESTED_INSTANCE_KEYS: Readonly<Record<string, readonly string[]>> = {
  toolchain: ["requires", "scaffolded"],
  database: ["dsn_env", "tenant_id"],
  embedding: ["provider", "model", "dim"],
  retrieval: ["text_search_config", "vector_floor", "floor_digest", "keyword_floor"],
  budgets: ["maximum_response_characters"],
  // The site's own group. The kernel does not consume it, but ONE reader now
  // validates the instance for every surface (decision 26), and a key nobody
  // reads is a setting the owner believes is in effect — `site.title` was
  // tolerated while `title` moved to the top level, which is exactly that.
  site: ["url", "governance"],
};

const OPEN_GROUPS: readonly string[] = [];

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

const schema = z
  .object({
    format: z.literal(2),
    name: z
      .string()
      .regex(
        NAME,
        "the name is the corpus identity every citation carries (ascii lowercase, digits, hyphens)",
      ),
    title: z.string().min(1),
    description: z.string().min(1),
    toolchain: z
      .object({ requires: z.string().min(1), scaffolded: z.string().min(1) })
      .loose()
      .optional(),
    database: z.record(z.string(), z.unknown()).optional(),
    embedding: z.record(z.string(), z.unknown()).optional(),
    retrieval: z.record(z.string(), z.unknown()).optional(),
    budgets: z.record(z.string(), z.unknown()).optional(),
    site: z.record(z.string(), z.unknown()).optional(),
    mcp_url: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
  })
  .strict();

export interface InstanceDocument {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly toolchain: { readonly requires: string; readonly scaffolded: string } | null;
  readonly database: Readonly<Record<string, unknown>> | null;
  readonly embedding: Readonly<Record<string, unknown>> | null;
  readonly retrieval: Readonly<Record<string, unknown>> | null;
  readonly budgets: Readonly<Record<string, unknown>> | null;
  readonly site: Readonly<Record<string, unknown>> | null;
  readonly mcpUrl: string | null;
  readonly version: string | null;
  /** The MCP server's instructions, in full — the body, edge-trimmed. */
  readonly instructions: string;
}

export type InstanceResult =
  | { readonly ok: true; readonly instance: InstanceDocument }
  | { readonly ok: false; readonly refusals: readonly Refusal[] };

const PATH = "instance.md";
const FIX =
  "run `ksor migrate --write`, which rewrites the instance to format 2 and moves the audience model into .ksor/governance.yaml";

export function parseInstanceDocument(text: string, path: string = PATH): InstanceResult {
  const split = splitFrontmatter(text, path);
  if (!split.ok) return { ok: false, refusals: [split.refusal] };
  const fm = split.frontmatter;
  const refuse = (why: string, fix: string = FIX): InstanceResult => ({
    ok: false,
    refusals: [{ slug: "ksor-instance-format", path, why, fix }],
  });
  if (fm === null) {
    return refuse(
      "instance.md has no frontmatter — the frontmatter is the machine half of the instance definition; without it nothing is declared",
      "open the file with --- on line 1 and close the block with ---",
    );
  }
  const moved = MOVED_INSTANCE_KEYS.filter((k) => k in fm);
  if (moved.length > 0) {
    return refuse(
      `\`${moved.join("`, `")}\` no longer live on the instance — audiences and authority live in \`.ksor/governance.yaml\`, and the upgrade stamp under \`toolchain:\``,
    );
  }
  if (fm["format"] !== 2) {
    return refuse(
      `\`format: ${fm["format"] === undefined ? "(missing)" : String(fm["format"])}\` is not the profile's instance (format 2)`,
    );
  }
  const unknown = Object.keys(fm).filter((k) => !(INSTANCE_KEYS as readonly string[]).includes(k));
  if (unknown.length > 0) {
    return refuse(
      `instance.md declares an unknown top-level key: ${unknown.join(", ")} — the key set is closed so a key never means two things (a misspelled \`retrieval:\` would otherwise turn the abstention gate off silently)`,
      "fix the spelling, nest it under the block it belongs to, or remove it",
    );
  }
  // Every group is closed too, and a group written inline or as a scalar is
  // not read as a group at all — every setting inside it would be dropped.
  const nested: Refusal[] = [];
  for (const [key, allowed] of [
    ...Object.entries(NESTED_INSTANCE_KEYS),
    ...OPEN_GROUPS.map((k) => [k, null] as const),
  ]) {
    const value = fm[key];
    if (value === undefined) continue;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      nested.push({
        slug: "ksor-instance-format",
        path,
        why: `\`${key}:\` is not a block mapping — a group written inline or as a scalar is not read as a group, so every setting inside it is dropped`,
        fix: `write it as an indented block:\n  ${key}:\n    <key>: <value>`,
      });
      continue;
    }
    if (allowed === null) continue;
    for (const sub of Object.keys(value as Record<string, unknown>)) {
      if (!allowed.includes(sub)) {
        nested.push({
          slug: "ksor-instance-format",
          path,
          why: `unknown key under \`${key}\`: \`${sub}\``,
          fix: `remove \`${sub}:\` (allowed under ${key}: ${allowed.join(", ")})`,
        });
      }
    }
  }
  const governance = (fm["site"] as Record<string, unknown> | undefined)?.["governance"];
  if (governance !== undefined && typeof governance !== "boolean") {
    nested.push({
      slug: "ksor-instance-format",
      path,
      why: `\`site.governance\` is ${JSON.stringify(governance)} — it decides whether pages show the governance each document declares, and a value nobody can read is a setting the owner believes is in effect`,
      fix: "write `governance: false` to keep pages plain, or remove the key (the default shows them)",
    });
  }
  if (nested.length > 0) return { ok: false, refusals: nested };

  const parsed = schema.safeParse(fm);
  if (!parsed.success) {
    return {
      ok: false,
      refusals: parsed.error.issues.map((issue) => ({
        slug: "ksor-instance-format",
        path,
        why: `\`${issue.path.map(String).join(".") || "(root)"}\`: ${issue.message}`,
        fix: "the instance's shape is record spec §3: `format: 2`, `name`, `title`, `description`, optional `toolchain` and the deployment keys",
      })),
    };
  }
  const d = parsed.data;
  return {
    ok: true,
    instance: {
      name: d.name,
      title: d.title,
      description: d.description,
      toolchain: d.toolchain
        ? { requires: d.toolchain.requires, scaffolded: d.toolchain.scaffolded }
        : null,
      database: d.database ?? null,
      embedding: d.embedding ?? null,
      retrieval: d.retrieval ?? null,
      budgets: d.budgets ?? null,
      site: d.site ?? null,
      mcpUrl: d.mcp_url ?? null,
      version: d.version ?? null,
      instructions: split.body.trim(),
    },
  };
}
