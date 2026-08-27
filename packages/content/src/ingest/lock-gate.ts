/**
 * Ingest's half of `build.lock.json` (build spec §2): the two refusals it owes
 * — `ksor-lock-missing` and `ksor-lock-stale` — so an ingest cannot publish a
 * tree the build never checked, and records which build it did publish. The
 * lock is WRITTEN by `ksor build` through `record/lock.ts`.
 *
 * WHAT IT COMPARES IS EVERY DIGEST THE WRITER RECORDS, not a chosen slice.
 * This reader used to check `documents[]` alone while `composeLock` recorded
 * the instance, the policy, the ledger, the companions and the assets as well
 * — so `ksor ingest` accepted a tree whose GOVERNANCE had been edited since the
 * build that checked it: delete a denial's four lines from
 * `.ksor/takedowns.yaml` after building, ingest, and the door published a
 * document the site still withdrew. The site's own lock was fixed for exactly
 * that once already; the ingest side had the same hole (review 2026-08-25).
 * Decision 19 is the rule it broke — a surface that refuses must refuse on both
 * — and the general form is that a narrow reader of a wide lock is a lock that
 * covers less than it says. A field the writer adds belongs HERE in the same
 * change, or the lock's promise shrinks silently.
 *
 * Integration point: every `sha256` is the hex sha256 of the file's bytes,
 * keyed by bundle-relative path (`policies/x.md`) for the three file lists;
 * `instance.md`, `.ksor/governance.yaml` and `.ksor/takedowns.yaml` are named
 * by their scalar digest fields, and an ABSENT one hashes the empty string on
 * both sides (`composeLock` passes `?? ""`), so "declares no policy" is a
 * state rather than a permanent refusal.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

import type { RecordFiles } from "../record/check.js";
import type { Refusal, RefusalSlug } from "../record/refusal.js";
import { attachmentKindOf } from "../lib/attachment-rule.js";

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
const INDEX = /(^|\/)index\.md$/;
const INSTANCE_PATH = "instance.md";
const POLICY_PATH = ".ksor/governance.yaml";
const LEDGER_PATH = ".ksor/takedowns.yaml";

const fileList = z.array(z.object({ path: z.string().min(1), sha256: z.string().min(1) }).loose());

const lockSchema = z
  .object({
    format: z.literal(1),
    build_id: z.string().min(1),
    as_of: z.string().min(1),
    // REQUIRED, not optional-with-a-fallback. A lock written before these
    // existed cannot be checked against the governance it published, so it is
    // stale by definition — trusting the half it does carry is how a reader
    // ends up vouching for bytes it never saw (pre-1.0: breaking beats a
    // legacy path, coding principle 4).
    instance_sha256: z.string().min(1),
    policy_sha256: z.string().min(1),
    ledger_sha256: z.string().min(1),
    documents: fileList,
    companions: fileList,
    assets: fileList,
    indexes: fileList,
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

/**
 * The study attachments — the set `companions[]` must name exactly.
 *
 * Keyed off `attachmentKindOf`, the canonical rule (decision 18), rather than a
 * second regex beside the writer's: a companion the reader classified as a
 * document would report drift on a tree nobody touched. The two agree on every
 * real record even though the writer's regex omits `.summary.mdx` — `loadRecord`
 * puts only `.md`/`.yaml` into `files` and everything else into `assets`, so an
 * `.mdx` companion is never in the map either side walks. The agreement is
 * ASSERTED, not assumed: "checkLock accepts what composeLock writes" drives the
 * real emitter over a tree that has one.
 */
export function companionHashes(record: RecordFiles): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, text] of record.files) {
    if (!path.startsWith(KNOWLEDGE)) continue;
    if (attachmentKindOf(path.slice(path.lastIndexOf("/") + 1)) === null) continue;
    out.set(path.slice(KNOWLEDGE.length), sha256OfDocument(text));
  }
  return out;
}

/**
 * The generated `index.md` files — the set `indexes[]` must name exactly.
 *
 * They are the only files under `knowledge/` a build WRITES rather than reads,
 * and `conceptHashes` skips them by name, so before the writer recorded them
 * the §8 surface — the file an external reader parses to find anything at all —
 * sat outside "what was checked" on both sides.
 */
export function indexHashes(record: RecordFiles): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, text] of record.files) {
    if (!path.startsWith(KNOWLEDGE) || !INDEX.test(path)) continue;
    out.set(path.slice(KNOWLEDGE.length), sha256OfDocument(text));
  }
  return out;
}

/**
 * The non-markdown files under `knowledge/` — the set `assets[]` must name
 * exactly, hashed over BYTES because that is what they are.
 *
 * `RecordFiles.assets` is optional on the type (a hand-built fixture may omit
 * it) and always present from `loadRecord`, so an omitted map means "this
 * caller has no assets", not "skip the check".
 */
export function assetHashes(record: RecordFiles): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, bytes] of record.assets ?? new Map<string, Uint8Array>()) {
    if (!path.startsWith(KNOWLEDGE)) continue;
    out.set(path.slice(KNOWLEDGE.length), createHash("sha256").update(bytes).digest("hex"));
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
  const drift: string[] = [];
  // Every file list, compared the same way and reported under the name an
  // author would recognise. ONE loop, so a list the lock gains is a line here
  // rather than another hand-written comparison that can drift out of step with
  // its neighbours.
  for (const [locked, tree] of [
    [documents, conceptHashes(record)],
    [new Map(parsed.data.companions.map((c) => [c.path, c.sha256])), companionHashes(record)],
    [new Map(parsed.data.assets.map((a) => [a.path, a.sha256])), assetHashes(record)],
    [new Map(parsed.data.indexes.map((i) => [i.path, i.sha256])), indexHashes(record)],
  ] as const) {
    for (const [path, sha] of tree) {
      const at = locked.get(path);
      if (at === undefined) drift.push(`${path} (not in the lock)`);
      else if (at !== sha) drift.push(`${path} (edited since the lock)`);
    }
    for (const path of locked.keys()) {
      if (!tree.has(path)) drift.push(`${path} (in the lock, not in the tree)`);
    }
  }
  // The three governance files, by their scalar digests. These are the ones the
  // reader used to ignore entirely, and the ledger is the one that mattered
  // most: it decides what is WITHDRAWN.
  for (const [path, digest] of [
    [INSTANCE_PATH, parsed.data.instance_sha256],
    [POLICY_PATH, parsed.data.policy_sha256],
    [LEDGER_PATH, parsed.data.ledger_sha256],
  ] as const) {
    if (sha256OfDocument(record.files.get(path) ?? "") !== digest) {
      drift.push(`${path} (edited since the lock)`);
    }
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
