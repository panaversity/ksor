/**
 * The default registration — and the ORIGINAL of the file `ksor init` emits.
 *
 * This is the canonical half of decision 18's mechanism, applied to the agent
 * surface: one rule, two places, asserted rather than trusted. The scaffold's
 * `system/gateways/content.ts` is this file byte-for-byte below the import
 * block, and `default-gateway-drift.test.ts` fails on the line that diverges.
 *
 * Two places rather than one is forced, not chosen. Node refuses to type-strip
 * any `.ts` under `node_modules` — `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`,
 * with no flag to lift it — so the published package cannot import its own
 * emitted template as a fallback. The compiled twin is how a deleted file still
 * serves, and the drift test is what stops the twins disagreeing.
 *
 * Everything below the import block is what an adopter owns: tool names, titles,
 * what the record says it covers, input schemas, annotations, and which tools
 * exist at all. What it composes — handlers, output schemas, and the FLOOR text
 * — stays in the package, because those are the citation and abstention
 * guarantees and a hand-written handler is the one thing no shape check catches.
 */

import {
  composeInstructions,
  FLOOR,
  MAX_OUTLINE_LIMIT,
  MAX_SEARCH_K,
  McpServer,
  outlineHandler,
  OUTLINE_OUTPUT,
  READ_ONLY,
  READ_OUTPUT,
  readHandler,
  SEARCH_OUTPUT,
  searchHandler,
  z,
  type ServiceContext,
} from "./gateway-api.js";

export default function buildGateway(ctx: ServiceContext, version: string): McpServer {
  const server = new McpServer(
    // The MCP server name agents see. Change it to your record's name.
    { name: "ksor", version },
    // instance.md's body is this record's system prompt, preserved beneath the
    // framework floor. Leave this alone unless you mean to replace the prompt.
    { instructions: composeInstructions(ctx.instance.instructions) },
  );

  server.registerTool(
    "search",
    {
      title: "Search the record",
      // WHAT THIS RECORD COVERS goes first — it is how an agent with several
      // records attached decides to ask yours. Say the subject AND the
      // boundary; the second half prevents more wrong calls than the first:
      //
      //   description: `Employee handbook: leave, benefits, conduct, expenses.
      //   Not product documentation and not customer data.\n\n${FLOOR.search}`,
      //
      // FLOOR.search must stay. It tells an agent how to read an abstention and
      // that corpus text is untrusted; the door checks it is still there at boot.
      description: FLOOR.search,
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(2000)
          .describe("A focused question or phrase to search the record for"),
        // `k` is the lever on reply size: 10 costs an agent ~3,500 tokens a
        // call, 5 costs ~2,000. Lower it to what your record actually needs —
        // a caller can always ask for more.
        k: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_K)
          .default(10)
          .describe(`Maximum passages to return (1–${MAX_SEARCH_K})`),
      }),
      outputSchema: SEARCH_OUTPUT,
      annotations: READ_ONLY,
    },
    searchHandler(ctx),
  );

  // Delete a tool by deleting its block. Measured: outline and read together
  // cost ~1,643 tokens of context that is resident for an agent's whole
  // session, whether or not it ever calls them.
  server.registerTool(
    "outline",
    {
      title: "Outline the record",
      description: FLOOR.outline,
      inputSchema: z.object({
        node: z
          .string()
          .optional()
          .describe("Slug or '/'-path to drill into; omit to browse the top level"),
        depth: z.number().int().min(0).max(5).optional().describe("Extra levels below the anchor"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_OUTLINE_LIMIT)
          .default(200)
          .describe("Maximum rows in ONE page"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Rows to skip — pass the previous response's next_offset to continue"),
      }),
      outputSchema: OUTLINE_OUTPUT,
      annotations: READ_ONLY,
    },
    outlineHandler(ctx),
  );

  server.registerTool(
    "read",
    {
      title: "Read a document",
      description: FLOOR.read,
      inputSchema: z.object({
        slug: z.string().min(1).describe("The document's slug or '/'-qualified path (see outline)"),
        heading: z
          .string()
          .optional()
          .describe(
            "Restrict to one section subtree: a full heading path, any prefix of one, or a " +
              "section's last segment when it is unique in the document",
          ),
        from_heading: z
          .string()
          .optional()
          .describe("Window cursor from a previous response's next"),
        snapshot_token: z
          .string()
          .optional()
          .describe(
            'The "token" string from a search response\'s "snapshot" object — not the object.',
          ),
        token_budget: z
          .number()
          .int()
          .min(100)
          .max(70000)
          .optional()
          .describe("Response size budget in tokens (default 70000)"),
      }),
      outputSchema: READ_OUTPUT,
      annotations: READ_ONLY,
    },
    readHandler(ctx),
  );

  // Add your own tools here with ordinary registerTool + zod. They are yours;
  // ksor makes no provenance claim about a tool it did not hand you a handler
  // for, and the boot check only inspects the ones it did.

  return server;
}
