import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Assert on shipped bytes, not configuration: `files` in package.json can be
// edited (or a build can silently stop emitting an entry point) while publint
// and every other gate stay green. This packs the real tarball manifest and
// asserts the contract of what reaches npm.
const pkgDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

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
  "templates/scaffold/system/site/package.json",
  "templates/scaffold/.agents/skills/format-checker/check.mjs",
  "templates/scaffold/.claude/skills/format-checker/check.mjs",
  "templates/scaffold/.github/workflows/validate.yml",
];

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
});
