// The serve glue every KSoR gateway uses, converted from the predecessor's
// serve.py (decision 6): bind resolution (the loopback auto-gate — serving
// fails safe, decision 7), required-env refusal, and a small node:http runner
// with graceful teardown. The Sentry/Redis/uvicorn machinery around the
// Python original belongs to its deployment and was not carried.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { defaultWarn, type Env, type WarnLog } from "./env.js";
import type { HttpHandler } from "./harden.js";

export type Bind = { host: string; port: number };

/**
 * A required env var is missing — thrown with the operator message. Like
 * AuthConfigError, the gateway maps this distinct type to a clean stderr line
 * + exit 2; it must never half-boot past it.
 */
export class RequiredEnvError extends Error {
  override readonly name: string = "RequiredEnvError";
}

export function requireEnv(env: Env, name: string): string {
  const value = (env[name] ?? "").trim();
  if (value === "") throw new RequiredEnvError(`${name} is required`);
  return value;
}

/**
 * Host: KSOR_MCP_HOST, else 0.0.0.0 only when $PORT is set, else loopback.
 * Port: KSOR_MCP_PORT, else $PORT, else 8080.
 *
 * Bind ALL interfaces only in a container ($PORT is the platform's contract —
 * Cloud Run and friends set it and route traffic there, possibly non-8080, so
 * honoring it explicitly keeps a non-default containerPort from blackholing
 * the service). A local/dev run binds loopback so an auth-off dev run cannot
 * expose the server on the LAN: a PUBLIC bind must be a DELIBERATE act —
 * KSOR_MCP_HOST set by the operator, or the container platform's $PORT
 * (predecessor review: bind-all-interfaces-dev, where a recomposition
 * regressed this to unconditional 0.0.0.0).
 */
export function resolveBind(env: Env = process.env): Bind {
  const host = env.KSOR_MCP_HOST || (env.PORT ? "0.0.0.0" : "127.0.0.1");
  const source = env.KSOR_MCP_PORT ? "KSOR_MCP_PORT" : "PORT";
  const raw = (env.KSOR_MCP_PORT || env.PORT || "8080").trim();
  if (!/^\d+$/.test(raw) || Number(raw) > 65535) {
    throw new Error(
      `${source}=${JSON.stringify(raw)} is not a valid port — set an integer 0..65535 ` +
        "(the container platform's contract is $PORT; KSOR_MCP_PORT overrides for local/dev)",
    );
  }
  return { host, port: Number(raw) };
}

export type RunServerOptions = {
  /**
   * Best-effort teardowns (pools, stores) run after the listener closes — the
   * predecessor's issue #310: a SIGTERM that skips teardown abandons every
   * pooled connection exactly during deploy churn. A failing teardown warns;
   * it never turns a clean shutdown into a crash loop.
   */
  onShutdown?: () => void | Promise<void>;
  /** Install SIGTERM/SIGINT handlers that run `close()`. Default false. */
  signals?: boolean;
  /** Grace window before in-flight connections are force-closed. Default 10s. */
  forceCloseAfterMs?: number;
  warn?: WarnLog;
};

export type RunningServer = {
  server: Server;
  host: string;
  /** The actual bound port (resolves a `port: 0` bind). */
  port: number;
  /** Idempotent graceful close: stop accepting, drain, then teardown. */
  close: () => Promise<void>;
};

/** Bind a node:http server for `handler` and resolve once it is listening. */
export async function runServer(
  handler: HttpHandler,
  bind: Bind,
  options: RunServerOptions = {},
): Promise<RunningServer> {
  const warn = options.warn ?? defaultWarn;
  const server = createServer((req: IncomingMessage, res: ServerResponse): void => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch((err: unknown) => {
        warn(
          `request handler failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`,
        );
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "text/plain" });
          res.end("internal error");
        } else {
          res.destroy();
        }
      });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(bind.port, bind.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : bind.port;

  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closing ??= (async (): Promise<void> => {
      await new Promise<void>((resolve) => {
        const force = setTimeout(
          () => server.closeAllConnections(),
          options.forceCloseAfterMs ?? 10_000,
        );
        force.unref();
        server.close(() => {
          clearTimeout(force);
          resolve();
        });
        server.closeIdleConnections();
      });
      if (options.onShutdown !== undefined) {
        try {
          await options.onShutdown();
        } catch (err) {
          // Shutdown is best-effort by design.
          warn(`shutdown teardown failed (${err instanceof Error ? err.name : String(err)})`);
        }
      }
    })();
    return closing;
  };

  if (options.signals === true) {
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      process.once(signal, () => {
        void close();
      });
    }
  }

  return { server, host: bind.host, port, close };
}
