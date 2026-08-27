/**
 * A ksor handler served through a surface the boot check cannot inspect.
 *
 * Recognition is by the SHAPE of a tool's output schema, because the NAME is
 * exactly what a record is invited to change. Two ordinary registrations defeat
 * that: one renaming the output schema's fields, and one omitting `outputSchema`
 * altogether — optional in the MCP SDK, and the most natural field to leave off
 * a hand-written registration. An unrecognised tool was indistinguishable from a
 * tool the record had dropped, so the floor check was SKIPPED and the door
 * booted clean while the connecting agent was never told to abstain rather than
 * fall back on model knowledge, never told what `gate: "off"` means, and never
 * told hit content is untrusted — the injection defence itself.
 *
 * The actor is not an attacker. It is `system/gateways/content.ts` and the
 * coding agent editing it, which is decision 23's whole bargain: prevention
 * traded for verification. In these two shapes the verification did not happen.
 */

import { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { verifyGatewaySurface } from "./gateway-verify.js";
import {
  MAX_SEARCH_K,
  searchHandler,
  tallyHandlers,
  TRUST_TIERS,
  type ServiceContext,
} from "./tools.js";

const STUB = {
  instance: { instructions: "" },
  pool: null,
  ring: null,
} as unknown as ServiceContext;

// A raw shape (what the no-outputSchema overload accepts), matching the real
// search arguments so the framework handler fits it.
const INPUT = {
  query: z.string().min(1),
  k: z.number().int().min(1).max(MAX_SEARCH_K).default(10),
  min_trust_tier: z.enum(TRUST_TIERS).optional(),
};
/** The shape a record might invent, with `hits` renamed to something of its own. */
const RENAMED = z.object({ results: z.array(z.unknown()), gate: z.string() });

/** The floor is DROPPED in every case here — that is what must be caught. */
function serverWithout(renameOutput: boolean): McpServer {
  const server = new McpServer({ name: "unverifiable-suite", version: "0.0.0" }, {});
  const common = { title: "Search", description: "Acme handbook.", inputSchema: INPUT };
  if (renameOutput) {
    server.registerTool("search_the_handbook", { ...common, outputSchema: RENAMED }, () => ({
      content: [],
      structuredContent: { results: [], gate: "off" },
    }));
    // The handler is still the framework's — registered separately so this
    // registration counts as having created it, which is the whole point.
    searchHandler(STUB);
    return server;
  }
  server.registerTool("search_the_handbook", common, searchHandler(STUB));
  return server;
}

async function verify(renameOutput: boolean): Promise<void> {
  const built = tallyHandlers(() => serverWithout(renameOutput));
  await verifyGatewaySurface(built.value, { registered: built.registered, report: () => {} });
}

describe("a ksor handler behind an uninspectable surface refuses to boot", () => {
  it("refuses when the output schema renames the property it is recognised by", async () => {
    await expect(verify(true)).rejects.toThrow(/ksor-gateway-unverifiable/);
  });

  it("refuses when the registration declares no output schema at all", async () => {
    await expect(verify(false)).rejects.toThrow(/ksor-gateway-unverifiable/);
  });

  it("names the handler and how to make it inspectable again", async () => {
    await expect(verify(false)).rejects.toThrow(/SEARCH_OUTPUT/);
  });

  it("still lets a record DROP a tool — no handler, nothing to verify", async () => {
    // The distinction the count exists to draw. This registration creates no
    // ksor handler, so there is nothing unverifiable about it.
    const server = new McpServer({ name: "dropped", version: "0.0.0" }, {});
    server.registerTool(
      "ask_the_owner",
      { title: "Ask", description: "Email someone.", inputSchema: z.object({ q: z.string() }) },
      () => ({ content: [{ type: "text" as const, text: "ok" }] }),
    );
    const built = tallyHandlers(() => server);
    await expect(
      verifyGatewaySurface(built.value, { registered: built.registered, report: () => {} }),
    ).resolves.toBeDefined();
  });
});
