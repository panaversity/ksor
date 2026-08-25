/**
 * The ONE import a registration file needs.
 *
 * Everything an adopter's `system/gateways/content.ts` uses comes from here —
 * including `z` and `McpServer`, deliberately re-exported rather than left as
 * dependencies the scaffold would have to declare. Two reasons, and both are
 * load-bearing:
 *
 *   1. A registration file must stay a file, not a package. If it needed `zod`
 *      and `@modelcontextprotocol/server` in the adopter's own package.json,
 *      the scaffold would gain runtime dependencies, a lockfile churn, and the
 *      48-hour release quarantine on two more packages — and "no build step, no
 *      package" would stop being true.
 *   2. The SDK validates arguments with the SAME zod it was built against. An
 *      adopter resolving their own zod could hand the SDK schemas from a
 *      different instance, which fails in ways that read as schema bugs. One
 *      re-export makes instance identity impossible to get wrong.
 */

export { McpServer } from "@modelcontextprotocol/server";
export { z } from "zod";

export { composeInstructions, recordIsUndescribed } from "./instructions.js";

export {
  FLOOR,
  MAX_OUTLINE_LIMIT,
  MAX_SEARCH_K,
  TRUST_TIERS,
  OUTLINE_OUTPUT,
  READ_ONLY,
  READ_OUTPUT,
  SEARCH_OUTPUT,
  outlineHandler,
  readHandler,
  searchHandler,
  type OutlineArgs,
  type ReadArgs,
  type SearchArgs,
  type ServiceContext,
  type TrustTier,
} from "./tools.js";
