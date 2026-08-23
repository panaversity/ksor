/**
 * Loading a record's own registration from its repository.
 *
 * The file sits beside the record it serves — `system/gateways/content.ts`,
 * relative to `instance.md` — and it is OPTIONAL by design. Absent, deleted, or
 * never emitted, the door serves the compiled default, which is byte-identical
 * to what `ksor init` writes. Deleting it is the honest test of whether a
 * default is a gift or a tax, so it stays supported and is asserted.
 *
 * It is a `.ts` file with no build step: Node ≥ 24 strips types natively and the
 * scaffold already requires it. Note that this ONLY works because the file lives
 * in the adopter's project tree — Node refuses to type-strip anything under
 * `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, no flag lifts
 * it), which is exactly why the fallback is a compiled twin rather than this
 * same file shipped inside the package.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import buildDefaultGateway from "./default-gateway.js";
import type { Registration } from "./server.js";

/** Where a content record's registration lives, relative to its instance.md. */
export const GATEWAY_FILE: string = path.join("system", "gateways", "content.ts");

/** The path this record's registration would occupy, whether or not it exists. */
export function gatewayPathFor(instancePath: string): string {
  return path.join(path.dirname(path.resolve(instancePath)), GATEWAY_FILE);
}

/** A configuration error, refused at boot before the DSN is even resolved. */
export class GatewayConfigError extends Error {
  readonly slug: string;

  constructor(slug: string, detail: string) {
    super(`${slug}: ${detail}`);
    this.name = "GatewayConfigError";
    this.slug = slug;
  }
}

/**
 * Resolve the registration for the record at `instancePath`.
 *
 * Every failure is a `GatewayConfigError` carrying a slug, thrown here at boot —
 * before the DSN is resolved — because a door that came up serving a surface
 * nobody asked for is worse than one that refuses and names the file to fix.
 */
export async function loadGateway(instancePath: string): Promise<Registration> {
  const file = gatewayPathFor(instancePath);
  if (!existsSync(file)) return buildDefaultGateway;

  let loaded: { default?: unknown };
  try {
    loaded = (await import(pathToFileURL(file).href)) as { default?: unknown };
  } catch (error) {
    throw new GatewayConfigError(
      "ksor-gateway-unloadable",
      `${file} could not be imported: ${error instanceof Error ? error.message : String(error)}. ` +
        "Fix the file, or delete it to take the default registration",
    );
  }

  if (typeof loaded.default !== "function") {
    throw new GatewayConfigError(
      "ksor-gateway-unloadable",
      `${file} must \`export default\` a function (ctx, version) => McpServer — it exports ` +
        `${loaded.default === undefined ? "no default" : typeof loaded.default}. ` +
        "Delete the file to take the default registration",
    );
  }

  return loaded.default as Registration;
}
