import { spawnSync, type SpawnSyncReturns } from "node:child_process";

/**
 * `pnpm build` for a scaffolded site, with ONE retry on a known upstream
 * Turbopack flake and nothing else.
 *
 * Turbopack's static-image metadata pipeline intermittently fails a production
 * build with `TurbopackInternalError: Input image not found` — the scaffold's
 * home page imports `app/icon.png` as its mark, and that `StructuredImageFileSource`
 * read is nondeterministic under the conformance suites' repeated builds (the
 * same scaffold builds clean on a retry; observed 2026-08-19). The retry fires
 * ONLY on that exact signature, so a real build break still fails on the first
 * try. The DURABLE fix is scaffold-side (drop the static image import) and is
 * an owner call — this keeps the browser CI job reliable meanwhile.
 */
const TURBOPACK_IMAGE_FLAKE = /TurbopackInternalError|Input image not found/;

export function buildScaffold(cwd: string, env?: Record<string, string>): SpawnSyncReturns<string> {
  const once = (): SpawnSyncReturns<string> =>
    spawnSync("pnpm", ["build"], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  const first = once();
  if (first.status === 0) return first;
  const output = `${first.stdout ?? ""}\n${first.stderr ?? ""}`;
  return TURBOPACK_IMAGE_FLAKE.test(output) ? once() : first;
}
