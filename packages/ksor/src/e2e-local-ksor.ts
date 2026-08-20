import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ksorPkgDir = fileURLToPath(new URL("..", import.meta.url));

/**
 * Redirect a scaffolded project's `@panaversity/ksor` self-dependency to the
 * LOCALLY BUILT package (via a packed tarball) so `pnpm install` resolves THIS
 * code, not the npm registry. The scaffold pins the exact running CLI version
 * (`KSOR-STAMP-VERSION`), which is NOT published during the release Version PR
 * or any local dev build — a registry install would fail
 * `ERR_PNPM_NO_MATCHING_VERSION`. This also makes the e2e suites exercise the
 * real built code instead of whatever happens to be published. Requires the
 * package to be built first (`pnpm build`); call before `pnpm install`.
 */
export function injectLocalKsor(projectDir: string): void {
  const packDir = mkdtempSync(path.join(tmpdir(), "ksor-pack-"));
  const packed = spawnSync("pnpm", ["--dir", ksorPkgDir, "pack", "--pack-destination", packDir], {
    encoding: "utf8",
  });
  if (packed.status !== 0) {
    throw new Error(`pnpm pack failed: ${packed.stderr || packed.stdout}`);
  }
  const tgz = readdirSync(packDir).find((file) => file.endsWith(".tgz"));
  if (tgz === undefined) throw new Error(`no tarball produced in ${packDir}`);
  const tarball = path.join(packDir, tgz);
  // pnpm 11 reads `overrides` from pnpm-workspace.yaml; a `file:` override
  // bypasses version matching, so the unpublished pinned version is irrelevant.
  const workspacePath = path.join(projectDir, "pnpm-workspace.yaml");
  const workspace = readFileSync(workspacePath, "utf8");
  writeFileSync(
    workspacePath,
    `${workspace}\noverrides:\n  "@panaversity/ksor": "file:${tarball}"\n`,
  );
}
