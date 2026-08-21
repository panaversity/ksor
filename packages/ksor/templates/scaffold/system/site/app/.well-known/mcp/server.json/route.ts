import { appName, mcpEndpoint, mcpNamespace, recordDescription, recordVersion } from "@/lib/shared";

/**
 * `/.well-known/mcp/server.json` — how an agent DISCOVERS this record's MCP
 * surface without being told the URL.
 *
 * AGENTS.md's critical rule 3 names this as one of the surfaces that must not
 * break, because agents finding a KSoR is how a KSoR gets used. A document a
 * validating client rejects is a broken surface, so this follows the published
 * schema rather than an approximation of it:
 *
 *   $schema      recommended, and it is what tells a reader which revision
 *                this document claims to satisfy.
 *   name         REQUIRED, and must match ^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$ —
 *                a namespace, one slash, an identifier. `instance.md`'s bare
 *                `name:` has no slash, so it was rejected outright.
 *   version      REQUIRED. Absent, the document failed validation on its own.
 *   capabilities NOT a field in the schema; it was invented here.
 *
 * (Checked against the 2025-12-11 schema, round-6 review of #43, which built
 * the scaffold and validated the emitted file.)
 *
 * Static-exported alongside the site, so it is served by whatever host serves
 * the record's pages and needs no runtime.
 */
export const dynamic = "force-static";

const SCHEMA = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

export function GET(): Response {
  const endpoint = mcpEndpoint();
  return Response.json(
    {
      $schema: SCHEMA,
      name: `${mcpNamespace()}/${appName}`,
      // The record's OWN account of itself — see recordDescription. A
      // description identical in every ksor record cannot help an agent choose
      // one, and a record with no scope yet says so instead of guessing.
      description: recordDescription(),
      version: recordVersion(),
      // Absent until the owner declares where the server runs — an invented
      // URL is worse than none, because an agent would try it and conclude the
      // record is down rather than unpublished.
      ...(endpoint === null ? {} : { remotes: [{ type: "streamable-http", url: endpoint }] }),
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
