// Edge hardening for the served node:http handler — a PURE wrapper (no MCP SDK
// internals, so it can't drift when the SDK's HTTP wiring changes). Converted
// from the predecessor's harden.py (decision 6): three production stress-report
// findings, one middleware:
//
// - Security headers (HSTS + `X-Content-Type-Options: nosniff`) on EVERY
//   response, its own error responses included.
// - Request-body cap: an oversized DECLARED body is refused with 413 from its
//   Content-Length before it is read; a body with NO declared length (chunked)
//   is buffered up to the same cap BEFORE the app runs and refused with the
//   same clean 413 past it — the app never sees the oversized request at all.
//   (The predecessor's first cut synthesized a disconnect mid-app and the
//   framework 500'd instead of 413'ing — buffer-then-replay is the fix.)
// - Bare RFC 9728 metadata redirect: the SDK mounts the protected-resource
//   metadata at the PATH-SUFFIXED `/.well-known/oauth-protected-resource/mcp`;
//   a strict client guessing the BARE path gets a 308 to the suffixed one
//   instead of a 404, so discovery works for more than one vendor's client.

import type { IncomingMessage, ServerResponse } from "node:http";

import { defaultWarn, envInt, type Env, type WarnLog } from "./env.js";

/**
 * The handler shape this kit serves. For a chunked request the middleware
 * buffers the body and hands it over as `body` — the node:http replay seam
 * (the MCP SDK's `transport.handleRequest(req, res, parsedBody)` accepts
 * exactly this). When `body` is undefined the app reads the stream itself.
 */
export type HttpHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body?: Buffer,
) => void | Promise<void>;

export type HardenOptions = {
  /**
   * Where the MCP endpoint (and thus the SDK's suffixed PRM) lives; the
   * bare-PRM redirect points at it. Default "/mcp".
   */
  resourcePath?: string;
  /** Explicit cap; overrides KSOR_MAX_BODY_BYTES. */
  maxBodyBytes?: number;
  /** Read for KSOR_MAX_BODY_BYTES when `maxBodyBytes` is not given. */
  env?: Env;
  warn?: WarnLog;
};

// 1 MB default — MCP JSON-RPC tool calls are tiny; this only sheds abusive
// bodies. Env-tunable (KSOR_MAX_BODY_BYTES), floor 1024. Values copied exactly
// from harden.py.
const DEFAULT_MAX_BODY_BYTES = 1_000_000;
const BARE_PRM = "/.well-known/oauth-protected-resource";
// Header values copied exactly from harden.py — they are the contract.
const SECURITY_HEADERS: readonly (readonly [string, string])[] = [
  ["strict-transport-security", "max-age=63072000; includeSubDomains"],
  ["x-content-type-options", "nosniff"],
];

type BufferOutcome = { kind: "ok"; body: Buffer } | { kind: "too-big" } | { kind: "gone" };

function bufferBody(req: IncomingMessage, cap: number): Promise<BufferOutcome> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;
    const finish = (outcome: BufferOutcome): void => {
      if (done) return;
      done = true;
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("close", onClose);
      // On the non-replay outcomes nothing reads this request again — swallow
      // a late socket reset instead of crashing on an unhandled 'error'.
      if (outcome.kind !== "ok") req.on("error", () => {});
      resolve(outcome);
    };
    const onData = (chunk: Buffer | string): void => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += buf.length;
      if (total > cap) {
        req.pause(); // stop reading; the 413 below tells the client a cap exists
        finish({ kind: "too-big" });
        return;
      }
      chunks.push(buf);
    };
    const onEnd = (): void => {
      finish({ kind: "ok", body: Buffer.concat(chunks) });
    };
    const onError = (): void => {
      finish({ kind: "gone" });
    };
    const onClose = (): void => {
      finish({ kind: "gone" }); // client gone before the body finished
    };
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("close", onClose);
  });
}

// Python's int() is strict: an unparseable Content-Length is NOT treated as
// too big (the framework refuses it downstream).
function parseContentLength(value: string): number | null {
  const trimmed = value.trim();
  return /^[+-]?\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** Wrap `app` with the edge hardening above. */
export function harden(app: HttpHandler, options: HardenOptions = {}): HttpHandler {
  const resourcePath = options.resourcePath ?? "/mcp";
  const maxBodyBytes =
    options.maxBodyBytes ??
    envInt(options.env ?? process.env, "KSOR_MAX_BODY_BYTES", DEFAULT_MAX_BODY_BYTES, {
      minimum: 1024,
      warn: options.warn ?? defaultWarn,
    });
  const prmTarget = `${BARE_PRM}${resourcePath}`;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Security headers on EVERY response — the app's and our own short-circuits
    // alike (writeHead merges these in unless the app overrides a name).
    for (const [name, value] of SECURITY_HEADERS) res.setHeader(name, value);

    const path = (req.url ?? "").split("?", 1)[0] ?? "";
    if (path === BARE_PRM) {
      res.writeHead(308, { location: prmTarget });
      res.end();
      return;
    }

    const declared = req.headers["content-length"];
    if (declared !== undefined) {
      const length = parseContentLength(declared);
      if (length !== null && length > maxBodyBytes) {
        res.writeHead(413, { "content-type": "text/plain" });
        res.end("request body too large");
        return;
      }
      await app(req, res);
      return;
    }

    const method = req.method ?? "GET";
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const outcome = await bufferBody(req, maxBodyBytes);
      if (outcome.kind === "gone") return; // nothing to serve — no response
      if (outcome.kind === "too-big") {
        res.writeHead(413, { "content-type": "text/plain" });
        res.end("request body too large");
        return;
      }
      await app(req, res, outcome.body);
      return;
    }

    await app(req, res);
  };
}
