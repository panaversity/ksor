/**
 * The one place the record module touches the filesystem: find the instance
 * and read the tree into `RecordFiles`. `resolveInstanceDir` is the shared
 * `--instance` resolution build spec §1 names for `build`, `migrate`,
 * `takedown` and `ingest` — the nearest ancestor `instance.md`, or null.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { RecordFiles } from "./check.js";
import type { ScaffoldStructure } from "./hygiene.js";

const CONTROL_FILES = ["instance.md", ".ksor/governance.yaml", ".ksor/takedowns.yaml"] as const;
/** Files the operating system writes behind the author's back: ignored, never reported. */
const OS_JUNK = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/** The directory holding the nearest `instance.md` at or above `start`, or null when none. */
export function resolveInstanceDir(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, "instance.md"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Everything the checker reads, under the record at `root`. Symlinks are not
 * followed — they are reported, and the checker refuses them (a dangling one
 * crashed the old checker with a raw ENOENT before any other problem was
 * reported, review 2026-08-18).
 */
/**
 * What the LOADER always produces, as against the in-memory `RecordFiles` a
 * test may hand-build: `assets` and `symlinks` are optional on that type
 * because a fixture map omits them, and every caller that reads a real tree
 * then had to re-prove they exist. The site's build was the one that noticed
 * (`'record.assets' is possibly 'undefined'`) — its `tsc` runs over the
 * template, which this repo's own typecheck does not.
 */
export interface LoadedRecord extends RecordFiles {
  readonly assets: ReadonlyMap<string, Uint8Array>;
  readonly symlinks: readonly string[];
}

export function loadRecord(root: string): LoadedRecord {
  const files = new Map<string, string>();
  const assets = new Map<string, Uint8Array>();
  const dirs: string[] = [];
  const symlinks: string[] = [];
  for (const rel of CONTROL_FILES) {
    const abs = path.join(root, rel);
    if (existsSync(abs) && statSync(abs).isFile()) files.set(rel, readFileSync(abs, "utf8"));
  }
  const knowledge = path.join(root, "knowledge");
  if (existsSync(knowledge)) walk(knowledge, "knowledge", { files, assets, dirs, symlinks });
  return { files, dirs, assets, symlinks };
}

interface Walked {
  readonly files: Map<string, string>;
  readonly assets: Map<string, Uint8Array>;
  readonly dirs: string[];
  readonly symlinks: string[];
}

function walk(abs: string, rel: string, out: Walked): void {
  for (const entry of readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    if (OS_JUNK.has(entry.name)) continue;
    const childAbs = path.join(abs, entry.name);
    const childRel = `${rel}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      out.symlinks.push(childRel);
    } else if (entry.isDirectory()) {
      out.dirs.push(childRel);
      walk(childAbs, childRel, out);
    } else if (entry.isFile() && /\.(md|yaml)$/.test(entry.name)) {
      out.files.set(childRel, readFileSync(childAbs, "utf8"));
    } else if (entry.isFile()) {
      out.assets.set(childRel, new Uint8Array(readFileSync(childAbs)));
    }
  }
}

const SITE_BUILD_DIRS = new Set(["node_modules", ".next", ".source", ".staged-knowledge", "out"]);

/** The project around the record, for `checkScaffoldStructure` (the emitted checker's structure rules). */
export function loadScaffoldStructure(root: string): ScaffoldStructure {
  const claudeMd = path.join(root, "CLAUDE.md");
  const digests = (dir: string): Map<string, string> => {
    const out = new Map<string, string>();
    if (!existsSync(dir)) return out;
    for (const file of filesUnder(dir, new Set())) {
      out.set(
        path.relative(dir, file).split(path.sep).join("/"),
        createHash("sha256").update(readFileSync(file)).digest("hex"),
      );
    }
    return out;
  };
  const site = path.join(root, "system", "site");
  const siteContentFiles = existsSync(site)
    ? filesUnder(site, SITE_BUILD_DIRS)
        .filter((p) => /\.mdx?$/i.test(p))
        .map((p) => path.relative(root, p).split(path.sep).join("/"))
        .sort()
    : [];
  return {
    claudeMd: existsSync(claudeMd) ? readFileSync(claudeMd, "utf8") : null,
    agentsSkills: digests(path.join(root, ".agents", "skills")),
    claudeSkills: digests(path.join(root, ".claude", "skills")),
    siteContentFiles,
  };
}

function filesUnder(dir: string, skip: ReadonlySet<string>): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry) => {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) return skip.has(entry.name) ? [] : filesUnder(p, skip);
      // lstat, not the dirent: a dangling symlink is neither a file nor a directory to readdir.
      return lstatSync(p).isFile() ? [p] : [];
    });
}
