import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { refuse } from "./audience";
import { RULES_VERSION } from "./rules-version";

/**
 * `build.lock.json` as the site reads it (build spec §2–§3): the record that
 * `ksor build` checked this tree, the `as_of` every lifecycle decision in this
 * build is evaluated at, the registry a viewer is validated against, and the
 * stamps every machine artefact carries (R14).
 *
 * Outside development the site refuses to build without a FRESH lock — one
 * whose document hashes match the tree — because a projection of a tree
 * nothing checked is a projection nothing governs. `pnpm dev` is the review
 * surface and needs none (decision 7); its artefacts say so.
 */

const hashed = z.object({ path: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/) });

const lockSchema = z
  .object({
    format: z.literal(1),
    build_id: z.string().min(1),
    ksor_version: z.string().min(1),
    source_commit: z.string().nullable(),
    dirty: z.boolean(),
    as_of: z.string().min(1),
    drafts: z.enum(["hidden", "shown"]),
    audiences: z.object({ registry: z.array(z.string().min(1)) }).loose(),
    documents: z.array(hashed.loose()),
    companions: z.array(hashed.loose()),
  })
  .loose();

export type BuildLock = z.infer<typeof lockSchema>;

export const LOCK_FILE = "build.lock.json";

/** sha256 of a file's raw bytes, hex — what `documents[].sha256` holds. */
export function sha256Of(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/**
 * The lock, or null in development. Refuses `ksor-lock-missing` when absent
 * and `ksor-lock-stale` when unreadable or when any hash disagrees with the
 * tree given in `files` (bundle-relative path → absolute file), naming the
 * first document that differs.
 */
export function readLock(
  root: string,
  files: {
    readonly documents: ReadonlyMap<string, string>;
    readonly companions: ReadonlyMap<string, string>;
  },
  options: { readonly draftsRequested: boolean },
): BuildLock {
  const file = path.join(root, LOCK_FILE);
  if (!existsSync(file)) {
    refuse(
      "ksor-lock-missing",
      `${LOCK_FILE} is not there`,
      "the site projects what `ksor build` checked — without its lock this build cannot tell a checked record from an unchecked one, and a projection of an unchecked record is one nothing governs",
      "run `ksor build` first (`pnpm build` does), then build the site; `pnpm dev` needs no lock",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    parsed = undefined;
  }
  const lock = lockSchema.safeParse(parsed);
  if (!lock.success) {
    refuse(
      "ksor-lock-stale",
      `${LOCK_FILE} cannot be read as a build lock (${lock.error.issues[0]?.path.join(".") || "root"}: ${lock.error.issues[0]?.message ?? "unreadable"})`,
      "a lock this site cannot read cannot say what was checked",
      "run `ksor build` again; if the lock was written by a newer ksor, upgrade the site with `ksor migrate --write-site`",
    );
  }
  const stale = firstStale(lock.data, files);
  if (stale !== null) {
    refuse(
      "ksor-lock-stale",
      `${LOCK_FILE} does not match the tree: ${stale}`,
      "the lock records the exact record `ksor build` checked; a document that changed since was never checked, so this build would publish what nothing governs",
      "run `ksor build` again and commit the lock with the change",
    );
  }
  if (options.draftsRequested && lock.data.drafts !== "shown") {
    refuse(
      "ksor-lock-stale",
      `KSOR_DRAFTS=show was requested, but ${LOCK_FILE} was built with drafts hidden`,
      "the lock's build_id covers the drafts switch, so a site showing drafts under a lock that hid them would stamp every artefact with an id that does not describe it",
      "run `KSOR_DRAFTS=show ksor build` before the site build, or build without KSOR_DRAFTS",
    );
  }
  if (outdated(lock.data.ksor_version, RULES_VERSION)) {
    refuse(
      "ksor-site-outdated",
      `${LOCK_FILE} was built by ksor ${lock.data.ksor_version}, and this site carries rule modules from ${RULES_VERSION}`,
      "the site would project the record with rules older than the ones that checked it — a document the newer checker admits under a rule this site does not know is a document this build gets wrong",
      "upgrade the site's rule modules: `ksor migrate --write-site` offers the byte-copied modules as diffs (decision 4)",
    );
  }
  return lock.data;
}

/** The first path whose presence or hash disagrees between lock and tree, described; null when none. */
function firstStale(
  lock: BuildLock,
  files: {
    readonly documents: ReadonlyMap<string, string>;
    readonly companions: ReadonlyMap<string, string>;
  },
): string | null {
  for (const [kind, entries, tree] of [
    ["document", lock.documents, files.documents],
    ["companion", lock.companions, files.companions],
  ] as const) {
    const locked = new Map(entries.map((e) => [e.path, e.sha256] as const));
    for (const [rel, abs] of tree) {
      const want = locked.get(rel);
      if (want === undefined) return `${kind} ${rel} is in the tree and not in the lock`;
      if (want !== sha256Of(abs)) return `${kind} ${rel} changed since the lock was written`;
    }
    for (const rel of locked.keys()) {
      if (!tree.has(rel)) return `${kind} ${rel} is in the lock and no longer in the tree`;
    }
  }
  return null;
}

/**
 * Is a lock written by `lockVersion` newer than the rules this site carries?
 * Numeric semver, pre-release tags ignored; a stamp that is not a version
 * (the template's literal, never stamped) cannot be compared and counts as
 * outdated, because an unstamped site is one `ksor init` never finished.
 */
export function outdated(lockVersion: string, rulesVersion: string): boolean {
  const a = parts(lockVersion);
  const b = parts(rulesVersion);
  if (a === null) return false;
  if (b === null) return true;
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

function parts(version: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
}
