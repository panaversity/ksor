/**
 * `ksor dev` (dev spec §1): start the local knowledge site with hot reload and
 * live governance checks, proxying the MCP surface to a running `ksor serve`
 * when one is reachable. One command for humans and agents in development.
 */
import { exitCodes } from "../index.js";
import { runDevServer, type DevIo, type DevOptions } from "./server.js";

export const DEV_USAGE = `Usage: ksor dev [--instance <path>] [--site-port <n>] [--serve-port <n>] [--no-mcp]

Runs the local knowledge site (next dev over system/site) with live governance:
every save re-runs the record checker and prints refusals, without writing a
build.lock.json. When a ksor serve is already running, /mcp is proxied to it so
the dev server is the one URL for humans and agents alike.

  --instance <path>   instance.md, or a directory at or below the record root
                      (default: the nearest ancestor instance.md of the cwd)
  --site-port <n>     port the site dev server listens on (default: 3000)
  --serve-port <n>    port a running ksor serve is expected on (default: 3001)
  --no-mcp            do not probe or proxy an MCP server
`;

interface Parsed {
  readonly instance: string | null;
  readonly sitePort: number;
  readonly servePort: number;
  readonly noMcp: boolean;
}

function parseArgs(args: readonly string[]): Parsed | string {
  let instance: string | null = null;
  let sitePort = 3000;
  let servePort = 3001;
  let noMcp = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--instance") {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("-")) return "--instance needs a value";
      i += 1;
      instance = value;
    } else if (arg === "--site-port") {
      const value = args[i + 1];
      if (value === undefined) return "--site-port needs a value";
      const n = Number(value);
      if (!Number.isInteger(n) || n <= 0)
        return `--site-port must be a positive integer, got "${value}"`;
      i += 1;
      sitePort = n;
    } else if (arg === "--serve-port") {
      const value = args[i + 1];
      if (value === undefined) return "--serve-port needs a value";
      const n = Number(value);
      if (!Number.isInteger(n) || n <= 0)
        return `--serve-port must be a positive integer, got "${value}"`;
      i += 1;
      servePort = n;
    } else if (arg === "--no-mcp") noMcp = true;
    else return `unknown argument "${arg}"`;
  }
  if (process.env["KSOR_DEV_NO_MCP"] === "1") noMcp = true;
  return { instance, sitePort, servePort, noMcp };
}

export function runDev(
  args: readonly string[],
  cwd: string,
  io: DevIo,
  options: { readonly version: string },
): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    io.out(DEV_USAGE);
    return Promise.resolve(0);
  }
  const parsed = parseArgs(args);
  if (typeof parsed === "string") {
    io.err(`error: bad-args\n${parsed}\n${DEV_USAGE}`);
    return Promise.resolve(exitCodes.refused);
  }
  const devOptions: DevOptions = {
    version: options.version,
    instance: parsed.instance,
    sitePort: parsed.sitePort,
    servePort: parsed.servePort,
    noMcp: parsed.noMcp,
  };
  return runDevServer(cwd, devOptions, io);
}
