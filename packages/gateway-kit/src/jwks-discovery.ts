/**
 * Where an authorization server publishes its signing keys — discovered, not
 * guessed.
 *
 * `KSOR_SSO_URL` is documented as "the AS base", and the verifier appended one
 * vendor's layout to it: `/api/auth/jwks`, which is Better Auth's. That is not
 * a standard. Auth0, Okta, Entra, Keycloak and Cognito each publish elsewhere,
 * and every one of them failed the fetch — classified TRANSIENT rather than
 * misconfiguration, so the door booted clean and every request 503'd with
 * nothing naming the cause. The only posture an operator could actually reach
 * was `KSOR_ALLOW_PUBLIC_UNAUTHENTICATED=1`: the one key we handed people was
 * the one that props the door open (issue #26).
 *
 * Every standards-compliant AS advertises `jwks_uri` in a metadata document:
 * RFC 8414 for OAuth, OpenID Connect Discovery for OIDC. Reading it makes any
 * of them work unmodified.
 *
 * Precedence, most explicit first:
 *
 *   1. `KSOR_JWKS_URL`                     the operator said exactly where
 *   2. RFC 8414 oauth-authorization-server the OAuth metadata document
 *   3. OIDC openid-configuration           the OIDC metadata document
 *   4. `<sso>/api/auth/jwks`               the vendor default, kept so an
 *                                          existing Better Auth deployment
 *                                          does not break — and reported as a
 *                                          GUESS, because that is what it is
 */

/** How the JWKS URI was arrived at — reported at boot so a guess is legible. */
export type JwksSource =
  | "explicit"
  | "oauth-authorization-server"
  | "openid-configuration"
  | "vendor-fallback";

export interface JwksResolution {
  readonly url: string;
  readonly source: JwksSource;
  /** What the operator should be told, when anything is worth telling them. */
  readonly advisory: string | null;
}

/** How long discovery may take before the fallback is used. */
const DISCOVERY_TIMEOUT_MS = 5_000;

/**
 * RFC 8414 §3: the well-known segment is inserted after the HOST, before any
 * path the issuer carries — `https://host/tenant` discovers at
 * `https://host/.well-known/oauth-authorization-server/tenant`, NOT at
 * `https://host/tenant/.well-known/...`. OIDC Discovery §4 appends instead.
 * Both shapes are tried, because real deployments serve both.
 */
export function metadataUrls(ssoUrl: string): string[] {
  const base = new URL(ssoUrl);
  const path = base.pathname.replace(/\/+$/, "");
  const origin = base.origin;
  const rfc8414 = `${origin}/.well-known/oauth-authorization-server${path}`;
  const oidcRoot = `${origin}/.well-known/openid-configuration${path}`;
  const oidcAppended = `${origin}${path}/.well-known/openid-configuration`;
  // Deduplicated: with no path, the appended and root OIDC forms are identical.
  return [...new Set([rfc8414, oidcRoot, oidcAppended])];
}

/** `URL.hostname` keeps the brackets on an IPv6 literal. */
function isLoopback(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

async function readJwksUri(url: string, fetchImpl: FetchLike): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) return null;
    const body = (await response.json()) as { jwks_uri?: unknown };
    const uri = typeof body.jwks_uri === "string" ? body.jwks_uri.trim() : "";
    if (uri === "") return null;
    // The document is fetched over TLS from the AS, so its contents are as
    // trusted as the AS itself — but a cleartext jwks_uri would move the whole
    // trust root onto an unauthenticated channel, whatever the document says.
    //
    // Loopback is exempt, exactly as `assertHttpUrl` exempts it for the SSO
    // base: a local dev AS is not a network path. Without the exemption a
    // loopback AS advertises keys this resolver refuses, falls back to the
    // vendor guess, and every request 503s — which is the very failure this
    // module exists to end (found writing the adversarial suite, #33).
    const parsed = new URL(uri);
    return parsed.protocol === "https:" || isLoopback(parsed.hostname) ? uri : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve where to fetch signing keys from.
 *
 * Never throws: an AS that cannot be reached at boot is a network condition,
 * not a reason to refuse to start. It falls back to the vendor path and says
 * so, so the operator learns the cause from the boot line rather than from a
 * per-request 503 that names nothing.
 */
export async function resolveJwks(
  opts: { ssoUrl: string; explicitJwksUrl?: string | undefined },
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<JwksResolution> {
  const explicit = (opts.explicitJwksUrl ?? "").trim();
  if (explicit !== "") return { url: explicit, source: "explicit", advisory: null };

  for (const metadata of metadataUrls(opts.ssoUrl)) {
    const uri = await readJwksUri(metadata, fetchImpl);
    if (uri === null) continue;
    const source: JwksSource = metadata.includes("openid-configuration")
      ? "openid-configuration"
      : "oauth-authorization-server";
    return { url: uri, source, advisory: null };
  }

  return {
    url: `${opts.ssoUrl.replace(/\/+$/, "")}/api/auth/jwks`,
    source: "vendor-fallback",
    advisory:
      `auth: could not discover this SSO's jwks_uri — neither RFC 8414 ` +
      `(/.well-known/oauth-authorization-server) nor OpenID Discovery ` +
      `(/.well-known/openid-configuration) answered with one. Falling back to ` +
      `Better Auth's layout, which is a GUESS: if your SSO is anything else, every ` +
      `request will fail token verification. Set KSOR_JWKS_URL to the exact JWKS ` +
      `endpoint to remove the guess.`,
  };
}
