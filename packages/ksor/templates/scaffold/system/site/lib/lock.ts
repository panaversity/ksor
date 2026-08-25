import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { refuse } from "./audience";
import { RULES_VERSION } from "./rules-version";
import { parseInstant } from "../record/instant";

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
 *
 * Freshness is asked in two halves, `readLock` then `assertLockCoversTree`,
 * with the record's own checker between them: everything answerable about the
 * lock alone comes first, and the file-by-file comparison comes after the tree
 * has been shown to be a record at all.
 */

const hex64 = z.string().regex(/^[0-9a-f]{64}$/, "a sha256 hex digest");
const hashed = z.object({ path: z.string().min(1), sha256: hex64 });

/**
 * `as_of` and `ksor_version` are VALIDATED here, not merely required to be
 * non-empty, because both fail open downstream when they are unreadable: an
 * `as_of` that does not parse made every lifecycle comparison `NaN`-false, so a
 * policy not effective until 2030 was published as current and carried no
 * badge; a `ksor_version` the semver regex misses slipped past the
 * `ksor-site-outdated` gate and was then stamped verbatim into every machine
 * artefact. A lock the site cannot read cannot say what was checked.
 */
const instant = z
  .string()
  .refine((v) => parseInstant(v) !== null, "an ISO 8601 instant with an explicit offset");
const semver = z.string().regex(/^v?\d+\.\d+\.\d+/, "a version this site can compare");

const lockSchema = z
  .object({
    format: z.literal(1),
    build_id: z.string().min(1),
    ksor_version: semver,
    source_commit: z.string().nullable(),
    dirty: z.boolean(),
    as_of: instant,
    drafts: z.enum(["hidden", "shown"]),
    instance_sha256: hex64,
    policy_sha256: hex64,
    ledger_sha256: hex64,
    ledger_entries: z.array(z.object({ id: z.string().min(1), digest: hex64 }).loose()),
    audiences: z.object({ registry: z.array(z.string().min(1)) }).loose(),
    documents: z.array(hashed.loose()),
    companions: z.array(hashed.loose()),
    assets: z.array(hashed.loose()),
  })
  .loose();

/**
 * The three files that hold the record's governance, hashed the way
 * `composeLock` hashes them: over the TEXT, with the empty string standing for
 * a ledger that does not exist.
 */
