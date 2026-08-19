// `ksor serve` — SPAWN the installed kernel gateway (the MCP server), never
// import it. The CLI keeps its zero-runtime-deps guarantee (decision 1/13): the
// heavy kernel (the MCP SDK + pg + the embedding SDK, ~60 MB) lives in its own
// package the scaffold's serve rung installs, and `serve` resolves that
// package's bin from the project and runs it as a subprocess, forwarding the
// verb's arguments, environment, and stdio, and returning its exit code.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { exitCodes } from "../index.js";

/** The one bundled kernel package (decision 12) and the serve bin it exposes. */
export const GATEWAY_PACKAGE = "@panaversity/ksor-content-gateway";
const GATEWAY_BIN = "ksor-content-gateway";

export interface ServeIo {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

/**
 * The absolute path to the installed gateway's serve bin, resolved from the
 * project at `cwd` (its node_modules), or null when the kernel is not
 * installed. Resolution only — no import, so the CLI stays zero-dep.
 */
export function resolveGatewayBin(cwd: string): string | null {
  try {
    const require = createRequire(pathToFileURL(path.join(cwd, "package.json")).href);
    const manifestPath = require.resolve(`${GATEWAY_PACKAGE}/package.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const rel =
      typeof manifest.bin === "string" ? manifest.bin : (manifest.bin?.[GATEWAY_BIN] ?? null);
    return rel === null ? null : path.resolve(path.dirname(manifestPath), rel);
  } catch {
    return null;
  }
}

/**
 * Run `ksor serve`: resolve the gateway bin and spawn it in the foreground.
 * Returns the gateway's exit code, or exit 3 (environment) when the kernel is
 * not installed — with a remedy — or when the spawn itself fails.
 */
export function runServe(args: readonly string[], cwd: string, io: ServeIo): number {
  const bin = resolveGatewayBin(cwd);
  if (bin === null) {
    io.err(
      "error: serve-not-installed\n" +
        "the MCP server is not installed in this project. `ksor serve` runs the kernel\n" +
        `gateway (${GATEWAY_PACKAGE}); add it so the served rung is present:\n` +
        `  pnpm add ${GATEWAY_PACKAGE}\n` +
        "then run `ksor serve` again from the project root (it reads ./instance.md).\n",
    );
    return exitCodes.environment;
  }
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error !== undefined) {
    io.err(`error: serve-spawn-failed\n${result.error.message}\n`);
    return exitCodes.environment;
  }
  // The gateway owns its own exit contract (1 refused, 3 environment); forward
  // it. A signal (Ctrl-C draining the server) is a normal stop, not a failure.
  return result.status ?? (result.signal !== null ? 0 : exitCodes.environment);
}
