/**
 * KSP R23 — the first verification tooth in approval.
 *
 * A `stable` concept's `generated.at` dates its TEXT, and `ksor.approval.at`
 * ratifies the text of that date. Until now the checker compared the two
 * authored instants and nothing else (`ksor-generated-after-approval`), so
 * whether an edit actually moved `generated.at` was the author's obligation:
 * change a sentence, leave the stamp, and the approval that ratified the old
 * sentence reads as ratifying the new one, with nothing red. This module
 * compares the body in the working tree against every committed version of
 * the same path that was `stable` under the SAME `generated.at`, and refuses
 * `ksor-generated-stale` when they differ. Only the body: a frontmatter-only
 * edit — a `verified` entry, a re-approval — is not a change to the text the
 * stamp dates.
 *
 * What it does NOT verify, and says so: who reviewed anything. R22 and R25
 * need an identity the platform can vouch for, and `approval.checked` stays
 * `"policy"` (decision 21). This is the one rule in the record module that
 * reads git, so it sits beside `git-ledger.ts` and is run by the three
 * programs that have a checkout — `ksor build`, `ksor ingest` and the emitted
 * `check.mjs` — each of which SAYS when history could not be read rather than
 * passing a check that did not run.
 */
import { spawnSync } from "node:child_process";

import { normalizeText, splitFrontmatter } from "./frontmatter";
import { git } from "./git-ledger";
import { parseInstant } from "./instant";
import type { Concept } from "./profile";
import type { Refusal } from "./refusal";

export interface CommittedVersion {
  readonly sha: string;
  /** The committer instant, ISO 8601 with an offset (`%cI`). */
  readonly committedAt: string;
  readonly text: string;
}

export interface CommittedHistory {
  /** False outside any repository, and false without a git binary. */
  readonly repository: boolean;
  /** Whether HEAD exists: a fresh `ksor init` is a repository with no commit. */
  readonly born: boolean;
  readonly shallow: boolean;
  /** Record-relative path → its committed versions, newest first; null when history could not be read. */
  readonly versions: ReadonlyMap<string, readonly CommittedVersion[]> | null;
}

/** The record's bundle, and the only pathspec the walk needs (relative to the cwd, which is the record root). */
const BUNDLE = "knowledge/";

/**
 * Objects per `git cat-file --batch` call. One process per object was measured
 * at ~53 ms a call on the machine this was built on against ~0.6 ms an object
 * batched (2026-09-02), so a record with a few hundred committed versions is
 * the difference between a build that finishes and one that does not. Chunked
 * so the reply stays under the buffer ceiling `git-ledger.ts` explains.
 */
const BATCH = 256;
const MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Every committed version of each path, read in three git calls plus one
 * `cat-file --batch` per chunk. `--full-history`, for the reason the ledger
 * walk gives: default simplification follows a merge through the parent it is
 * TREESAME to, so a version that lived only on a branch never enters the set.
 * `-m`, because without a diff-merges option a merge commit lists NO paths at
 * all — verified against git 2.50 — and a conflict resolved by hand is a body
 * that is in neither parent; the same commit then prints once per parent, so
 * versions are keyed by (commit, path).
 */
