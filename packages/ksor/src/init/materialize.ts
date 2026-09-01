import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  applyProse,
  extraFiles,
  isSkippedFor,
  transformManifest,
  type PackageManager,
} from "./manager.js";

/** The exactly-two authored substitutions (spec: templates + two stamps). */
export interface Stamps {
  readonly name: string;
  readonly version: string;
}

// npm pack always excludes files named .gitignore, so the template ships as
// "gitignore" (found live: npm pack --dry-run, 2026-08-18)
const EMITTED_NAMES: ReadonlyMap<string, string> = new Map([
  ["gitignore", ".gitignore"],
  // Same reason as .gitignore: npm pack is unreliable about leading-dot names,
  // so the template ships bare and init restores the dot.
  ["env.example", ".env.example"],
  ["dockerignore", ".dockerignore"],
  // The MCP servers a coding agent may reach from this project. Ships bare for
  // the same packing reason, and it carries no secret — both entries
  // authenticate interactively — so it is committed rather than ignored.
  ["mcp.json", ".mcp.json"],
]);

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  ".css",
  ".txt",
]);

function isTextFile(file: string): boolean {
  const base = path.basename(file);
  if (base === "gitignore" || base === ".gitattributes") return true;
  return TEXT_EXTENSIONS.has(path.extname(file));
}

/**
 * Copy the template tree into targetDir, applying the two stamps to text
 * files. Byte-determinism holds because templates are shipped bytes and the
 * stamps are pure string substitution.
 *
 * Every path it brings into existence is appended to `created`, parents before
 * children, so a caller that cannot rename-over (the `init .` form) can undo
 * a half-written tree in reverse order.
 */
export function materialize(
  templateDir: string,
  targetDir: string,
  stamps: Stamps,
  manager: PackageManager = "pnpm",
  created: string[] = [],
): readonly string[] {
  materializeTree(templateDir, targetDir, stamps, manager, created, true);
  return created;
}

function materializeTree(
  templateDir: string,
  targetDir: string,
  stamps: Stamps,
  manager: PackageManager,
  created: string[],
  isRoot: boolean,
): void {
  for (const entry of readdirSync(templateDir, { withFileTypes: true })) {
    // A dev checkout's template can be accidentally installed into (found
    // live 2026-08-18: a concurrent agent left 477 MB of node_modules there);
    // the scaffold must never inherit it. The published tarball never
    // carries one, so this guard is inert in production.
    if (entry.name === "node_modules") continue;
    // A manager's scaffold carries only its own machinery: pnpm-workspace.yaml
    // and the committed lockfile belong to the pnpm shape alone (issue #28).
    if (isRoot && isSkippedFor(entry.name, manager)) continue;
    const from = path.join(templateDir, entry.name);
    const to = path.join(targetDir, EMITTED_NAMES.get(entry.name) ?? entry.name);
    if (entry.isDirectory()) {
      if (!existsSync(to)) {
        mkdirSync(to, { recursive: true });
        created.push(to);
      }
      materializeTree(from, to, stamps, manager, created, false);
    } else if (isTextFile(from)) {
      const stamped = readFileSync(from, "utf8")
        .replaceAll("KSOR-STAMP-NAME", stamps.name)
        .replaceAll("KSOR-STAMP-VERSION", stamps.version);
      // The manifest is transformed structurally; every other text file gets
      // the prose translation (manager blocks + spellings). Both are pure
      // functions of shipped bytes, so byte-determinism per manager holds.
      const text =
        isRoot && entry.name === "package.json"
          ? transformManifest(stamped, manager)
          : applyProse(stamped, manager);
      // Tracked before the write: a mid-write ENOSPC leaves a partial file
      // the rollback must still remove (review finding, 2026-08-18).
      created.push(to);
      writeFileSync(to, text);
    } else {
      created.push(to);
      copyFileSync(from, to);
    }
  }
}

/** Emit the files a manager's scaffold gains beyond the template tree. */
export function materializeExtras(
  targetDir: string,
  manager: PackageManager,
  created: string[] = [],
): readonly string[] {
  for (const [name, content] of extraFiles(manager)) {
    const to = path.join(targetDir, name);
    created.push(to);
    writeFileSync(to, content);
  }
  return created;
}
