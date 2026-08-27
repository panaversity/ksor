import { spawnSync, type SpawnSyncReturns } from "node:child_process";

/**
 * `pnpm build` for a scaffolded site. One spawn, no retry.
 *
 * This carried a retry on `TurbopackInternalError: Input image not found` —
 * Turbopack's static-image metadata pipeline intermittently failing to read
 * the scaffold's `app/icon.png` mark under the conformance suites' repeated
 * builds (observed 2026-08-19) — and the comment beside it said the durable
 * fix was scaffold-side and an owner call. It is now taken: the emitted site
 * builds with `next build --webpack` (issue #196), so that pipeline is not on
 * this path at all and the retry could never fire again.
 *
 * The retry goes with it rather than staying as a harmless leftover, because
 * a retry is only harmless while it is the thing that fires. If Turbopack ever
 * returns to the production build, this suite going red on the first attempt is
 * what says so; a shim retrying quietly is what stopped it saying so before.
 */
export function buildScaffold(cwd: string, env?: Record<string, string>): SpawnSyncReturns<string> {
  return spawnSync("pnpm", ["build"], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
}