export function committedVersions(root: string, paths: readonly string[]): CommittedHistory {
  const inside = git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside === null || inside.trim() !== "true") {
    return { repository: false, born: false, shallow: false, versions: null };
  }
  const shallow = (git(root, ["rev-parse", "--is-shallow-repository"]) ?? "").trim() === "true";
  const born = git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]) !== null;
  const versions = new Map<string, CommittedVersion[]>();
  if (!born || paths.length === 0) return { repository: true, born, shallow, versions };

  // `--name-only` prints paths from the REPOSITORY root, and the record may
  // sit below it (`docs-sor/knowledge/x.md`) — the same two meanings of "path"
  // `git-ledger.ts` records. The pathspec is cwd-relative; the names are not.
  const prefix = (git(root, ["rev-parse", "--show-prefix"]) ?? "").trim();
  const log = git(root, [
    "log",
    "--full-history",
    "-m",
    "--format=%x1e%H %cI",
    "--name-only",
    "--",
    BUNDLE,
  ]);
  if (log === null) return { repository: true, born, shallow, versions: null };

  const wanted = new Set(paths);
  const refs: { readonly sha: string; readonly committedAt: string; readonly path: string }[] = [];
  const seen = new Set<string>();
  for (const block of log.split("\x1e")) {
    const [header = "", ...names] = block.split("\n");
    const [sha = "", committedAt = ""] = header.trim().split(" ");
    if (sha === "") continue;
    for (const name of names) {
      // Names the profile admits are plain ASCII (`ksor-name-unportable`), so
      // git never C-quotes one here; a quoted stray matches no wanted path.
      const trimmed = name.trim();
      if (trimmed === "" || !trimmed.startsWith(prefix)) continue;
      const rel = trimmed.slice(prefix.length);
      if (!wanted.has(rel) || seen.has(`${sha} ${rel}`)) continue;
      seen.add(`${sha} ${rel}`);
      refs.push({ sha, committedAt, path: rel });
    }
  }
  const blobs = readBlobs(
    root,
    refs.map((r) => `${r.sha}:${prefix}${r.path}`),
  );
  if (blobs === null) return { repository: true, born, shallow, versions: null };
  refs.forEach((ref, i) => {
    const text = blobs[i];
    // Absent in that commit: the commit DELETED the path (a rename's old name).
    if (text === null || text === undefined) return;
    const list = versions.get(ref.path) ?? [];
    list.push({ sha: ref.sha, committedAt: ref.committedAt, text });
    versions.set(ref.path, list);
  });
  return { repository: true, born, shallow, versions };
}

/**
 * `<rev>:<path>` specs → text, in order; null for a spec that names nothing,
 * and null for the WHOLE read when git failed — a version dropped in silence
 * would read as verified.
 */
function readBlobs(root: string, specs: readonly string[]): readonly (string | null)[] | null {
  const out: (string | null)[] = [];
  for (let i = 0; i < specs.length; i += BATCH) {
    const chunk = specs.slice(i, i + BATCH);
    const r = spawnSync("git", ["cat-file", "--batch"], {
      cwd: root,
      input: `${chunk.join("\n")}\n`,
      maxBuffer: MAX_BUFFER,
    });
    if (r.status !== 0) return null;
    const buf: Buffer = r.stdout;
    let at = 0;
    for (let k = 0; k < chunk.length; k += 1) {
      const nl = buf.indexOf(0x0a, at);
      if (nl === -1) return null;
      const header = buf.subarray(at, nl).toString("utf8");
      at = nl + 1;
      if (header.endsWith(" missing")) {
        out.push(null);
        continue;
      }
      const [, type, sizeText] = header.split(" ");
      const size = Number(sizeText);
      if (type !== "blob" || !Number.isInteger(size) || at + size > buf.length) return null;
      out.push(buf.subarray(at, at + size).toString("utf8"));
      at += size + 1;
    }
  }
  return out;
}

interface StableVersion {
  readonly sha: string;
  readonly committedAt: string;
  readonly generatedAt: number;
  readonly body: string;
}

/** Line endings are the checkout's and a trailing blank line is nobody's edit; everything else is the text. */
function comparable(body: string): string {
  return normalizeText(body).trimEnd();
}

/**
 * A committed version as a stable, stamped text — or null: a draft's body is
 * free, and a version the profile cannot read (no fence, broken YAML, no
 * `generated.at`) was never a stable version under the profile.
 */
function stableVersionOf(version: CommittedVersion, path: string): StableVersion | null {
  const split = splitFrontmatter(version.text, path);
  if (!split.ok || split.frontmatter === null || split.frontmatter["status"] !== "stable") {
    return null;
  }
  const generated = split.frontmatter["generated"];
  if (typeof generated !== "object" || generated === null) return null;
  const at = (generated as Readonly<Record<string, unknown>>)["at"];
  const generatedAt = typeof at === "string" ? parseInstant(at) : null;
  if (generatedAt === null) return null;
  return {
    sha: version.sha,
    committedAt: version.committedAt,
    generatedAt,
    body: comparable(split.body),
  };
}

