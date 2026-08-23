/**
 * Your record's agent surface. Yours to edit — or to delete.
 *
 * `ksor serve` reads this file to decide what tools agents see. Delete it and
 * the door serves the defaults, unchanged; nothing here is required.
 *
 * Why bother: an agent pays for this surface out of its context window. Every
 * tool's name and description sits in that context for the whole session, and
 * every answer spends more of it. Measured on an 81-document record:
 *
 *   all three tool definitions   ~2,800 tokens   always there
 *   one search at k=10           ~3,500 tokens   per call
 *   one search at k=5            ~2,000 tokens   per call
 *
 * So the two edits that pay are: drop a tool your agents never call, and set
 * `k` to what your record actually needs.
 *
 * What you CANNOT change here is deliberate: the shape of a result, the
 * provenance on it, and the paragraphs telling an agent how to read an
 * abstention. Those are the guarantees — `covers` is added ABOVE them, never
 * instead of them.
 */

import { contentTools, defineGateway } from "@panaversity/ksor/gateway";

export default defineGateway({
  // The MCP server name agents see. Defaults to "ksor".
  // serverName: "KSOR-STAMP-NAME",

  tools: [
    contentTools.search({
      // WHAT THIS RECORD COVERS. The single highest-value line in this file:
      // it is how an agent with several records attached decides to ask yours.
      // Say the subject, and say what you are NOT — the second half prevents
      // more wrong calls than the first.
      //
      // covers:
      //   "Employee handbook: leave, benefits, conduct, expenses. " +
      //   "Not product documentation and not customer data.",
      //
      // Hits per call when the caller does not say. Lower is cheaper; the
      // caller can always ask for more.
      // k: 5,
    }),

    contentTools.outline(),
    contentTools.read(),
  ],
});
