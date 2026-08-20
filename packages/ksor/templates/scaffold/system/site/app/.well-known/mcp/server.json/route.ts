import { appName, mcpEndpoint } from "@/lib/shared";

/**
 * `/.well-known/mcp/server.json` — how an agent DISCOVERS this record's MCP
 * surface without being told the URL.
 *
 * AGENTS.md's critical rule 3 names this as one of the surfaces that must not
 * break, because agents finding a KSoR is how a KSoR gets used. It did not
 * exist anywhere in the tree.
 *
 * Static-exported alongside the site, so it is served by whatever host serves
 * the record's pages and needs no runtime.
 */
export const dynamic = "force-static";

export function GET(): Response {
  const endpoint = mcpEndpoint();
  return Response.json(
    {
      name: appName,
      description: `The ${appName} Knowledge System of Record: governed markdown served with citations and honest abstention.`,
      // Absent until the owner declares where the server runs — an invented
      // URL is worse than none, because an agent would try it and conclude the
      // record is down rather than unpublished.
      ...(endpoint === null ? {} : { remotes: [{ type: "streamable-http", url: endpoint }] }),
      capabilities: { tools: true },
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
