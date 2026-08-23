import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

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
  created: string[] = [],
): readonly string[] {
  for (const entry of readdirSync(templateDir, { withFileTypes: true })) {
    // A dev checkout's template can be accidentally installed into (found
    // live 2026-08-18: a concurrent agent left 477 MB of node_modules there);
    // the scaffold must never inherit it. The published tarball never
    // carries one, so this guard is inert in production.
    if (entry.name === "node_modules") continue;
    const from = path.join(templateDir, entry.name);
    const to = path.join(targetDir, EMITTED_NAMES.get(entry.name) ?? entry.name);
    if (entry.isDirectory()) {
      if (!existsSync(to)) {
        mkdirSync(to, { recursive: true });
        created.push(to);
      }
      materialize(from, to, stamps, created);
    } else if (isTextFile(from)) {
      const text = readFileSync(from, "utf8")
        .replaceAll("KSOR-STAMP-NAME", stamps.name)
        .replaceAll("KSOR-STAMP-VERSION", stamps.version);
      // Tracked before the write: a mid-write ENOSPC leaves a partial file
      // the rollback must still remove (review finding, 2026-08-18).
      created.push(to);
      writeFileSync(to, text);
    } else {
      created.push(to);
      copyFileSync(from, to);
    }
  }
  return created;
}
