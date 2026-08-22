// The fail-closed auth seam for KSoR gateways, converted from the predecessor's
// sor-gateway-kit auth.py + sor-platform auth.py (decision 6). Three boot
// postures, decided by `buildAuth`, and only three:
//
// - public:   KSOR_SSO_URL + KSOR_MCP_RESOURCE_URL set AND KSOR_JWT_ALLOWED_AUDIENCES
//             non-empty — the OAuth Resource-Server door; the bearer is the gate.
// - disabled: KSOR_AUTH_DISABLED=1 — the ONLY unauthenticated path, a deliberate
//             operator act, never an accident of a missing var.
// - anything else THROWS AuthConfigError — refuse to boot, never serve the
//   public door open ("disabled by default" must never silently become an open
//   server — decision 7).
//
// Bearer verification is offline RS256/JWKS: signature + exp enforced, `aud`
// allow-listed here (the MCP spec puts audience validation on the resource
// server), issuer enforced only when KSOR_SSO_ISSUER is explicitly set. M-2:
// actor/client/tenant are server-injected from the verified bearer, never tool
// arguments.

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";

import { defaultWarn, type Env, type WarnLog } from "./env.js";
import { resolveJwks, type JwksResolution } from "./jwks-discovery.js";

export type AuthConfig = {
  /** The AS base; JWKS at `${ssoUrl}/api/auth/jwks`. */
  ssoUrl: string;
  /** This server's canonical URI (the RFC 8707 audience clients bind to). */
  resourceUrl: string;
  /**
   * The explicit `KSOR_JWKS_URL`, or null when the operator did not say.
   *
   * Null means DISCOVER — read `jwks_uri` from the AS's own metadata document
   * (RFC 8414, then OpenID Discovery) rather than appending one vendor's path.
   * When discovery is never run, the verifier falls back to one vendor's
   * layout (`${ssoUrl}/api/auth/jwks`, Better Auth's) — a guess, which is why
   * every other provider once failed the JWKS fetch as TRANSIENT with nothing
   * naming the cause (review 2026-08-20, issue #26).
   */
  explicitJwksUrl: string | null;
  allowedAudiences: readonly string[];
  /**
   * Enforced ONLY when KSOR_SSO_ISSUER is explicitly set — never defaulted to
   * ssoUrl: the JWKS signature (key fetched from THIS SSO's /api/auth/jwks)
   * already binds every accepted token to our SSO; an exact-string `iss` check
   * on top is redundant and brittle (the AS may stamp a base that is not its
   * discovery root). The aud allowlist is the per-resource gate.
   */
  issuer: string | null;
  /** Seconds. Also bounds the positive identity cache — see `POS_TTL_S`. */
  jwksCacheTtlS: number;
};

export type VerifiedIdentity = {
  sub: string;
  clientId: string;
  /** Unix seconds, from the token's `exp`. */
  expiresAt: number | null;
  tenantId: string | null;
  email: string | null;
  name: string | null;
  claims: Record<string, unknown>;
};

/** The decoded claims a JWT verifier yields (jose's JWTPayload is compatible). */
export type TokenClaims = {
  sub?: string;
  exp?: number;
  aud?: string | string[];
  [claim: string]: unknown;
};

export type Verify = (token: string) => Promise<VerifiedIdentity>;

export type AuthPublic = {
  mode: "public";
  config: AuthConfig;
  verify: Verify;
  /**
   * Where the signing keys actually come from, resolved ONCE and shared.
   *
   * Memoized so boot and the first verification agree and only one discovery
   * happens. Boot awaits it to report the source — a fallback that is a guess
   * has to say so THERE, because the alternative is what shipped: a clean boot
   * and a 503 per request naming nothing (issue #26).
   */
  jwks: () => Promise<JwksResolution>;
};
export type AuthDisabled = { mode: "disabled" };
export type Auth = AuthPublic | AuthDisabled;

/**
 * An auth MISCONFIGURATION at boot (missing SSO pair, empty audience
 * allowlist) — a DISTINCT type so the gateway can map exactly this class to a
 * clean operator line + exit 2 without catching every Error a build might
 * raise (the predecessor's blanket catch dressed genuine bugs in the
 * auth-misconfig costume and sent the on-call down the SSO ladder — PR #414
 * review).
 */
export class AuthConfigError extends Error {
  override readonly name: string = "AuthConfigError";
}

/**
 * A bearer failed verification. `transient: true` means verification was
 * UNAVAILABLE (JWKS fetch failure, key-rotation lag) rather than the token
 * being bad — the request still fails closed, but the token was NOT
 * negatively cached.
 */
