import { spawnSync, type SpawnSyncReturns } from "node:child_process";

/**
 * `pnpm build` for a scaffolded site. One spawn, no retry.
 *
 * No retry deliberately: this carried one for a Turbopack static-image flake
 * until the emitted site moved to `next build --webpack` (issue #196), which
 * takes that pipeline off the production path entirely. A shim that survives
 * the failure it was written for is what stops a suite reporting a real
 * regression, so it went with it rather than staying as a leftover.
 */
export function buildScaffold(cwd: string, env?: Record<string, string>): SpawnSyncReturns<string> {
  return spawnSync("pnpm", ["build"], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
}
