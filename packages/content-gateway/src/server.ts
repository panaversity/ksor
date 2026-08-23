/**
 * Building the MCP server for a request.
 *
 * This file used to BE the tool surface — schemas, floors, registrations and
 * handlers in one 434-line block. It is now a dispatcher, because the surface
 * belongs to the record:
 *
 *   tools.ts           the guarantees — output schemas, FLOOR text, handlers
 *   gateway-api.ts     the one import a registration file needs
 *   default-gateway.ts the registration, and the ORIGINAL of the emitted file
 *   this file          picks which registration runs, then verifies what it built
 *
 * A record's own `system/gateways/content.ts` is loaded at BOOT (compose.ts, via
 * gateway-load.ts) and carried here. Deliberately not per-request: the SDK's
 * factory would happily await a dynamic import on every call, but then a broken
 * gateway file stops being a boot refusal and becomes a 500 on a process whose
 * /health and /ready both read green — a shape this repo has already had to fix
 * twice.
 */

import type { McpServer } from "@modelcontextprotocol/server";

import type { ServiceContext } from "@panaversity/ksor-content";

import buildDefaultGateway from "./default-gateway.js";

export { composeInstructions, recordIsUndescribed } from "./instructions.js";

/**
 * A registration: everything a record chooses about how agents see it.
 *
 * The adopter's file default-exports one of these, and so does
 * `default-gateway.ts` — they are the same code, asserted by
 * `default-gateway-drift.integration.test.ts`.
 */
export type Registration = (ctx: ServiceContext, version: string) => McpServer;

/**
 * Build the server for this request from the registration this record serves.
 *
 * `undefined` means the record ships no gateway file — or deleted it — and takes
 * the compiled default, which is byte-identical to what `ksor init` emits.
 */
export function buildServer(
  ctx: ServiceContext,
  version: string,
  registration: Registration = buildDefaultGateway,
): McpServer {
  return registration(ctx, version);
}