export class TokenVerifyError extends Error {
  override readonly name: string = "TokenVerifyError";
  readonly transient: boolean;
  constructor(message: string, options: { transient: boolean; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.transient = options.transient;
  }
}

export type VerifierDeps = {
  /**
   * Test seam replacing the jose JWKS+RS256 path. Throw a jose error class to
   * signal a BAD token (negatively cached); any other throw is treated as a
   * transient verifier failure (fail closed, never cached).
   */
  verifyJwt?: (token: string) => Promise<TokenClaims>;
  /** Wall clock in seconds — injectable for cache-TTL tests. */
  now?: () => number;
  warn?: WarnLog;
};

/** `aud` may be a string or a list; any allow-listed member passes. */
export function audOk(aud: unknown, allowed: readonly string[]): boolean {
  const auds: unknown[] = Array.isArray(aud) ? aud : [aud];
  return auds.some((a) => typeof a === "string" && allowed.includes(a));
}

/**
 * A configured URL var must PARSE as an absolute http(s) URL at boot. Without
 * this, KSOR_SSO_URL=sso.example.com (no scheme) boots in public mode and the
 * TypeError from `new URL(...)` only escapes on the FIRST bearer, deep inside
 * verifyJwt — where isBadToken says false, so it is misclassified transient
 * and every request gets a permanent 503 while /health reports auth: public.
 * Fail closed at boot instead (review 2026-08-19).
 */
/**
 * `fetched` marks a URL whose CONTENT is trusted — the SSO base and the JWKS
 * URL, from which the bearer gate's signing keys are retrieved. Cleartext to a
 * remote host is refused for those, because anyone on the path could serve
 * their own keys.
 *
 * `KSOR_MCP_RESOURCE_URL` is NOT one: it is the resource IDENTIFIER the token's
 * `aud` is compared against and the `resource` advertised in the challenge —
 * a string that is compared, never fetched by this process. Refusing http://
 * there blocked a legitimate deployment (a gateway behind a TLS-terminating
 * proxy whose canonical resource id is the internal http:// URL) with a
 * security argument that does not apply to it (round-3 review of #43).
 */
function assertHttpUrl(name: string, value: string, fetched: boolean): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new AuthConfigError(
      `${name}=${JSON.stringify(value)} is not a valid URL — set an absolute https:// URL ` +
        "(a scheme-less value would boot the public door and then 503 every request).",
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AuthConfigError(`${name}=${JSON.stringify(value)} must be an http(s) URL.`);
  }
  // The JWKS fetched from this base is the ENTIRE trust root of the bearer
  // gate: over cleartext, anyone on the path substitutes the signing keys and
  // mints their own valid tokens. Loopback is exempt because it is a local dev
  // door, not a network path (review 2026-08-20).
  const loopback =
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "localhost" ||
    parsed.hostname === "::1" ||
    parsed.hostname === "[::1]";
  if (fetched && parsed.protocol === "http:" && !loopback) {
    throw new AuthConfigError(
      `${name}=${JSON.stringify(value)} is cleartext http:// to a remote host. The JWKS ` +
        "fetched from it is the whole trust root of the bearer gate — anyone on the path " +
        "could serve their own keys. Use https://, or point at loopback for local dev.",
    );
  }
}

function configFromEnv(env: Env): AuthConfig | null {
  // rstrip the SSO URL: a trailing slash makes the derived issuer
  // `https://sso/` mismatch the token's `iss` (`https://sso`) → total, silent
  // token rejection (predecessor review: sso-issuer-normalization).
  const ssoUrl = (env.KSOR_SSO_URL ?? "").trim().replace(/\/+$/, "");
  const resourceUrl = (env.KSOR_MCP_RESOURCE_URL ?? "").trim();
  if (ssoUrl === "" || resourceUrl === "") return null;
  // Both are used to build a `new URL(...)` later (the JWKS fetch and the
  // resource-metadata document); validate them HERE so a malformed value
  // refuses to boot, never 503s per-request.
  assertHttpUrl("KSOR_SSO_URL", ssoUrl, true);
  assertHttpUrl("KSOR_MCP_RESOURCE_URL", resourceUrl, false);
  const allowedAudiences = (env.KSOR_JWT_ALLOWED_AUDIENCES ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a !== "");
  const issuer = (env.KSOR_SSO_ISSUER ?? "").trim() || null;
  // Explicit when given; otherwise the vendor layout that used to be the only
  // option, so an existing Better Auth deployment keeps working unchanged.
  const explicit = (env.KSOR_JWKS_URL ?? "").trim();
  // Validated at BOOT even though only `explicitJwksUrl` is carried forward:
  // a malformed KSOR_JWKS_URL must refuse here, not at the first token.
  assertHttpUrl("KSOR_JWKS_URL", explicit || `${ssoUrl}/api/auth/jwks`, true);
  return {
    ssoUrl,
    resourceUrl,
    explicitJwksUrl: explicit === "" ? null : explicit,
    allowedAudiences,
    issuer,
    jwksCacheTtlS: 3600,
  };
}

