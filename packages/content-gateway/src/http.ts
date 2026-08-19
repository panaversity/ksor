/**
 * The MCP door: the SDK's Web-standard transport (Request → Response,
 * stateless) behind Hono. The MCP surface is the product, so the door
 * composes the SDK's own HTTP shape instead of hand-rolling routing, body
 * parsing, and security middleware — the hand-rolled layer is where three
 * review findings landed (chunked-body replay, unbounded GET body, the
 * origins-only rebind hole), all of which this shape simply does not have
 * (decision 13).
 *
 * What stays ours because it is good: buildAuth and the fail-closed boot
 * posture, the three probes, the concurrency cap, and the content kernel.
 *
 * Posture from the bind: unset PORT → loopback (dev door, Host-validated,
 * safe with auth off); a public bind is deliberate and fails closed unless
 * auth is configured or KSOR_AUTH_DISABLED=1 is set.
 */

import { serve, type ServerType } from "@hono/node-server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import {
  buildAuth,
  resolveBind,
  runWithIdentity,
  transportSecurityFromEnv,
  TokenVerifyError,
  type Auth,
} from "@panaversity/ksor-gateway-kit";
import { runProbe } from "@panaversity/ksor-content";

import { buildServer } from "./server.js";
import type { Composition } from "./compose.js";

const MAX_BODY_BYTES: number = Number(process.env["KSOR_MAX_BODY_BYTES"] ?? String(1_000_000));

/** Shed at the door: a bounded number of concurrent /mcp requests, so
 * backpressure is a fast honest 503 + Retry-After rather than an invisible
 * pool queue. Sized above the DB pool so the pool is the real limit. */
const MAX_INFLIGHT: number = Number(process.env["KSOR_MAX_INFLIGHT"] ?? "64");

/** The loopback Host allowlist — every loopback SPELLING (127.0.0.1 was not
 * enough: `localhost` escaped a literal check). An explicit
 * KSOR_ALLOWED_HOSTS wins; a public bind is bearer-gated, not Host-gated. */
export function allowedHosts(bind: { host: string; port: number }): Set<string> | null {
  const explicit = transportSecurityFromEnv(process.env)?.allowedHosts;
  if (explicit !== undefined && explicit.length > 0) return new Set(explicit);
  const loopback = bind.host === "127.0.0.1" || bind.host === "localhost" || bind.host === "::1";
  if (!loopback) return null;
  return new Set([
    `127.0.0.1:${bind.port}`,
    `localhost:${bind.port}`,
    `[::1]:${bind.port}`,
    // A missing/blank Host on a loopback stdio-style client is accepted.
    "",
  ]);
}

export async function runHttp(composition: Composition): Promise<ServerType> {
  const auth: Auth = buildAuth(process.env);
  const bind = resolveBind(process.env);
  const hosts = allowedHosts(bind);
  const { ctx, instance, pool, spaceSkipReason, version } = composition;
  let inflight = 0;

  const app = new Hono();

  // Security headers on every response (HSTS + nosniff via secureHeaders).
  app.use("*", secureHeaders());

  // Host validation as middleware — the shape the SDK points to (its
  // transport-level rebinding option is deprecated). DNS rebinding reaches
  // localhost, so the loopback door validates Host; a public door does not
  // (it is bearer-gated) unless KSOR_ALLOWED_HOSTS is set.
  app.use("*", async (c, next) => {
    if (hosts !== null) {
      const host = c.req.header("host") ?? "";
      if (!hosts.has(host)) return c.json({ error: "host not allowed" }, 421);
    }
    await next();
  });

  app.get("/live", (c) => c.json({ live: true }));

  app.get("/ready", async (c) => {
    try {
      await runProbe(pool, instance.tenantId, (client) =>
        client.query("SELECT 1 FROM corpora LIMIT 1"),
      );
      return c.json({ ready: true });
    } catch {
      return c.json({ ready: false, reason: "content store unreachable" }, 503);
    }
  });

  app.get("/health", (c) =>
    c.json({
      corpus_id: instance.corpusId,
      abstain_gate:
        instance.abstain.vectorFloor === null
          ? "OFF (no floor declared — will not refuse out-of-corpus questions)"
          : instance.abstain.vectorFloor === "uncalibrated"
            ? "REFUSING (declared but uncalibrated — run calibrate and paste the floor)"
            : `floor ${instance.abstain.vectorFloor}`,
      embedding_space:
        spaceSkipReason === null
          ? `${instance.embeddingModel}/d${instance.embeddingDim} ok`
          : `${instance.embeddingModel}/d${instance.embeddingDim} unverified (check skipped: ${spaceSkipReason})`,
      auth: auth.mode,
    }),
  );

  app.get("/.well-known/oauth-protected-resource/mcp", (c) =>
    auth.mode === "public"
      ? c.json({ resource: auth.config.resourceUrl, authorization_servers: [auth.config.ssoUrl] })
      : c.json({ error: "no public auth door configured" }, 404),
  );

  // The MCP endpoint: body cap, concurrency cap, auth, then the SDK
  // transport. Stateless — a fresh server + transport per request.
  const handleMcp = async (request: Request): Promise<Response> => {
    const server = buildServer(ctx, version);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      void transport.close().catch(() => undefined);
      void server.close().catch(() => undefined);
    }
  };

  app.all(
    "/mcp",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: "request body too large" }, 413),
    }),
    async (c) => {
      if (inflight >= MAX_INFLIGHT) {
        return c.json({ error: "server busy — retry shortly" }, 503, { "retry-after": "1" });
      }
      inflight += 1;
      try {
        if (auth.mode === "public") {
          const header = c.req.header("authorization") ?? "";
          const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
          if (token === undefined) {
            return c.json({ error: "bearer token required" }, 401, {
              "www-authenticate": `Bearer resource_metadata="${auth.config.resourceUrl}"`,
            });
          }
          let identity;
          try {
            identity = await auth.verify(token);
          } catch (error) {
            const transient = error instanceof TokenVerifyError && error.transient;
            return c.json(
              { error: transient ? "token verification temporarily unavailable" : "invalid token" },
              transient ? 503 : 401,
            );
          }
          return await runWithIdentity(identity, () => handleMcp(c.req.raw));
        }
        return await handleMcp(c.req.raw);
      } finally {
        inflight -= 1;
      }
    },
  );

  const server = serve({ fetch: app.fetch, hostname: bind.host, port: bind.port });
  console.error(
    `ksor gateway serving ${instance.corpusId} on http://${bind.host}:${bind.port}/mcp ` +
      `(auth: ${auth.mode}, abstain gate: ${
        instance.abstain.vectorFloor === null
          ? "OFF (no floor)"
          : instance.abstain.vectorFloor === "uncalibrated"
            ? "REFUSING (uncalibrated)"
            : `floor ${instance.abstain.vectorFloor}`
      })`,
  );

  // Drain on SIGTERM/SIGINT — a container stop must close the listener and
  // the pool, not abandon in-flight work.
  const shutdown = (): void => {
    server.close();
    void pool.end().catch(() => undefined);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  return server;
}
