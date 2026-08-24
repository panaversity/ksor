/**
 * Where the issuer's endpoints actually are — asked, never assumed.
 *
 * Hardcoding `/authorize` and `/oauth/token` would work against one vendor and
 * fail against the next, which is the opposite of what this project claims.
 * Every standards-compliant authorization server publishes a metadata document
 * naming its own endpoints, and the door already reads exactly these two
 * (`gateway-kit/src/jwks-discovery.ts`): RFC 8414 first, then OpenID Discovery.
 *
 * So the site and the door discover the same issuer the same way, and pointing
 * both at a different provider stays an environment change.
 */

export interface Endpoints {
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
}

const PATHS = ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"];

function isEndpoints(value: unknown): value is Endpoints {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v["authorization_endpoint"] === "string" && typeof v["token_endpoint"] === "string";
}

let cached: Endpoints | null = null;

/**
 * The issuer's endpoints, or null if it publishes no usable metadata.
 *
 * Memoized for the page's lifetime: the flow reads it twice (once to leave,
 * once to come back) and those are separate page loads, so this saves a request
 * only within one of them. Correctness does not depend on it.
 */
export async function discover(issuer: string): Promise<Endpoints | null> {
  if (cached !== null) return cached;
  const base = issuer.replace(/\/+$/, "");
  for (const path of PATHS) {
    try {
      const response = await fetch(`${base}${path}`);
      if (!response.ok) continue;
      const document: unknown = await response.json();
      if (isEndpoints(document)) {
        cached = document;
        return document;
      }
    } catch {
      /* try the next document; a provider publishing neither is the null case */
    }
  }
  return null;
}