/**
 * Decide the boot posture from env. Fail-closed: an incomplete SSO env (a
 * deploy edit that drops one var — `--set-env-vars` REPLACES the whole map)
 * must never silently boot the PUBLIC door unauthenticated, unmetered, and
 * audit-anonymous. Explicit KSOR_AUTH_DISABLED=1 is the only unauthenticated
 * path.
 */
export function buildAuth(env: Env = process.env, deps: VerifierDeps = {}): Auth {
  const warn = deps.warn ?? defaultWarn;
  const disabled = env.KSOR_AUTH_DISABLED === "1";
  const config = configFromEnv(env);
  if (disabled) {
    if (config !== null) {
      warn("auth DISABLED via KSOR_AUTH_DISABLED despite SSO config — UNAUTHENTICATED (dev)");
    }
    return { mode: "disabled" };
  }
  if (config === null) {
    throw new AuthConfigError(
      "auth is not configured (KSOR_SSO_URL / KSOR_MCP_RESOURCE_URL unset) and KSOR_AUTH_DISABLED " +
        "is not '1' — refusing to boot unauthenticated. Set both SSO env vars, or set " +
        "KSOR_AUTH_DISABLED=1 for a deliberate dev/unauthenticated run.",
    );
  }
  if (config.allowedAudiences.length === 0) {
    // FAIL CLOSED at boot, not warn-and-serve: aud is checked manually (not in
    // jwtVerify), so an empty allowlist would accept ANY token our SSO signed —
    // a token minted for another app reads this record (confused deputy).
    throw new AuthConfigError(
      "auth is ON but KSOR_JWT_ALLOWED_AUDIENCES is empty — set it to this server's MCP URL " +
        "(fail-closed: an unset audience allowlist would accept any SSO-signed token).",
    );
  }
  // One memoized resolution, shared by the boot log and the verifier.
  let resolution: Promise<JwksResolution> | null = null;
  const jwks = (): Promise<JwksResolution> => {
    resolution ??= resolveJwks({
      ssoUrl: config.ssoUrl,
      explicitJwksUrl: config.explicitJwksUrl ?? undefined,
    });
    return resolution;
  };
  return { mode: "public", config, verify: createVerify(config, deps, jwks), jwks };
}

const MAX_CACHE = 4096;
const NEG_TTL_S = 60;
// Positive-cache ceiling. claude.ai reuses ONE bearer across every turn of a
// conversation, so without this every request re-ran a full RS256 verify
// (predecessor hop review 2026-08-07). The effective TTL is
// min(POS_TTL, jwksCacheTtl, exp − now): the ONE revocation lever an RS256
// deployment has is pulling the signing key from the JWKS, which bites within
// jwksCacheTtl — the identity cache must never outlive that window (PR #416
// review: a flat 60s quietly extended a pulled key's acceptance), nor the
// token's own exp.
const POS_TTL_S = 60;

// A genuinely BAD token: bad signature, expired, malformed, disallowed alg, a
// failed claim check. Everything else (JWKSNoMatchingKey = rotation lag,
// JWKSTimeout, JWKSInvalid, fetch failures) is a TRANSIENT verifier failure.
function isBadToken(err: unknown): boolean {
  return (
    err instanceof joseErrors.JWTExpired ||
    err instanceof joseErrors.JWTClaimValidationFailed ||
    err instanceof joseErrors.JWTInvalid ||
    err instanceof joseErrors.JWSInvalid ||
    err instanceof joseErrors.JWSSignatureVerificationFailed ||
    err instanceof joseErrors.JOSEAlgNotAllowed ||
    err instanceof joseErrors.JOSENotSupported
  );
}

function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * THE one eviction policy, shared by both caches (the predecessor's two
 * hand-copied loops would drift — an eviction fix applied to one and not the
 * other only misbehaves under a token flood, where nothing flags it): sweep
 * expired entries, then FIFO-evict to make room.
 */
function prune<V>(cache: Map<string, V>, deadlineOf: (value: V) => number, now: number): void {
  if (cache.size < MAX_CACHE) return;
  for (const [key, value] of cache) {
    if (deadlineOf(value) <= now) cache.delete(key);
  }
  while (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next();
    if (oldest.done === true) break;
    cache.delete(oldest.value);
  }
}

function joseVerifyJwt(
  config: AuthConfig,
  jwksOf: () => Promise<JwksResolution>,
): (token: string) => Promise<TokenClaims> {
  // Lazy — no network at build time. jose caches the JWKS for jwksCacheTtl and
  // refetches on an unknown kid after its cooldown (key rotation).
  let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  return async (token: string): Promise<TokenClaims> => {
    if (jwks === null) {
      const resolved = await jwksOf();
      jwks = createRemoteJWKSet(new URL(resolved.url), {
        cacheMaxAge: config.jwksCacheTtlS * 1000,
      });
    }
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ["RS256"],
      // aud is deliberately NOT verified here — the manual allowlist in
      // `verify` is the per-resource gate (accepts a string-or-list aud).
      requiredClaims: ["exp", "sub"],
      ...(config.issuer === null ? {} : { issuer: config.issuer }),
    });
    return payload;
  };
}

