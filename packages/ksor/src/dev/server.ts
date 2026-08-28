/**
 * `ksor dev` server: spawn `next dev` for `system/site`, watch `knowledge/` and
 * re-run governance on every save, and start the MCP proxy when `ksor serve` is
 * up. One command, live site, live rules, one URL for humans and agents.
 */
import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import path from "node:path";

import { exitCodes } from "../index.js";
import { govern, type GovernResult } from "./govern.js";
import { startMcpProxy } from "./proxy.js";

export interface DevOptions {
  readonly version: string;
  readonly instance: string | null;
  readonly sitePort: number;
  readonly servePort: number;
  readonly noMcp: boolean;
}

export interface DevIo {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

const WATCH_DIRS = ["knowledge", ".ksor", "instance.md"];

/**
 * Run the dev server. Resolves with an exit code when the process is told to
 * stop (SIGINT/SIGTERM) or a startup precondition fails. Never calls
 * process.exit — the CLI owns the exit.
 */
export function runDevServer(cwd: string, options: DevOptions, io: DevIo): Promise<number> {
  return new Promise((resolve) => {
    // ── precondition 1: record root ────────────────────────────────────────
    const root = options.instance ? path.resolve(cwd, options.instance) : nearestInstanceDir(cwd);
    if (root === null) {
      io.err(
        "error: ksor-instance-missing\nno instance.md at or above the cwd — the record root is the directory holding it\n  fix: run from inside the record, or pass --instance <path>\n",
      );
      resolve(exitCodes.refused);
      return;
    }

    // ── precondition 2: system/site exists ────────────────────────────────
    const siteDir = path.join(root, "system", "site");
    if (!existsSync(siteDir)) {
      io.err(
        "error: ksor-dev-no-site\nthis record has no system/site — `ksor dev` serves the bundled Next.js app\n  fix: run `ksor init` to scaffold a record, or `pnpm ksor:sync` to restore system/\n",
      );
      resolve(exitCodes.environment);
      return;
    }

    // ── precondition 3: next binary present in the site ─────────────────────
    const nextBin = path.join(siteDir, "node_modules", ".bin", "next");
    if (!existsSync(nextBin)) {
      io.err(
        "error: ksor-dev-no-next\nnext is not installed in system/site — run `pnpm install` in the record first\n  fix: cd system/site && pnpm install\n",
      );
      resolve(exitCodes.environment);
      return;
    }

    // ── start next dev ──────────────────────────────────────────────────────
    io.out(`ksor dev: starting site at http://localhost:${options.sitePort} (root ${root})\n`);
    const child = spawn(nextBin, ["dev", "-p", String(options.sitePort)], {
      cwd: siteDir,
      env: { ...process.env, KSOR_ROOT: root },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (d) => io.out(d.toString()));
    child.stderr?.on("data", (d) => io.err(d.toString()));

    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
      resolve(code);
    };

    child.on("error", (err) => {
      io.err(`error: ksor-dev-spawn\nnext dev failed to start: ${err.message}\n`);
      finish(exitCodes.environment);
    });
    child.on("exit", (code) => {
      if (!settled) {
        // next exited before we were told to stop — surface it as environment.
        io.err(`error: ksor-dev-exited\nnext dev exited early (code ${code ?? "signal"})\n`);
        finish(exitCodes.environment);
      }
    });

    // ── governance watch ────────────────────────────────────────────────────
    const runGovern = () => {
      const result: GovernResult = govern(root);
      if (result.refusals.length > 0) io.err(`${result.line}\n`);
      else io.out(`${result.line}\n`);
    };
    runGovern(); // initial check on startup
    const debounce = debounceMs(80, runGovern);
    const watchers = WATCH_DIRS.map((rel) => {
      const abs = path.join(root, rel);
      if (!existsSync(abs)) return null;
      try {
        return watch(abs, { recursive: true }, () => debounce());
      } catch {
        // recursive watch unsupported on this platform: fall back to non-recursive
        try {
          return watch(abs, () => debounce());
        } catch {
          return null;
        }
      }
    }).filter((w): w is ReturnType<typeof watch> => w !== null);

    // ── MCP proxy (best-effort) ─────────────────────────────────────────────
    startMcpProxy({
      servePort: options.servePort,
      disabled: options.noMcp,
    }).then((proxy) => {
      if (proxy.enabled) {
        io.out(
          `ksor dev: MCP proxy enabled on port ${proxy.port} → ksor serve :${options.servePort}\n`,
        );
      } else if (!options.noMcp) {
        io.out(
          `ksor dev: no ksor serve detected on :${options.servePort} — MCP proxy skipped (site still served)\n`,
        );
      }
    });

    // ── shutdown ────────────────────────────────────────────────────────────
    const onSignal = () => {
      io.out("ksor dev: shutting down\n");
      for (const w of watchers) w.close();
      finish(0);
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });
}

function nearestInstanceDir(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, "instance.md"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function debounceMs(ms: number, fn: () => void): () => void {
  let timer: NodeJS.Timeout | null = null;
  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}
