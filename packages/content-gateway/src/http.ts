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
  AuthConfigError,
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

export interface Security {
  /** Allowed Host header values; null = do not Host-gate (public, bearer-gated). */
  readonly hosts: Set<string> | null;
  /** Allowed Origin header values; null = do not Origin-gate. */
  readonly origins: Set<string> | null;
}

/**
 * Both DNS-rebinding gates, resolved together — the Host allowlist AND the
 * Origin allowlist. transportSecurityFromEnv parses both from
 * KSOR_ALLOWED_HOSTS/ORIGINS; dropping either (or letting an origins-only
 * config fall through to the loopback Host branch, re-opening the Host hole)
 * is the bug this closes (review, 2026-08-19). Every loopback SPELLING arms
 * the Host default; a real HTTP client always sends Host, so a blank one is
 * never allowlisted.
 */
export function resolveSecurity(bind: { host: string; port: number }): Security {
  const explicit = transportSecurityFromEnv(process.env);
  const loopback = bind.host === "127.0.0.1" || bind.host === "localhost" || bind.host === "::1";
  const loopbackHosts = new Set([
    `127.0.0.1:${bind.port}`,
    `localhost:${bind.port}`,
    `[::1]:${bind.port}`,
  ]);
  // On a loopback bind, ORIGIN is gated by default — not only when
  // KSOR_ALLOWED_ORIGINS is set. This is the exact target of the MCP spec's
  // Origin-validation MUST (a local server, auth off), and the SDK's own gate
  // is NOT armed by this composition. A non-browser client (a coding agent)
  // sends no Origin and passes; a DNS-rebinding browser request carries a
  // cross-origin Origin and is refused (review 2026-08-19).
  const loopbackOrigins = new Set([
    `http://127.0.0.1:${bind.port}`,
    `http://localhost:${bind.port}`,
    `http://[::1]:${bind.port}`,
  ]);
  if (explicit === null) {
    return {
      hosts: loopback ? loopbackHosts : null,
      origins: loopback ? loopbackOrigins : null,
    };
  }
  // Explicit config: honor its Host set; honor its Origin set; and on a
  // loopback bind, if either was omitted, STILL gate it with the loopback
  // default (an empty allowlist would skip that gate entirely).
  const hosts =
    explicit.allowedHosts.length > 0
      ? new Set(explicit.allowedHosts)
      : loopback
        ? loopbackHosts
        : null;
  const origins =
    explicit.allowedOrigins.length > 0
      ? new Set(explicit.allowedOrigins)
      : loopback
        ? loopbackOrigins
        : null;
  return { hosts, origins };
}

