/**
 * The local door: stdio, the transport a coding agent's MCP client spawns.
 * Auth is off BY CONSTRUCTION here — the process inherits the caller's
 * local authority the way any spawned child does; there is no network
 * surface to fail closed on (the loopback rationale, decision 7).
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { buildServer } from "./server.js";
import type { Composition } from "./compose.js";

export async function runStdio(composition: Composition): Promise<void> {
  const server = buildServer(composition.ctx, composition.version);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Logs go to stderr only — stdout IS the protocol stream.
  console.error(
    `ksor gateway serving ${composition.instance.corpusId} on stdio ` +
      `(abstain gate: ${composition.instance.abstain.vectorFloor === null ? "OFF (uncalibrated)" : `floor ${composition.instance.abstain.vectorFloor}`})`,
  );
}
