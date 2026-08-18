/**
 * The hosted door: stateless Streamable HTTP (one server+transport per
 * request — no session state, so any replica answers any request), wrapped
 * in the kit's posture: auth resolved BEFORE listening and fail-closed
 * (public bearer door, or the deliberate KSOR_AUTH_DISABLED=1 opt-out, or
 * refuse to boot), harden headers + body cap, DNS-rebind settings, and the
 * loopback auto-gate (a public bind is a deliberate act).
 *
 * Probes: /live (process up), /ready (one bounded corpus read; 503 when
 * the store or the space is not servable), /health (the honest state —
 * abstain gate INCLUDED: uncalibrated says so).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  buildAuth,
  harden,
  resolveBind,
  runServer,
  runWithIdentity,
  transportSecurityFromEnv,
  TokenVerifyError,
  type Auth,
} from "@panaversity/ksor-gateway-kit";
import { runProbe } from "@panaversity/ksor-content";

import { buildServer } from "./server.js";
import type { Composition } from "./compose.js";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  if (text === "") return undefined;
  return JSON.parse(text);
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (header === undefined) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

export async function runHttp(composition: Composition): Promise<void> {
  const auth: Auth = buildAuth(process.env);
  const security = transportSecurityFromEnv(process.env);
  const bind = resolveBind(process.env);
  const { ctx, instance, pool, spaceSkipReason } = composition;

  const handleMcp = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Stateless: a fresh server + transport per request; nothing survives
    // the response, so there is no session to fixate or leak.
    const server = buildServer(ctx, composition.version);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      ...security,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    const body = await readBody(req);
    await transport.handleRequest(req, res, body);
  };

  const app = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = (req.url ?? "").split("?", 1)[0] ?? "";
    if (path === "/live") {
      sendJson(res, 200, { live: true });
      return;
    }
    if (path === "/ready") {
      try {
        await runProbe(pool, instance.tenantId, (c) => c.query("SELECT 1 FROM corpora LIMIT 1"));
        sendJson(res, 200, { ready: true });
      } catch {
        sendJson(res, 503, { ready: false, reason: "content store unreachable" });
      }
      return;
    }
    if (path === "/health") {
      sendJson(res, 200, {
        corpus_id: instance.corpusId,
        abstain_gate:
          instance.abstain.vectorFloor === null
            ? "OFF (uncalibrated — will not refuse out-of-corpus questions)"
            : `floor ${instance.abstain.vectorFloor}`,
        embedding_space:
          spaceSkipReason === null
            ? `${instance.embeddingModel}/d${instance.embeddingDim} ok`
            : `${instance.embeddingModel}/d${instance.embeddingDim} unverified (check skipped: ${spaceSkipReason})`,
        auth: auth.mode,
      });
      return;
    }
    if (path === "/.well-known/oauth-protected-resource/mcp") {
      if (auth.mode === "public") {
        sendJson(res, 200, {
          resource: auth.config.resourceUrl,
          authorization_servers: [auth.config.ssoUrl],
        });
      } else {
        sendJson(res, 404, { error: "no public auth door configured" });
      }
      return;
    }
    if (path !== "/mcp") {
      sendJson(res, 404, { error: "unknown path", paths: ["/mcp", "/live", "/ready", "/health"] });
      return;
    }
    if (auth.mode === "public") {
      const token = bearerToken(req);
      if (token === null) {
        res.writeHead(401, {
          "content-type": "application/json",
          "www-authenticate": `Bearer resource_metadata="${auth.config.resourceUrl}"`,
        });
        res.end(JSON.stringify({ error: "bearer token required" }));
        return;
      }
      try {
        const identity = await auth.verify(token);
        await runWithIdentity(identity, () => handleMcp(req, res));
        return;
      } catch (error) {
        const transient = error instanceof TokenVerifyError && error.transient;
        sendJson(res, transient ? 503 : 401, {
          error: transient ? "token verification temporarily unavailable" : "invalid token",
        });
        return;
      }
    }
    await handleMcp(req, res);
  };

  await runServer(harden(app), bind);
  console.error(
    `ksor gateway serving ${instance.corpusId} on http://${bind.host}:${bind.port}/mcp ` +
      `(auth: ${auth.mode}, abstain gate: ${instance.abstain.vectorFloor === null ? "OFF (uncalibrated)" : `floor ${instance.abstain.vectorFloor}`})`,
  );
}
