/**
 * The composition root (oracle gateways/sor-content/main.py, adapted).
 *
 * Env contract (each `KSOR_*` name descends from an oracle `SOR_*` var):
 *   KSOR_INSTANCE                path to instance.md (default ./instance.md)
 *   <instance database.dsn_env>  the DSN — the NAME comes from instance.md
 *   GEMINI_API_KEY               owed iff embedding.provider needs a key
 *   KSOR_SNAPSHOT_KEYS           kid=secret[,...]; unset = ephemeral key
 *   KSOR_MCP_TRANSPORT           stdio | http (default stdio; PORT implies http)
 *   KSOR_MCP_HOST / KSOR_MCP_PORT  http bind (loopback unless PORT — deliberate)
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
import { runStdio } from "./stdio.js";

export const GATEWAY_VERSION = "0.0.0";

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const wantHttp =
    argv.includes("--http") ||
    process.env["KSOR_MCP_TRANSPORT"] === "http" ||
    (process.env["PORT"] !== undefined && process.env["KSOR_MCP_TRANSPORT"] !== "stdio");
  try {
    const composition = await compose(
      path.resolve(process.env["KSOR_INSTANCE"] ?? "instance.md"),
      GATEWAY_VERSION,
    );
    if (wantHttp) {
      await runHttp(composition);
    } else {
      await runStdio(composition);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    // ksor's exit contract: 1 refused (auth misconfiguration included —
    // the oracle used 2 there, but 2 means "not implemented" here), 3
    // environment (store unreachable, missing env). A hard exit: the pool
    // compose() may have opened would otherwise hold the event loop open
    // and a refused boot would hang instead of exiting (found live,
    // 2026-08-19).
    const code = error instanceof ContentStoreError || error instanceof RequiredEnvError ? 3 : 1;
    process.exit(error instanceof AuthConfigError ? 1 : code);
  }
}
