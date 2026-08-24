/**
 * The one place the record module touches the filesystem: find the instance
 * and read the tree into `RecordFiles`. `resolveInstanceDir` is the shared
 * `--instance` resolution build spec §1 names for `build`, `migrate`,
 * `takedown` and `ingest` — the nearest ancestor `instance.md`, or null.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { RecordFiles } from "./check.js";

const CONTROL_FILES = ["instance.md", ".ksor/governance.yaml", ".ksor/takedowns.yaml"] as const;

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

/** Everything the checker reads, under the record at `root`. Symlinks are not followed. */
export function loadRecord(root: string): RecordFiles {
  const files = new Map<string, string>();
  const dirs: string[] = [];
  for (const rel of CONTROL_FILES) {
    const abs = path.join(root, rel);
    if (existsSync(abs) && statSync(abs).isFile()) files.set(rel, readFileSync(abs, "utf8"));
  }
  const knowledge = path.join(root, "knowledge");
  if (existsSync(knowledge)) walk(knowledge, "knowledge", files, dirs);
  return { files, dirs };
}

function walk(abs: string, rel: string, files: Map<string, string>, dirs: string[]): void {
  for (const entry of readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const childAbs = path.join(abs, entry.name);
    const childRel = `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      dirs.push(childRel);
      walk(childAbs, childRel, files, dirs);
    } else if (entry.isFile() && /\.(md|yaml)$/.test(entry.name)) {
      files.set(childRel, readFileSync(childAbs, "utf8"));
    }
  }
}
