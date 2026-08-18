import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Nearest ancestor (inclusive) containing instance.md, or null. */
export function findAncestorProject(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(dir, "instance.md"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Nearest ancestor (exclusive of startDir) that is a pnpm workspace root
 * whose globs could swallow a nested project. Presence of the file is enough
 * to warn — glob analysis would promise precision the warning doesn't need.
 */
export function findAncestorWorkspace(startDir: string): string | null {
  let dir = path.dirname(path.resolve(startDir));
  for (;;) {
    const manifest = path.join(dir, "pnpm-workspace.yaml");
    if (existsSync(manifest)) return dir;
    const pkg = path.join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, "utf8")) as { workspaces?: unknown };
        if (parsed.workspaces !== undefined) return dir;
      } catch {
        // Unparseable package.json above us is not our problem to report.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
