import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
 * real built code instead of whatever happens to be published.
 *
 * Returns the tarball path so the caller can prove the install resolved it
 * (see `expectLocalKsorResolved`) — without that check a silently-unapplied
 * override falls back to the published version and the suite greens against
 * code this branch never built.
 */
export function injectLocalKsor(projectDir: string): string {
  // A `pnpm pack` with no prior build produces a dist-less tarball and status
  // 0; the failure would surface later as a confusing module error. Say so here.
  const builtCli = path.join(ksorPkgDir, "dist", "cli.mjs");
  if (!existsSync(builtCli)) {
    throw new Error(`${builtCli} is missing — run \`pnpm build\` before the e2e suites`);
  }
  const packDir = mkdtempSync(path.join(tmpdir(), "ksor-pack-"));
  const packed = spawnSync("pnpm", ["--dir", ksorPkgDir, "pack", "--pack-destination", packDir], {
    encoding: "utf8",
  });
  if (packed.status !== 0) {
    rmSync(packDir, { recursive: true, force: true });
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
  return tarball;
}

/**
 * Prove the install resolved the LOCAL tarball rather than the registry. The
 * pinned version is a real published version, so a silently-ignored override
 * would install pre-fold-in code and still green a site-only e2e (review
 * finding, 2026-08-20). The lockfile records the resolution, so it is the
 * evidence.
 */
export function expectLocalKsorResolved(projectDir: string, tarball: string): void {
  const lock = path.join(projectDir, "pnpm-lock.yaml");
  const text = existsSync(lock) ? readFileSync(lock, "utf8") : "";
  // Match the tarball by NAME. A bare `file:` test passed on any unrelated
  // file: entry in the lockfile, which is exactly the silent fallback this
  // check exists to catch (review, 2026-08-20).
  if (!text.includes(path.basename(tarball))) {
    throw new Error(
      `@panaversity/ksor did not resolve to the local tarball (${path.basename(tarball)}) — ` +
        `the pnpm-workspace override was ignored, so this suite would test the PUBLISHED package`,
    );
  }
}

/** Remove a tarball staging directory created by `injectLocalKsor`. */
export function cleanupLocalKsor(tarball: string): void {
  rmSync(path.dirname(tarball), { recursive: true, force: true });
}
