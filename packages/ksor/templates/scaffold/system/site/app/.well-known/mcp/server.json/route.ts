import { appName, mcpEndpoint, mcpNamespace, recordDescription, recordVersion } from "@/lib/shared";
import { readStageManifest } from "@/lib/stage-manifest";

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
 *   _meta        the schema's extension point, namespaced by reverse DNS —
 *                where the build's stamps go (build spec §3, R14), so a
 *                validating client still accepts the document and a consumer
 *                can connect it to the publication it describes.
 *
 * (Checked against the 2025-12-11 schema, round-6 review of #43, which built
 * the scaffold and validated the emitted file.)
 *
 * Static-exported alongside the site, so it is served by whatever host serves
 * the record's pages and needs no runtime.
 */
export const dynamic = "force-static";

const SCHEMA = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

/** The `_meta` key the stamps live under: a namespace this project controls. */
const META_KEY = "com.panaversity.ksor/build";

export function GET(): Response {
  const endpoint = mcpEndpoint();
  const { build_id, source_commit, dirty, ksor_version, unstamped } = readStageManifest().stamps;
  return Response.json(
    {
      $schema: SCHEMA,
      _meta: { [META_KEY]: { build_id, source_commit, dirty, ksor_version, unstamped } },
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