export async function runHttp(composition: Composition): Promise<ServerType> {
  const auth: Auth = buildAuth(process.env);
  const bind = resolveBind(process.env);
  const loopback = bind.host === "127.0.0.1" || bind.host === "localhost" || bind.host === "::1";
  // #3: the flag a dev needs to run loopback (KSOR_AUTH_DISABLED) must not,
  // on its own, permit an UNAUTHENTICATED PUBLIC bind — decision 7's "a
  // public bind fails closed unless explicitly flagged". A public bind with
  // auth off needs a SECOND deliberate acknowledgement (review, 2026-08-19).
  if (
    auth.mode === "disabled" &&
    !loopback &&
    process.env["KSOR_ALLOW_PUBLIC_UNAUTHENTICATED"] !== "1"
  ) {
    throw new AuthConfigError(
      `refusing an UNAUTHENTICATED PUBLIC bind (${bind.host}) — KSOR_AUTH_DISABLED is the ` +
        "loopback-dev flag, not a licence to serve the corpus to the internet with no auth. " +
        "Configure the SSO door (KSOR_SSO_URL + KSOR_MCP_RESOURCE_URL + KSOR_JWT_ALLOWED_AUDIENCES), " +
        "bind loopback, or set KSOR_ALLOW_PUBLIC_UNAUTHENTICATED=1 to accept the risk deliberately.",
    );
  }
  const security = resolveSecurity(bind);
  const { ctx, instance, pool, spaceSkipReason, version } = composition;

  // Fail-soft env (envInt), never Number(env ?? default): a set-but-empty
  // var (routine with `gcloud --set-env-vars`) or a typo must fall back, not
  // silently become 0 — MAX_INFLIGHT 0 is a permanent 503, a 0 body cap a
  // permanent 413 (review, 2026-08-19).
  const maxBodyBytes = envInt(process.env, "KSOR_MAX_BODY_BYTES", 1_000_000, { minimum: 1024 });
  const maxInflight = envInt(process.env, "KSOR_MAX_INFLIGHT", 64, { minimum: 1 });
  let inflight = 0;

  // /ready is UNAUTHENTICATED and touches the DB — left uncapped it is a
  // pool-exhaustion amplifier: a flood checks out a connection per probe,
  // starving authenticated /mcp with PoolTimeout while the attacker spends no
  // credentials, and /mcp's inflight cap does not cover it (review,
  // 2026-08-19). Coalesce to at most ONE probe in flight with its verdict
  // cached ~1s: a load balancer still gets a fresh-enough answer, and a flood
  // shares the single in-flight probe instead of multiplying pool checkouts.
  const READY_TTL_MS = 1000;
  let readyProbe: { at: number; verdict: Promise<boolean> } | null = null;
  const readiness = (): Promise<boolean> => {
    const now = Date.now();
    if (readyProbe !== null && now - readyProbe.at < READY_TTL_MS) return readyProbe.verdict;
    const verdict = runProbe(pool, instance.tenantId, (client) =>
      client.query("SELECT 1 FROM corpora LIMIT 1"),
    ).then(
      () => true,
      () => false,
    );
    readyProbe = { at: now, verdict };
    return verdict;
  };

  const app = new Hono();

  // The exact hardening contract, not a framework default: HSTS
  // max-age=63072000; includeSubDomains and nosniff, nothing else (the
  // measured contract carried from the predecessor — review, 2026-08-19).
  app.use("*", async (c, next) => {
    await next();
    c.res.headers.set("strict-transport-security", "max-age=63072000; includeSubDomains");
    c.res.headers.set("x-content-type-options", "nosniff");
  });

  // DNS-rebinding validation as middleware — Host AND Origin (the shape the
  // SDK points to; its transport-level option is deprecated).
  app.use("*", async (c, next) => {
    if (security.hosts !== null && !security.hosts.has(c.req.header("host") ?? "")) {
      return c.json({ error: "host not allowed" }, 421);
    }
    if (security.origins !== null) {
      const origin = c.req.header("origin");
      // A same-origin/non-browser request carries no Origin; a cross-origin
      // request carries one and must be on the allowlist.
      if (origin !== undefined && !security.origins.has(origin)) {
        return c.json({ error: "origin not allowed" }, 403);
      }
    }
    await next();
  });

  app.get("/live", (c) => c.json({ live: true }));

  app.get("/ready", async (c) =>
    (await readiness())
      ? c.json({ ready: true })
      : c.json({ ready: false, reason: "content store unreachable" }, 503),
  );

  // /health discloses corpus internals AND the calibrated floor VALUE — the
  // measured gate constant an attacker would tune probes against. On a PUBLIC
  // bind it therefore requires the bearer, same as /mcp; /live (below) stays
  // open for the load balancer (review 2026-08-19).
  app.get("/health", async (c) => {
    if (auth.mode === "public") {
      const token = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
      if (token === undefined) {
        return c.json({ error: "bearer token required" }, 401, {
          "www-authenticate": `Bearer resource_metadata="${auth.config.resourceUrl}"`,
        });
      }
      try {
        await auth.verify(token);
      } catch (error) {
        const transient = error instanceof TokenVerifyError && error.transient;
        return c.json(
          { error: transient ? "token verification temporarily unavailable" : "invalid token" },
          transient ? 503 : 401,
        );
      }
    }
    return c.json({
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
    });
  });

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
    const s = serve({ fetch: app.fetch, hostname: bind.host, port: bind.port }, () => {
      // Bind succeeded: detach the bind-time rejecter (a settled promise
      // swallows it) and attach a PERSISTENT handler, so a post-bind server
      // error (EMFILE, a socket fault) is logged instead of vanishing
      // (review 2026-08-19).
      s.off("error", reject);
      s.on("error", (err: Error) => console.error(`gateway server error: ${err.message}`));
      resolve(s);
    });
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
