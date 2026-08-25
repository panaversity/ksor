/**
 * The boot check's SECOND voice: a notice, not a refusal.
 *
 * `min_trust_tier` arrived after `ksor init` had already emitted registration
 * files, and those files are adopter-owned code (decision 23). Refusing them
 * would take a working record off the air for a parameter it never had, and
 * every guarantee still holds without it — the handler supplies `unverified`
 * and the deployment's own floor is untouched. What is LOST is the only way a
 * caller can ask to be answered from reviewed material, and an absence nobody
 * is told about is one nobody fixes.
 *
 * So the door says so and opens. This suite pins the distinction, because
 * "notices at boot" is exactly the kind of thing that quietly becomes a
 * refusal, or quietly becomes nothing.
 */

import { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";

import {
  FLOOR,
  MAX_SEARCH_K,
  OUTLINE_OUTPUT,
  outlineHandler,
  READ_ONLY,
  SEARCH_OUTPUT,
  searchHandler,
  TRUST_TIERS,
} from "./tools.js";
import { verifyGatewaySurface } from "./gateway-verify.js";
import type { ServiceContext } from "./tools.js";
import { z } from "zod";

/** Registration only closes over ctx; nothing here reaches Postgres. */
const STUB = {
  instance: { instructions: "" },
  pool: null,
  ring: null,
} as unknown as ServiceContext;

/** A search registration with or without the parameter — everything else identical. */
function serverWith(trustParam: boolean): McpServer {
  const server = new McpServer({ name: "notice-suite", version: "0.0.0" }, {});
  server.registerTool(
    "search_the_handbook",
    {
      title: "Search",
      description: `Acme handbook.\n\n${FLOOR.search}`,
      inputSchema: trustParam
        ? z.object({
            query: z.string().min(1),
            k: z.number().int().min(1).max(MAX_SEARCH_K).default(10),
            min_trust_tier: z.enum(TRUST_TIERS).optional(),
          })
        : z.object({
            query: z.string().min(1),
            k: z.number().int().min(1).max(MAX_SEARCH_K).default(10),
          }),
      outputSchema: SEARCH_OUTPUT,
      annotations: READ_ONLY,
    },
    searchHandler(STUB),
  );
  return server;
}

describe("a registration without min_trust_tier is NOTICED, never refused", () => {
  it("boots, and names the tool and the fix", async () => {
    const notices: string[] = [];
    const tools = await verifyGatewaySurface(serverWith(false), { report: (l) => notices.push(l) });

    // It BOOTED: the surface came back, nothing threw.
    expect(tools.map((t) => t.name)).toEqual(["search_the_handbook"]);

    const notice = notices.join("\n");
    // The tool by the name the ADOPTER gave it — recognition is by shape, so
    // naming "search" would send them looking for a tool they do not have.
    expect(notice).toContain("search_the_handbook");
    expect(notice).toContain("min_trust_tier");
    // "Errors are documentation" applies to notices too: what is missing, why
    // it matters, and the line to paste.
    expect(notice).toMatch(/z\.enum\(TRUST_TIERS\)/);
  });

  it("says nothing when the parameter is there", async () => {
    const notices: string[] = [];
    await verifyGatewaySurface(serverWith(true), { report: (l) => notices.push(l) });
    expect(notices).toEqual([]);
  });

  it("says nothing when the record serves no search tool at all", async () => {
    // Deleting a tool is supported, and measured as the biggest context win
    // (decision 23). A notice about a search tool nobody registered would be
    // noise on every boot of a record that made a deliberate choice.
    const server = new McpServer({ name: "notice-suite", version: "0.0.0" }, {});
    server.registerTool(
      "outline",
      {
        title: "Outline",
        description: FLOOR.outline,
        inputSchema: z.object({ limit: z.number().int().default(200) }),
        outputSchema: OUTLINE_OUTPUT,
        annotations: READ_ONLY,
      },
      outlineHandler(STUB),
    );
    const notices: string[] = [];
    await verifyGatewaySurface(server, { report: (l) => notices.push(l) });
    expect(notices).toEqual([]);
  });
});