export interface ControlTexts {
  readonly instance: string;
  readonly policy: string;
  /** Null when `.ksor/takedowns.yaml` is not there — an empty ledger. */
  readonly ledger: string | null;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

export type BuildLock = z.infer<typeof lockSchema>;

export const LOCK_FILE = "build.lock.json";

/** sha256 of a file's raw bytes, hex — what `documents[].sha256` holds. */
export function sha256Of(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/**
 * The lock itself: present, readable, and describing THIS instance's
 * governance and this build's switches. Refuses `ksor-lock-missing` when
 * absent, `ksor-lock-stale` when unreadable or when a control file has changed
 * since it was written, and `ksor-site-outdated` when it was written by a
 * newer ksor than the rule modules this site carries.
 *
 * Everything here is answerable WITHOUT looking at the record's tree, which is
 * why it is separate from `assertLockCoversTree`: the caller checks the record
 * in between, so a tree that is not a legal record is refused by the rule it
 * breaks instead of by a freshness claim it was never eligible for.
 */
export function readLock(
  root: string,
  control: ControlTexts,
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
  // The control files before anything else about this record, the record's own
  // rules included: a stale LEDGER or POLICY is a takedown that was lifted or
  // an authority that was rewritten, and the lock's `ledger_entries` are the
  // baseline the checker is then handed for `ksor-ledger-amended` — so a ledger
  // the lock never saw is refused HERE, before anything is judged against it.
  // The file-by-file comparison is `assertLockCoversTree`, after the checker.
  for (const [file, want, have] of [
    ["instance.md", lock.data.instance_sha256, sha256Text(control.instance)],
    [".ksor/governance.yaml", lock.data.policy_sha256, sha256Text(control.policy)],
    [".ksor/takedowns.yaml", lock.data.ledger_sha256, sha256Text(control.ledger ?? "")],
  ] as const) {
    if (want === have) continue;
    refuse(
      "ksor-lock-stale",
      `${file} changed since ${LOCK_FILE} was written`,
      "the lock's build_id is a hash over the record AND the three files that govern it, so a projection under a control file the lock never saw publishes what nothing checked — a denial lifted by deleting a line would otherwise leave the lock valid",
      "run `ksor build` again and commit the lock with the change; lift a denial with `ksor takedown --revoke <id>`, never by editing the ledger",
    );
  }
  // Both directions. The reverse — a `drafts: shown` lock and no KSOR_DRAFTS —
  // is the dangerous one: one preview build accidentally committed publishes
  // every draft on every later production deploy, with no environment signal
  // and nothing red (`noindex` is a crawler hint, not a control).
  if (options.draftsRequested !== (lock.data.drafts === "shown")) {
    refuse(
      "ksor-lock-stale",
      options.draftsRequested
        ? `KSOR_DRAFTS=show was requested, but ${LOCK_FILE} was built with drafts hidden`
        : `${LOCK_FILE} was built with drafts SHOWN, and this build did not ask for them`,
      "the lock's build_id covers the drafts switch, so a site and a lock that disagree about it would stamp every artefact with an id that does not describe it — and a preview lock is not a publishing lock",
      options.draftsRequested
        ? "run `KSOR_DRAFTS=show ksor build` before the site build, or build without KSOR_DRAFTS"
        : "run `ksor build` (without KSOR_DRAFTS) and commit the lock, or build the preview with `KSOR_DRAFTS=show`",
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

/**
 * Does the lock describe THIS tree, file by file? Refuses `ksor-lock-stale`
 * naming the first path that disagrees.
 *
 * Run AFTER the record's own checker, not before it, because this comparison
 * cannot tell a document that changed from a file the record may not hold at
 * all — and it answers both the same way. An `.mdx` dropped into `knowledge/`
 * is refused by name (`ksor-file-type`: the bundle is CommonMark), so no
 * `ksor build` can ever have listed it here; reporting it as "asset notes.mdx
 * is in the tree and not in the lock" told the operator to re-run the build
 * that refuses the file, and named neither the rule nor the fix (found in
 * review, 2026-08-25). The record is judged by its own rules first; the lock's
 * claim about the tree is asked once the tree is a record.
 *
 * Nothing is staged in between, so the ordering costs a refused build one
 * checker pass and can never publish anything.
 */
export function assertLockCoversTree(
  lock: BuildLock,
  files: {
    readonly documents: ReadonlyMap<string, string>;
    readonly companions: ReadonlyMap<string, string>;
    readonly assets: ReadonlyMap<string, string>;
  },
): void {
  const stale = firstStale(lock, files);
  if (stale === null) return;
  refuse(
    "ksor-lock-stale",
    `${LOCK_FILE} does not match the tree: ${stale}`,
    "the lock records the exact record `ksor build` checked; a document that changed since was never checked, so this build would publish what nothing governs",
    "run `ksor build` again and commit the lock with the change",
  );
}

/** The first path whose presence or hash disagrees between lock and tree, described; null when none. */
function firstStale(
  lock: BuildLock,
  files: {
    readonly documents: ReadonlyMap<string, string>;
    readonly companions: ReadonlyMap<string, string>;
    readonly assets: ReadonlyMap<string, string>;
  },
): string | null {
  for (const [kind, entries, tree] of [
    ["document", lock.documents, files.documents],
    ["companion", lock.companions, files.companions],
    // Assets last and never omitted: the site publishes their bytes, and for a
    // record whose diagrams carry the substance a lock that stops at the
    // markdown does not cover what the build actually serves.
    ["asset", lock.assets, files.assets],
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
 * Numeric semver, pre-release tags ignored. NEITHER unparsable side is
 * "current": a SITE stamp that is not a version is the template's literal, so
 * `ksor init` never finished; a LOCK version that is not a version is a lock
 * this site cannot compare against at all. Both count as outdated — this used
 * to return false for the lock half, which let `"999"` past the gate and then
 * stamped it into every machine artefact. `lockSchema` now refuses that shape
 * first, so this branch is the second lock on the same door.
 */
export function outdated(lockVersion: string, rulesVersion: string): boolean {
  const a = parts(lockVersion);
  const b = parts(rulesVersion);
  if (a === null) return true;
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
