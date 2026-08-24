/**
 * Ingest's half of `build.lock.json` (build spec §2): the fields it needs and
 * the two refusals it owes — `ksor-lock-missing` and `ksor-lock-stale`. The
 * lock is WRITTEN by `ksor build` through `record/lock.ts` (the full lock
 * module); this reader is deliberately narrow — format, `build_id`, `as_of`
 * and the `documents[]` hashes — so an ingest cannot publish a tree the build
 * never checked, and records which build it did publish.
 *
 * Integration point: `documents[].sha256` is the hex sha256 of each concept
 * file's UTF-8 bytes, keyed by bundle-relative path (`policies/x.md`); the
 * writer must hash the same bytes, and `sha256OfDocument` is the one function
 * both sides should call.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

import type { RecordFiles } from "../record/check.js";
import type { Refusal, RefusalSlug } from "../record/refusal.js";

/** The refusals ingest and the door add to the record checker's set (record spec §6, last paragraph). */
export type IngestSlug =
  | "ksor-lock-missing"
  | "ksor-lock-stale"
  | "ksor-takedown-unmerged"
  | "ksor-takedown-unledgered";

export interface IngestRefusal {
  readonly slug: IngestSlug | RefusalSlug;
  readonly path: string;
  readonly why: string;
  readonly fix: string;
}

/** One line per refusal, the slug FIRST on the first line (product principle 4). */
export function formatRefusals(refusals: readonly (Refusal | IngestRefusal)[]): string {
  return refusals.map((r) => `${r.slug}: ${r.path}\n  why: ${r.why}\n  fix: ${r.fix}`).join("\n");
}

export const LOCK_PATH = "build.lock.json";
const KNOWLEDGE = "knowledge/";
const NOT_A_CONCEPT = /(^|\/)(index|log|README)\.md$|\.summary\.md$/;

const lockSchema = z
  .object({
    format: z.literal(1),
    build_id: z.string().min(1),
    as_of: z.string().min(1),
    documents: z.array(z.object({ path: z.string().min(1), sha256: z.string().min(1) }).loose()),
  })
  .loose();

export interface LockGate {
  readonly buildId: string;
  readonly asOf: string;
  readonly documents: ReadonlyMap<string, string>;
}

export type LockResult =
  | { readonly ok: true; readonly lock: LockGate }
  | { readonly ok: false; readonly refusal: IngestRefusal };

export function sha256OfDocument(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The concept files under `knowledge/` — the set the lock's `documents[]` must name exactly. */
export function conceptHashes(record: RecordFiles): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, text] of record.files) {
    if (!path.startsWith(KNOWLEDGE) || !path.endsWith(".md") || NOT_A_CONCEPT.test(path)) continue;
    out.set(path.slice(KNOWLEDGE.length), sha256OfDocument(text));
  }
  return out;
}

/** `text` is null when the file does not exist. */
export function checkLock(text: string | null, record: RecordFiles): LockResult {
  if (text === null) {
    return {
      ok: false,
      refusal: {
        slug: "ksor-lock-missing",
        path: LOCK_PATH,
        why: "no build.lock.json — ingest publishes only a tree `ksor build` has checked, and records that build's id on the generation it publishes",
        fix: "run `ksor build` and commit build.lock.json, then ingest",
      },
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return stale(
      `build.lock.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = lockSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return stale(
      `build.lock.json is not a lock this ingest can read (\`${issue?.path.map(String).join(".") || "(root)"}\`: ${issue?.message ?? "invalid"})`,
    );
  }
  const documents = new Map(parsed.data.documents.map((d) => [d.path, d.sha256]));
  const tree = conceptHashes(record);
  const drift: string[] = [];
  for (const [path, sha] of tree) {
    const locked = documents.get(path);
    if (locked === undefined) drift.push(`${path} (not in the lock)`);
    else if (locked !== sha) drift.push(`${path} (edited since the lock)`);
  }
  for (const path of documents.keys()) {
    if (!tree.has(path)) drift.push(`${path} (in the lock, not in the tree)`);
  }
  if (drift.length > 0) {
    const shown = drift.slice(0, 5).join(", ");
    const more = drift.length - Math.min(5, drift.length);
    return stale(
      `the tree differs from what build.lock.json recorded: ${shown}${more > 0 ? `, and ${more} more` : ""}`,
    );
  }
  return {
    ok: true,
    lock: { buildId: parsed.data.build_id, asOf: parsed.data.as_of, documents },
  };
}

function stale(why: string): LockResult {
  return {
    ok: false,
    refusal: {
      slug: "ksor-lock-stale",
      path: LOCK_PATH,
      why,
      fix: "run `ksor build` again so the lock records the tree as it is now, commit both, then ingest",
    },
  };
}
