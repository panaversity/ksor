/**
 * The composition root (oracle gateways/sor-content/main.py, adapted).
 *
 * ONE transport: stateless Streamable HTTP — the shape the production
 * content gateway ships, and the shape modern MCP clients (local coding
 * agents included) speak against a URL. There is no stdio door: a second
 * transport forks every skill, test, and recipe for no capability a URL
 * lacks (AGENTS.md "one obvious way"; owner direction 2026-08-19).
 *
 * The bind decides the posture: unset PORT/host → loopback (127.0.0.1),
 * the dev door, DNS-rebind-protected and safe with auth off; a public bind
 * is a deliberate act that fails closed unless auth is configured or
 * KSOR_AUTH_DISABLED=1 is set explicitly.
 *
 * Env contract (each `KSOR_*` name descends from an oracle `SOR_*` var):
 *   KSOR_INSTANCE                path to instance.md (default ./instance.md)
 *   <instance database.dsn_env>  the DSN — the NAME comes from instance.md
 *   GEMINI_API_KEY               owed iff embedding.provider needs a key
 *   KSOR_SNAPSHOT_KEYS           kid=secret[,...]; unset = ephemeral key
 *   KSOR_MCP_HOST / KSOR_MCP_PORT  bind (loopback unless PORT — deliberate)
 *   KSOR_SSO_URL + KSOR_MCP_RESOURCE_URL + KSOR_JWT_ALLOWED_AUDIENCES  public door
 *   KSOR_AUTH_DISABLED=1         the deliberate unauthenticated opt-out
 *
 * Exit codes follow the ksor CLI contract: refusal 1, environment 3 —
 * always a remedied message, never a stack trace.
 */

import path from "node:path";

import { ContentStoreError } from "@panaversity/ksor-content";
import { AuthConfigError, RequiredEnvError } from "@panaversity/ksor-gateway-kit";

import { compose } from "./compose.js";
import { runHttp } from "./http.js";

export const GATEWAY_VERSION = "0.0.0";

export async function main(): Promise<void> {
  try {
    const composition = await compose(
      path.resolve(process.env["KSOR_INSTANCE"] ?? "instance.md"),
      GATEWAY_VERSION,
    );
    await runHttp(composition);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    // ksor's exit contract: 1 refused (auth misconfiguration included —
    // the oracle used 2 there, but 2 means "not implemented" here), 3
    // environment (store unreachable, missing env). A hard exit: the pool
    // compose() may have opened would otherwise hold the event loop open
    // and a refused boot would hang instead of exiting (found live,
    // 2026-08-19).
    // A listen/bind failure (EADDRINUSE, EACCES, EADDRNOTAVAIL) is an
    // ENVIRONMENT failure (exit 3), not a refusal — the port/permission is
    // the operator's environment, not a bad config (review, 2026-08-19).
    const bindFailure =
      error !== null &&
      typeof error === "object" &&
      typeof (error as { code?: unknown }).code === "string" &&
      /^E(ADDRINUSE|ACCES|ADDRNOTAVAIL)$/.test((error as { code: string }).code);
    const environment =
      error instanceof ContentStoreError || error instanceof RequiredEnvError || bindFailure;
    process.exit(error instanceof AuthConfigError ? 1 : environment ? 3 : 1);
  }
}
