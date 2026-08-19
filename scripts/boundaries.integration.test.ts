import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Package-layering boundaries, established at baseline ZERO — before there is
// anything to violate — because guards added late carry debt forever (the
// predecessor's tests/test_boundaries.py, reproduced here for TypeScript).
// Enrolment is a decision with a name on it, not a silence: every workspace
// package must appear in ALLOWED, mapping to the set of internal packages it
// may import. This scan is intentionally static text analysis — depending on
// the TypeScript compiler API is forbidden until TS 7.1 (guard rule 6).

const repoRoot = path.resolve(path.dirname(fileURLToPath(new URL(import.meta.url))), "..");

// package name -> internal packages it may import. Adding a package here is a
// reviewed decision about the dependency graph, made in the same PR that adds
// the package.
const ALLOWED: Record<string, readonly string[]> = {
  "@panaversity/ksor": [],
  // The kernel conversion's layering (decision 11): platform is the floor,
  // content stands on it, the gateway composes content behind the kit. The
  // CLI stays the top of the graph and gains kernel edges only when the
  // serve verb wires in — a reviewed change here, in that PR.
  "@panaversity/ksor-platform": [],
  "@panaversity/ksor-content": ["@panaversity/ksor-platform"],
  "@panaversity/ksor-gateway-kit": [],
  "@panaversity/ksor-content-gateway": [
    "@panaversity/ksor-content",
    "@panaversity/ksor-gateway-kit",
    "@panaversity/ksor-platform",
  ],
};

interface SourceFile {
  readonly pkg: string;
  readonly rel: string;
  readonly text: string;
}

function workspacePackages(): Map<string, string> {
  const packagesDir = path.join(repoRoot, "packages");
  const result = new Map<string, string>();
  for (const dir of readdirSync(packagesDir)) {
    const manifest = path.join(packagesDir, dir, "package.json");
    if (!existsSync(manifest)) continue;
    const { name } = JSON.parse(readFileSync(manifest, "utf8")) as {
      name: string;
    };
    result.set(name, path.join(packagesDir, dir));
  }
  return result;
}

function sourceFiles(pkgName: string, pkgDir: string): SourceFile[] {
  const srcDir = path.join(pkgDir, "src");
  if (!existsSync(srcDir)) return [];
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const p = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
    });
  return walk(srcDir).map((file) => ({
    pkg: pkgName,
    rel: path.relative(repoRoot, file),
    text: readFileSync(file, "utf8"),
  }));
}

function importSpecifiers(text: string): string[] {
  // Scan a whitespace-flattened copy so formatter-wrapped multi-line imports
  // cannot slip past the graph (line numbers are not needed — violations are
  // reported per file).
  const flat = text.replace(/\s+/g, " ");
  const specifiers: string[] = [];
  const patterns = [
    /\b(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of flat.matchAll(pattern)) {
      const spec = match[1];
      if (spec !== undefined) specifiers.push(spec);
    }
  }
  return specifiers;
}

const packages = workspacePackages();
const files = [...packages.entries()].flatMap(([name, dir]) => sourceFiles(name, dir));

describe("package boundaries", () => {
  it("every workspace package is enrolled in ALLOWED", () => {
    const unenrolled = [...packages.keys()].filter((name) => !(name in ALLOWED));
    expect(
      unenrolled,
      `unenrolled package(s): ${unenrolled.join(", ")} — enrolment is a decision with a name on it, not a silence; add each to ALLOWED in ${path.relative(repoRoot, fileURLToPath(new URL(import.meta.url)))} declaring what it may import`,
    ).toEqual([]);
  });

  it("internal imports respect the declared graph", () => {
    const violations: string[] = [];
    for (const file of files) {
      for (const spec of importSpecifiers(file.text)) {
        const root = spec.startsWith("@")
          ? spec.split("/").slice(0, 2).join("/")
          : spec.split("/")[0];
        if (root === undefined || !packages.has(root) || root === file.pkg) {
          continue;
        }
        if (!(ALLOWED[file.pkg] ?? []).includes(root)) {
          violations.push(`${file.rel} imports ${root} — not in ALLOWED["${file.pkg}"]`);
        }
      }
    }
    expect(
      violations,
      `undeclared internal import(s); either the import is wrong or the graph decision must be recorded in ALLOWED:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("nothing hides the graph behind a dynamic import", () => {
    const violations = files
      .filter((file) => /\bimport\s*\(\s*[^'")\s]/.test(file.text))
      .map((file) => file.rel);
    expect(
      violations,
      `non-literal dynamic import in: ${violations.join(", ")} — a computed import target hides the dependency graph from this suite; use a static import or a string literal`,
    ).toEqual([]);
  });

  it("nothing imports the CLI — it is the top of the graph, never a library", () => {
    // Only relative and workspace-internal specifiers count: an external npm
    // package that happens to be named `cli` is not our CLI module.
    const isOurCliModule = (spec: string): boolean => {
      const root = spec.startsWith("@")
        ? spec.split("/").slice(0, 2).join("/")
        : spec.split("/")[0];
      const internal = spec.startsWith(".") || (root !== undefined && packages.has(root));
      return internal && /(?:^|\/)cli(?:\.m?js|\.ts)?$/.test(spec);
    };
    const violations = files
      .filter((file) => !file.rel.endsWith(`src${path.sep}cli.ts`))
      .filter((file) => importSpecifiers(file.text).some(isOurCliModule))
      .map((file) => file.rel);
    expect(
      violations,
      `${violations.join(", ")} imports the CLI module — shared behavior belongs in the library entry, and the CLI stays a thin caller`,
    ).toEqual([]);
  });
});
