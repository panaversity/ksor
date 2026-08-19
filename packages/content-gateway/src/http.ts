/**
 * The MCP door: the SDK's Web-standard transport (Request → Response,
 * STATELESS JSON — our standard is Streamable HTTP with JSON responses, not
 * SSE) behind Hono. The MCP surface is the product, so the door composes the
 * SDK's own HTTP shape instead of hand-rolling routing and body parsing —
 * the layer three findings landed in.
 *
 * Contracts the hand-rolled door had earned and this one keeps (a framework
 * doesn't know them, so they are restored explicitly — review, 2026-08-19):
 * fail-soft env parsing (envInt, never `Number(env ?? default)`); the bind
 * is AWAITED so EADDRINUSE/EACCES reach the CLI exit contract, not a stack
 * trace; the boot line prints AFTER binding; SIGTERM drains the pool only
 * AFTER the listener closes; the exact HSTS contract (max-age 63072000).
 *
 * What stays ours because it is good: buildAuth and the fail-closed boot
 * posture, the three probes, the concurrency cap, the content kernel.
 */

import { serve, type ServerType } from "@hono/node-server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  buildAuth,
  envInt,
  resolveBind,
  runWithIdentity,
  transportSecurityFromEnv,
  TokenVerifyError,
  type Auth,
} from "@panaversity/ksor-gateway-kit";
import { runProbe } from "@panaversity/ksor-content";

import { buildServer } from "./server.js";
import type { Composition } from "./compose.js";

/** The loopback Host allowlist — every loopback SPELLING (127.0.0.1 alone was
 * not enough: `localhost` escaped a literal check). An explicit
 * KSOR_ALLOWED_HOSTS wins; a public bind is bearer-gated, not Host-gated. A
 * real HTTP client always sends a Host header, so a blank one is not
 * allowlisted. */
export function allowedHosts(bind: { host: string; port: number }): Set<string> | null {
  const explicit = transportSecurityFromEnv(process.env)?.allowedHosts;
  if (explicit !== undefined && explicit.length > 0) return new Set(explicit);
  const loopback = bind.host === "127.0.0.1" || bind.host === "localhost" || bind.host === "::1";
  if (!loopback) return null;
  return new Set([`127.0.0.1:${bind.port}`, `localhost:${bind.port}`, `[::1]:${bind.port}`]);
}

export async function runHttp(composition: Composition): Promise<ServerType> {
  const auth: Auth = buildAuth(process.env);
  const bind = resolveBind(process.env);
  const hosts = allowedHosts(bind);
  const { ctx, instance, pool, spaceSkipReason, version } = composition;

  // Fail-soft env (envInt), never Number(env ?? default): a set-but-empty
  // var (routine with `gcloud --set-env-vars`) or a typo must fall back, not
  // silently become 0 — MAX_INFLIGHT 0 is a permanent 503, a 0 body cap a
  // permanent 413 (review, 2026-08-19).
  const maxBodyBytes = envInt(process.env, "KSOR_MAX_BODY_BYTES", 1_000_000, { minimum: 1024 });
  const maxInflight = envInt(process.env, "KSOR_MAX_INFLIGHT", 64, { minimum: 1 });
  let inflight = 0;

  const app = new Hono();

  // The exact hardening contract, not a framework default: HSTS
  // max-age=63072000; includeSubDomains and nosniff, nothing else (the
  // measured contract carried from the predecessor — review, 2026-08-19).
  app.use("*", async (c, next) => {
    await next();
    c.res.headers.set("strict-transport-security", "max-age=63072000; includeSubDomains");
    c.res.headers.set("x-content-type-options", "nosniff");
  });

  // Host validation as middleware — the shape the SDK points to (its
  // transport-level rebinding option is deprecated). DNS rebinding reaches
  // localhost, so the loopback door validates Host; a public door does not
  // (bearer-gated) unless KSOR_ALLOWED_HOSTS is set.
  app.use("*", async (c, next) => {
    if (hosts !== null && !hosts.has(c.req.header("host") ?? "")) {
      return c.json({ error: "host not allowed" }, 421);
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

  // Stateless JSON: a fresh server + transport per POST. The response is
  // BUFFERED (enableJsonResponse) and fully read before the transport is
  // closed, so nothing races the close (SSE would — which is exactly why we
  // do not serve it: review, 2026-08-19).
  const handleMcp = async (request: Request): Promise<Response> => {
    const server = buildServer(ctx, version);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(request);
      const body = await response.arrayBuffer();
      return new Response(body, { status: response.status, headers: response.headers });
    } finally {
      void transport.close().catch(() => undefined);
      void server.close().catch(() => undefined);
    }
  };

  const mcp = bodyLimit({
    maxSize: maxBodyBytes,
    onError: (c) => c.json({ error: "request body too large" }, 413),
  });

  app.post("/mcp", mcp, async (c) => {
    if (inflight >= maxInflight) {
      return c.json({ error: "server busy — retry shortly" }, 503, { "retry-after": "1" });
    }
    inflight += 1;
    try {
      if (auth.mode === "public") {
        const token = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
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
  });

  // We serve Streamable HTTP with JSON responses — no standalone SSE stream
  // (stateless has no server-initiated messages to push), so GET/DELETE on
  // /mcp are not offered.
  app.on(["GET", "DELETE"], "/mcp", (c) =>
    c.json({ error: "method not allowed — POST JSON-RPC to /mcp (stateless JSON transport)" }, 405),
  );

  // AWAIT the bind: EADDRINUSE / EACCES / an unroutable host must reach the
  // CLI exit contract in main(), not escape as an uncaught 'error' event and
  // a stack trace (review, 2026-08-19). The boot line prints AFTER binding.
  const server = await new Promise<ServerType>((resolve, reject) => {
    const s = serve({ fetch: app.fetch, hostname: bind.host, port: bind.port }, () => resolve(s));
    s.once("error", reject);
  });
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

  // Drain: close the listener FIRST, then the pool in its callback — the pool
  // must not be torn down under in-flight work (review, 2026-08-19).
  const shutdown = (): void => {
    server.close(() => {
      void pool.end().catch(() => undefined);
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  return server;
}
