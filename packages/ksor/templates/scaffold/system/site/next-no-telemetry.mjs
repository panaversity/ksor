/**
 * Run Next.js with its telemetry OFF, so nothing phones home.
 *
 * Next.js ships with anonymous usage telemetry switched on: `next build` and
 * `next dev` each post to telemetry.nextjs.org unless NEXT_TELEMETRY_DISABLED
 * is set in the process environment. This project promises that nothing
 * phones home, so `build` and `dev` run next through here instead of directly.
 *
 * Why the environment and not next.config.mjs: the `next dev` parent process
 * never loads the config, and still records a session event on exit. Why a
 * file and not a `NEXT_TELEMETRY_DISABLED=1 next …` prefix in package.json:
 * that prefix is POSIX shell syntax, which cmd.exe refuses on Windows. This
 * is node:child_process and nothing else — no dependency, works everywhere
 * node does — and every argument passes through to next unchanged.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const next = fileURLToPath(new URL("dist/bin/next", import.meta.resolve("next/package.json")));

const child = spawnSync(process.execPath, [next, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});

if (child.error) throw child.error;
process.exit(child.status ?? 1);
