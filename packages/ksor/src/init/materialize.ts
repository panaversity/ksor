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
const EMITTED_NAMES: ReadonlyMap<string, string> = new Map([["gitignore", ".gitignore"]]);

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
      writeFileSync(to, text);
      created.push(to);
    } else {
      copyFileSync(from, to);
      created.push(to);
    }
  }
  return created;
}
