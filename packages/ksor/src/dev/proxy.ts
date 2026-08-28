/**
 * `ksor dev` MCP proxy: when a `ksor serve` is already running, forward `/mcp`
 * to it so the dev server is the ONE url humans and agents both use. The proxy
 * is best-effort: if serve is not reachable, dev still serves the site and
 * prints a line; nothing fails.
 */
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import { createConnection } from "node:net";
import type { AddressInfo } from "node:net";

export interface ProxyOptions {
  /** The port `ksor serve` is expected on (default 3001, or KSOR_MCP_PORT). */
  readonly servePort: number;
  /** Disable the probe + proxy entirely (KSOR_DEV_NO_MCP=1). */
  readonly disabled: boolean;
}

/**
 * Probe whether a `ksor serve` is listening on `servePort`. A TCP connect that
 * succeeds and closes cleanly counts as reachable; anything else (refused,
 * timeout) counts as absent. We do not speak HTTP here — serve may not be up
 * yet, and a refused connect must not throw into the dev startup path.
 */
export function probeServe(port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      try {
        socket.destroy();
      } catch {
        /* already gone */
      }
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      done(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      done(false);
    });
  });
}

/**
 * Start the MCP proxy. It listens on an ephemeral loopback port; the dev site
 * is the public face, this is the agent's fallback `/mcp`. When serve is not
 * reachable, returns `{ enabled: false }` and the dev command simply omits MCP.
 */
export function startMcpProxy(options: ProxyOptions): Promise<{ port: number; enabled: boolean }> {
  if (options.disabled) return Promise.resolve({ port: 0, enabled: false });
  return probeServe(options.servePort).then((reachable) => {
    if (!reachable) return { port: 0, enabled: false };
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (!req.url?.startsWith("/mcp")) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      const outbound = request(
        {
          host: "127.0.0.1",
          port: options.servePort,
          method: req.method,
          path: req.url,
          headers: req.headers,
        },
        (proxyRes: IncomingMessage) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      outbound.on("error", () => {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end("bad gateway");
      });
      req.pipe(outbound);
    });
    return new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        resolve({ port: addr.port, enabled: true });
      });
    });
  });
}
