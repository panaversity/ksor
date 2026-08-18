import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

// Assert on shipped bytes, not configuration: `files` in package.json can be
// edited (or a build can silently stop emitting an entry point) while publint
// and every other gate stay green. This packs the real tarball manifest and
// asserts the contract of what reaches npm.
const pkgDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const distCli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

const REQUIRED_IN_TARBALL = [
  "package.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "NOTICE",
  "dist/cli.mjs",
  "dist/index.mjs",
  "dist/index.d.mts",
  "docs/index.md",
  "templates/LICENSE",
  "templates/scaffold/package.json",
  "templates/scaffold/pnpm-lock.yaml",
  "templates/scaffold/instance.md",
  "templates/scaffold/vercel.json",
  // Not ".gitignore": npm pack drops that name from every tarball, so the
  // template ships bare and init renames it on emit.
  "templates/scaffold/gitignore",
  "templates/scaffold/system/site/package.json",
  "templates/scaffold/.agents/skills/format-checker/check.mjs",
  "templates/scaffold/.claude/skills/format-checker/check.mjs",
  "templates/scaffold/.github/workflows/validate.yml",
];

let workDirs: string[] = [];
afterEach(() => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
  workDirs = [];
});

function workDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ksor-tarball-"));
  workDirs.push(dir);
  return dir;
}

/** Every file in a tree as sorted relative paths. */
function treeFiles(root: string): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const p = path.join(dir, entry.name);
      if (entry.name === ".git") return [];
      return entry.isDirectory() ? walk(p) : [path.relative(root, p)];
    });
  return walk(root).sort();
}

describe("published tarball", () => {
  // npm startup on a cold CI runner can exceed vitest's 5s default.
  it("ships every contract file (run `pnpm build` first)", { timeout: 30_000 }, () => {
    const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: pkgDir,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    const jsonStart = result.stdout.indexOf("[");
    const [manifest] = JSON.parse(result.stdout.slice(jsonStart)) as [
      { files: { path: string }[] },
    ];
    const shipped = new Set(manifest.files.map((f) => f.path));
    const missing = REQUIRED_IN_TARBALL.filter((f) => !shipped.has(f));
    expect(
      missing,
      `tarball is missing: ${missing.join(", ")} — shipped: ${[...shipped].sort().join(", ")}`,
    ).toEqual([]);
  });

  // The scaffold's ignore rules ship as content (`templates/scaffold/gitignore`)
  // and so no longer govern this repo. found live: with nothing in their place,
  // npm pack listed a stray templates/scaffold/system/site/out/ — one `pnpm dev`
  // under the template would publish a Next.js build to npm (2026-08-18).
  it("never publishes transient output from the template tree", { timeout: 60_000 }, () => {
    // On a COPY of the package: planting the probe in the real template tree
    // raced the init suite's templates-identity test, which reads that tree
    // while vitest runs files in parallel (found live 2026-08-18 — the one
    // flake in three chained heavy runs, reproduced and pinned here). The
    // copy carries the same pack rules, so the mechanism under test rides
    // along.
    const staged = path.join(workDir(), "pkg");
    cpSync(pkgDir, staged, {
      recursive: true,
      filter: (src) => path.basename(src) !== "node_modules",
    });
    const probe = path.join(staged, "templates", "scaffold", "system", "site", "probe.tsbuildinfo");
    writeFileSync(probe, "transient\n");
    const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: staged,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout, "build output reached the tarball").not.toContain("probe.tsbuildinfo");
  });

  // The manifest above is a list of names someone maintains; this is the
  // installed artifact doing the job. found live: npm pack silently dropped
  // templates/scaffold/.gitignore, so every published scaffold shipped without
  // one while the checkout scaffolded correctly (attack run, 2026-08-18).
  it("scaffolds from the packed tarball exactly as the checkout does", { timeout: 180_000 }, () => {
    const packDir = workDir();
    const packed = spawnSync("npm", ["pack", "--pack-destination", packDir], {
      cwd: pkgDir,
      encoding: "utf8",
    });
    expect(packed.status, packed.stderr).toBe(0);
    const [tarball] = readdirSync(packDir).filter((f) => f.endsWith(".tgz"));
    expect(tarball, `npm pack produced no tarball in ${packDir}`).toBeDefined();

    const extracted = path.join(packDir, "extracted");
    mkdirSync(extracted);
    const untar = spawnSync("tar", ["-xzf", path.join(packDir, tarball ?? ""), "-C", extracted], {
      encoding: "utf8",
    });
    expect(untar.status, untar.stderr).toBe(0);

    const name = "proof-sor";
    const fromTarball = workDir();
    const fromCheckout = workDir();
    const packedRun = spawnSync(
      process.execPath,
      [path.join(extracted, "package", "dist", "cli.mjs"), "init", name],
      { cwd: fromTarball, encoding: "utf8" },
    );
    expect(packedRun.status, packedRun.stderr).toBe(0);
    const checkoutRun = spawnSync(process.execPath, [distCli, "init", name], {
      cwd: fromCheckout,
      encoding: "utf8",
    });
    expect(checkoutRun.status, checkoutRun.stderr).toBe(0);

    const packedProject = path.join(fromTarball, name);
    const checkoutProject = path.join(fromCheckout, name);
    const packedFiles = treeFiles(packedProject);
    expect(packedFiles).toEqual(treeFiles(checkoutProject));
    expect(packedFiles, "the published scaffold has no .gitignore").toContain(".gitignore");
    for (const rel of packedFiles) {
      const fromPack = readFileSync(path.join(packedProject, rel));
      const fromRepo = readFileSync(path.join(checkoutProject, rel));
      expect(fromPack.equals(fromRepo), `published bytes differ from the checkout in ${rel}`).toBe(
        true,
      );
    }
  });
});
