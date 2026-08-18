import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** The exactly-two authored substitutions (spec: templates + two stamps). */
export interface Stamps {
  readonly name: string;
  readonly version: string;
}

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
  ".gitignore",
  ".gitattributes",
  ".txt",
]);

function isTextFile(file: string): boolean {
  const base = path.basename(file);
  if (base === ".gitignore" || base === ".gitattributes") return true;
  return TEXT_EXTENSIONS.has(path.extname(file));
}

/**
 * Copy the template tree into targetDir, applying the two stamps to text
 * files. Byte-determinism holds because templates are shipped bytes and the
 * stamps are pure string substitution.
 */
export function materialize(templateDir: string, targetDir: string, stamps: Stamps): void {
  for (const entry of readdirSync(templateDir, { withFileTypes: true })) {
    const from = path.join(templateDir, entry.name);
    const to = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true });
      materialize(from, to, stamps);
    } else if (isTextFile(from)) {
      const text = readFileSync(from, "utf8")
        .replaceAll("__KSOR_NAME__", stamps.name)
        .replaceAll("__KSOR_VERSION__", stamps.version);
      writeFileSync(to, text);
    } else {
      copyFileSync(from, to);
    }
  }
}