function createVerify(
  config: AuthConfig,
  deps: VerifierDeps,
  jwksOf: () => Promise<JwksResolution>,
): Verify {
  const now = deps.now ?? ((): number => Date.now() / 1000);
  const verifyJwt = deps.verifyJwt ?? joseVerifyJwt(config, jwksOf);
  const rejected = new Map<string, number>();
  const accepted = new Map<string, { until: number; identity: VerifiedIdentity }>();

  const reject = (key: string): void => {
    prune(rejected, (deadline) => deadline, now());
    rejected.set(key, now() + NEG_TTL_S);
  };
  const accept = (key: string, identity: VerifiedIdentity): void => {
    let ttl = Math.min(POS_TTL_S, config.jwksCacheTtlS);
    if (identity.expiresAt !== null) ttl = Math.min(ttl, identity.expiresAt - now());
    if (ttl <= 0) return;
    prune(accepted, (entry) => entry.until, now());
    accepted.set(key, { until: now() + ttl, identity });
  };

  return async (token: string): Promise<VerifiedIdentity> => {
    // Hash ONCE per request; never key a cache on the raw token (PR #416).
    const key = sha256Hex(token);
    const rejectedUntil = rejected.get(key);
    if (rejectedUntil !== undefined && rejectedUntil > now()) {
      throw new TokenVerifyError("token rejected (negatively cached)", { transient: false });
    }
    const hit = accepted.get(key);
    if (hit !== undefined && hit.until > now()) return hit.identity;

    let claims: TokenClaims | null = null;
    if (token.split(".").length === 3) {
      try {
        claims = await verifyJwt(token);
      } catch (err) {
        if (!isBadToken(err)) {
          // A TRANSIENT verifier failure — a JWKS fetch/connection error,
          // key-rotation lag, or SSO cold start. Fail closed for THIS request
          // but do NOT negatively cache: a VALID bearer must be re-admitted
          // the instant JWKS recovers (claude.ai reuses one bearer across a
          // whole conversation) — caching the failure would amplify a
          // sub-second dependency blip into minutes of 401.
          throw new TokenVerifyError(
            `token verification unavailable (transient, NOT cached): ${describeError(err)}`,
            { transient: true, cause: err },
          );
        }
        // Negatively cache the genuinely bad token so a replayed forgery costs
        // one crypto check per NEG_TTL, not one per request.
        reject(key);
        throw new TokenVerifyError(`token rejected: ${describeError(err)}`, {
          transient: false,
          cause: err,
        });
      }
      if (!audOk(claims.aud, config.allowedAudiences)) {
        reject(key);
        throw new TokenVerifyError(
          `token aud ${JSON.stringify(claims.aud ?? null)} not in allowlist ` +
            `${JSON.stringify(config.allowedAudiences)}`,
          { transient: false },
        );
      }
    }
    const subClaim: unknown = claims?.["sub"];
    if (claims === null || !subClaim) {
      reject(key);
      throw new TokenVerifyError("token rejected: not a JWT or missing sub", { transient: false });
    }
    const exp: unknown = claims["exp"];
    const clientId: unknown = claims["azp"] || claims["client_id"] || "";
    const optional = (value: unknown): string | null => (typeof value === "string" ? value : null);
    const identity: VerifiedIdentity = {
      sub: String(subClaim),
      clientId: String(clientId),
      expiresAt: typeof exp === "number" ? Math.trunc(exp) : null,
      tenantId: optional(claims["tenant_id"]),
      email: optional(claims["email"]),
      name: optional(claims["name"]),
      claims,
    };
    accept(key, identity);
    return identity;
  };
}

// ---------------------------------------------------------- per-request identity resolvers
// Adapted from the predecessor's SDK auth-context resolvers: the gateway wraps
// each authenticated request in `runWithIdentity` after `verify` accepts the
// bearer; tools then read `currentActor()` — the actor is server-injected from
// the verified bearer, never a tool argument (M-2).

const identityStorage = new AsyncLocalStorage<VerifiedIdentity>();

export function runWithIdentity<T>(identity: VerifiedIdentity, fn: () => T): T {
  return identityStorage.run(identity, fn);
}

/** The verified bearer's identity, or null when the request is unauthenticated. */
export function currentIdentity(): VerifiedIdentity | null {
  return identityStorage.getStore() ?? null;
}

export function currentActor(): string | null {
  return currentIdentity()?.sub ?? null;
}