/**
 * The rule, pure: for every `stable` concept, every committed version that was
 * `stable` under the same `generated.at` must carry the same body. All of
 * history, not only HEAD's version — an edit committed without a bump matches
 * HEAD exactly, and it is the version BEHIND it that tells (the shape CI
 * sees). A path with no committed stable version passes: stable for the first
 * time, or renamed, since path is identity. Instants are compared as instants,
 * so two spellings of one moment are one stamp.
 */
export function checkGeneratedStale(
  concepts: readonly Concept[],
  files: ReadonlyMap<string, string>,
  versions: ReadonlyMap<string, readonly CommittedVersion[]>,
): Refusal[] {
  const refusals: Refusal[] = [];
  for (const concept of concepts) {
    if (concept.status !== "stable" || concept.generatedAt === null) continue;
    const text = files.get(concept.path);
    if (text === undefined) continue;
    const split = splitFrontmatter(text, concept.path);
    if (!split.ok) continue;
    const body = comparable(split.body);
    for (const version of versions.get(concept.path) ?? []) {
      const stable = stableVersionOf(version, concept.path);
      if (stable === null || stable.generatedAt !== concept.generatedAt || stable.body === body) {
        continue;
      }
      const authored = (concept.frontmatter["generated"] as { readonly at?: unknown } | undefined)
        ?.at;
      const stamp = typeof authored === "string" ? authored : new Date(concept.generatedAt).toISOString();
      refusals.push({
        slug: "ksor-generated-stale",
        path: concept.path,
        why:
          `the body differs from the one committed at ${stable.sha.slice(0, 7)} (${stable.committedAt}), ` +
          `where this concept was \`stable\` under the same \`generated.at\` (${stamp}) — that instant dates ` +
          "the text, so an edit to a stable concept must advance it, or the approval that ratified the old " +
          "text reads as ratifying the new one (KSP R23)",
        fix:
          "set `generated.at` to an instant after this edit, then re-approve: `ksor.approval.at` must not " +
          "precede the new `generated.at` (`ksor-generated-after-approval`)",
      });
      break;
    }
  }
  return refusals;
}

export interface ChangeControl {
  readonly refusals: readonly Refusal[];
  /**
   * Why the check could not run, or ran short — printed beside the verdict,
   * never swallowed. Null when every committed version was read.
   */
  readonly notice: string | null;
}

/** The three callers' one entry: read history for the stable concepts, judge, and say what could not be read. */
export function checkChangeControl(
  root: string,
  concepts: readonly Concept[],
  files: ReadonlyMap<string, string>,
): ChangeControl {
  const paths = concepts.filter((c) => c.status === "stable").map((c) => c.path);
  const history = committedVersions(root, paths);
  const refusals =
    history.versions === null ? [] : checkGeneratedStale(concepts, files, history.versions);
  return { refusals, notice: changeControlNotice(history) };
}

/**
 * Honest absence in the build's own idiom — the `source: unspecified` line
 * already says the commit is unknown; this says the same of the check that
 * needs one. A check that could not run is never a check that passed.
 */
function changeControlNotice(history: CommittedHistory): string | null {
  const what =
    "so whether a stable concept's body changed under its `generated.at` (KSP R23) was not checked";
  if (!history.repository) {
    return `change-control: not checked — knowledge/ is not in a git repository (or git is not installed), ${what}`;
  }
  if (!history.born) {
    return `change-control: not checked — the repository has no commits yet, ${what}`;
  }
  if (history.versions === null) {
    return `change-control: not checked — git could not read the history of knowledge/ (\`git log -- knowledge/\` or \`git cat-file --batch\` failed), ${what}`;
  }
  if (history.shallow) {
    const read = [...history.versions.values()].reduce((n, list) => n + list.length, 0);
    return (
      `change-control: checked against the ${read} committed version(s) this shallow clone holds — a stable ` +
      "version beyond the shallow boundary was not read; fetch full history (`git fetch --unshallow`; in CI, " +
      "`fetch-depth: 0`) to check all of it"
    );
  }
  return null;
}
