/**
 * Loading a record's own tool surface from its repository.
 *
 * The file sits beside the record it serves — `system/gateways/content.ts`,
 * relative to `instance.md` — and it is OPTIONAL by design. Absent, deleted, or
 * never emitted, the door serves exactly the surface it always has, which is
 * what makes deleting it a supported action rather than a way to break a
 * deployment.
 *
 * It is a `.ts` file with no build step: Node ≥ 24 strips types natively and the
 * scaffold's `engines` already requires it, so the adopter edits a typed file
 * and the door imports it directly. No package.json, no compile, no install.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  GatewayConfigError,
  resolveGateway,
  type GatewayConfig,
  type ResolvedGateway,
} from "./gateway-config.js";

/** Where a content record's gateway file lives, relative to its instance.md. */
export const GATEWAY_FILE: string = path.join("system", "gateways", "content.ts");

/** The path this record's gateway file would occupy, whether or not it exists. */
export function gatewayPathFor(instancePath: string): string {
  return path.join(path.dirname(path.resolve(instancePath)), GATEWAY_FILE);
}

/**
 * Resolve the tool surface for the record at `instancePath`.
 *
 * Every failure is a `GatewayConfigError` carrying a slug, thrown here at boot
 * — before the DSN is resolved — because a door that came up with a surface
 * nobody asked for is worse than one that refuses and says which line to fix.
 */
export async function loadGateway(instancePath: string): Promise<ResolvedGateway> {
  const file = gatewayPathFor(instancePath);
  if (!existsSync(file)) return resolveGateway(null);

  let loaded: { default?: unknown };
  try {
    loaded = (await import(pathToFileURL(file).href)) as { default?: unknown };
  } catch (error) {
    throw new GatewayConfigError(
      "ksor-gateway-unloadable",
      `${file} could not be imported: ${error instanceof Error ? error.message : String(error)}. ` +
        "Fix the file, or delete it to take every default",
    );
  }

  const config = loaded.default;
  if (config === undefined || config === null) {
    throw new GatewayConfigError(
      "ksor-gateway-unloadable",
      `${file} has no default export. It must \`export default defineGateway({ tools: [...] })\`, ` +
        "or be deleted to take every default",
    );
  }
  if (typeof config !== "object" || !Array.isArray((config as GatewayConfig).tools)) {
    throw new GatewayConfigError(
      "ksor-gateway-unloadable",
      `${file} default-exports something that is not a gateway config — it needs a \`tools\` array. ` +
        "Build it with defineGateway({ tools: [contentTools.search()] })",
    );
  }

  return resolveGateway(config as GatewayConfig);
}
