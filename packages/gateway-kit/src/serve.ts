// Bind resolution and required-env refusal every KSoR gateway uses, converted
// from the predecessor's serve.py (decision 6): the loopback auto-gate
// (serving fails safe, decision 7) and a slugged missing-env refusal. The
// node:http runner and edge hardening were removed when the door moved to the
// SDK's Web-standard transport behind Hono (decision 13) — that shape does
// the serving loop and hardening as middleware.

import type { Env } from "./env.js";

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
  // Reject port 0 as well as out-of-range: port 0 asks the OS for an EPHEMERAL
  // port, the one input where requested != actual-bound. A URL-addressed MCP
  // server needs a fixed known port (clients dial its URL) AND the loopback
  // Host allowlist is built from this number — with 0 it freezes at ":0" and
  // 421s every request against the real ephemeral port (review, 2026-08-19).
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535) {
    throw new Error(
      `${source}=${JSON.stringify(raw)} is not a valid port — set an integer 1..65535 ` +
        "(port 0 asks the OS for an ephemeral port, which an MCP server addressed by URL " +
        "cannot use; the container platform's contract is $PORT; KSOR_MCP_PORT overrides for local/dev)",
    );
  }
  return { host, port: Number(raw) };
}
