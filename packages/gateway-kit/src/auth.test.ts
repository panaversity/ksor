// The fail-closed acceptance list mirrored from the predecessor's
// test_gateway_smoke.py (auth cases) plus the bearer-verifier cache contract
// from sor-platform auth.py — pure: jose's network path is replaced by the
// verifyJwt seam.

import { errors as joseErrors } from "jose";
import { describe, expect, it, vi } from "vitest";

import {
  AuthConfigError,
  audOk,
  buildAuth,
  currentActor,
  currentIdentity,
  runWithIdentity,
  TokenVerifyError,
  type AuthPublic,
  type TokenClaims,
  type VerifiedIdentity,
  type VerifierDeps,
} from "./auth.js";

const SSO_ENV = {
  KSOR_SSO_URL: "https://auth.example.org",
  KSOR_MCP_RESOURCE_URL: "https://content.example.org/mcp",
  KSOR_JWT_ALLOWED_AUDIENCES: "https://content.example.org/mcp, https://alt.example.org/mcp",
};

function publicAuth(
  deps: VerifierDeps,
  env: Record<string, string | undefined> = SSO_ENV,
): AuthPublic {
  const auth = buildAuth(env, deps);
  if (auth.mode !== "public") throw new Error(`expected public mode, got ${auth.mode}`);
  return auth;
}

describe("buildAuth postures (the smoke-test list)", () => {
  it("public door wires the verifier when the full SSO env is present", () => {
    const auth = buildAuth(SSO_ENV);
    expect(auth.mode, "full SSO env must open the public door").toBe("public");
    if (auth.mode !== "public") return;
    expect(typeof auth.verify).toBe("function");
    expect(auth.config.allowedAudiences).toEqual([
      "https://content.example.org/mcp",
      "https://alt.example.org/mcp",
    ]);
    expect(auth.config.issuer).toBeNull();
  });

  it("strips trailing slashes from KSOR_SSO_URL (issuer derivation)", () => {
    const auth = publicAuth({}, { ...SSO_ENV, KSOR_SSO_URL: "https://auth.example.org///" });
    expect(auth.config.ssoUrl).toBe("https://auth.example.org");
  });

  it("refuses a scheme-less KSOR_SSO_URL at boot — never a per-request 503", () => {
    // Without this the TypeError from new URL(...) only escapes on the first
    // bearer, misclassified transient → permanent 503 (review 2026-08-19).
    expect(() => buildAuth({ ...SSO_ENV, KSOR_SSO_URL: "auth.example.org" })).toThrowError(
      AuthConfigError,
    );
    expect(() => buildAuth({ ...SSO_ENV, KSOR_SSO_URL: "auth.example.org" })).toThrowError(
      /KSOR_SSO_URL/,
    );
  });

  it("refuses a malformed KSOR_MCP_RESOURCE_URL at boot", () => {
    expect(() => buildAuth({ ...SSO_ENV, KSOR_MCP_RESOURCE_URL: "not a url" })).toThrowError(
      AuthConfigError,
    );
  });

  it("runs unauthenticated ONLY with an explicit posture", () => {
    expect(buildAuth({ KSOR_AUTH: "disabled-local" })).toEqual({
      mode: "disabled",
      publicAllowed: false,
    });
    expect(buildAuth({ KSOR_AUTH: "disabled-public" })).toEqual({
      mode: "disabled",
      publicAllowed: true,
    });
  });

  // The whole reason for one variable instead of two booleans: the VALUE says
  // which posture, so no combination of flags can express a state nobody meant.
  it("refuses a posture it does not recognise, rather than guessing", () => {
    for (const value of ["1", "true", "disabled", "public", "yes"]) {
      expect(() => buildAuth({ KSOR_AUTH: value }), value).toThrowError(AuthConfigError);
      expect(() => buildAuth({ KSOR_AUTH: value }), value).toThrowError(/is not a posture/);
    }
  });

  // An operator following an old runbook gets told what replaced it — not
  // "auth is not configured", which is true and tells them nothing.
  it("names the retired variables instead of ignoring them", () => {
    for (const retired of ["KSOR_AUTH_DISABLED", "KSOR_ALLOW_PUBLIC_UNAUTHENTICATED"]) {
      expect(() => buildAuth({ [retired]: "1" }), retired).toThrowError(
        /have been replaced by one variable, KSOR_AUTH/,
      );
    }
  });

  it("an explicit posture beats SSO config, and warns", () => {
    const warn = vi.fn();
    expect(buildAuth({ ...SSO_ENV, KSOR_AUTH: "disabled-local" }, { warn })).toEqual({
      mode: "disabled",
      publicAllowed: false,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("UNAUTHENTICATED"));
  });

  it("partial SSO env fails closed, never serves open", () => {
    const partial = { KSOR_SSO_URL: "https://auth.example.org" }; // resource URL dropped
    expect(() => buildAuth(partial)).toThrowError(AuthConfigError);
    expect(() => buildAuth(partial)).toThrowError(/refusing to boot unauthenticated/);
  });

  it("no auth env at all refuses to boot", () => {
    expect(() => buildAuth({})).toThrowError(AuthConfigError);
  });

  it("an empty audience allowlist refuses to boot (confused deputy)", () => {
    const env = { ...SSO_ENV, KSOR_JWT_ALLOWED_AUDIENCES: " , ," };
    expect(() => buildAuth(env)).toThrowError(AuthConfigError);
    expect(() => buildAuth(env)).toThrowError(/KSOR_JWT_ALLOWED_AUDIENCES/);
  });

  it("only the literal '1' disables auth", () => {
    expect(() => buildAuth({ KSOR_AUTH_DISABLED: "true" })).toThrowError(AuthConfigError);
    expect(() =>
      buildAuth({ ...SSO_ENV, KSOR_AUTH_DISABLED: "0", KSOR_JWT_ALLOWED_AUDIENCES: "" }),
    ).toThrowError(AuthConfigError);
  });
});

const T0 = 1_000_000;
const JWTISH = (tag: string): string => `${tag}.payload.sig`; // three dot-segments

function goodClaims(overrides: Partial<TokenClaims> = {}): TokenClaims {
  return {
    sub: "user-1",
    exp: T0 + 3600,
    aud: "https://content.example.org/mcp",
    azp: "client-a",
    tenant_id: "t1",
    email: "u@example.org",
    name: "User One",
    ...overrides,
  };
}

describe("verify — identity mapping", () => {
  it("a verified token yields the identity (server-injected, never a tool argument)", async () => {
    const verifyJwt = vi.fn(async () => goodClaims());
    const { verify } = publicAuth({ verifyJwt, now: () => T0 });
    const identity = await verify(JWTISH("a"));
    expect(identity).toEqual({
      sub: "user-1",
      clientId: "client-a",
      expiresAt: T0 + 3600,
      tenantId: "t1",
      email: "u@example.org",
      name: "User One",
      claims: goodClaims(),
    });
  });

  it("clientId falls back azp → client_id → ''", async () => {
    const cases: [Partial<TokenClaims>, string][] = [
      [{ azp: "azp-1", client_id: "cid-1" }, "azp-1"],
      [{ azp: undefined, client_id: "cid-1" }, "cid-1"],
      [{ azp: undefined, client_id: undefined }, ""],
    ];
    for (const [overrides, expected] of cases) {
      const verifyJwt = vi.fn(async () => goodClaims(overrides));
      const { verify } = publicAuth({ verifyJwt, now: () => T0 });
      const identity = await verify(JWTISH(`client-${expected}`));
      expect(identity.clientId, `overrides: ${JSON.stringify(overrides)}`).toBe(expected);
    }
  });

  it("aud may be a list — any allow-listed member passes", async () => {
    const verifyJwt = vi.fn(async () =>
      goodClaims({ aud: ["https://other.example.org", "https://alt.example.org/mcp"] }),
    );
    const { verify } = publicAuth({ verifyJwt, now: () => T0 });
    await expect(verify(JWTISH("list-aud"))).resolves.toMatchObject({ sub: "user-1" });
  });

  it("audOk accepts string-or-list and nothing else", () => {
    expect(audOk("a", ["a", "b"])).toBe(true);
    expect(audOk(["x", "b"], ["a", "b"])).toBe(true);
    expect(audOk(["x"], ["a", "b"])).toBe(false);
    expect(audOk(undefined, ["a"])).toBe(false);
    expect(audOk(42, ["42"])).toBe(false);
  });
});

describe("verify — the three cache behaviors (each bought with a production review)", () => {
  it("an aud outside the allowlist is rejected AND negatively cached", async () => {
    const verifyJwt = vi.fn(async () => goodClaims({ aud: "https://evil.example.org" }));
    const { verify } = publicAuth({ verifyJwt, now: () => T0 });
    await expect(verify(JWTISH("aud"))).rejects.toThrowError(/not in allowlist/);
    await expect(verify(JWTISH("aud"))).rejects.toThrowError(TokenVerifyError);
    expect(verifyJwt, "the rejection must be served from the negative cache").toHaveBeenCalledTimes(
      1,
    );
  });

  it("a bad token is negatively cached for 60s, then re-checked", async () => {
    let t = T0;
    const verifyJwt = vi.fn(async (): Promise<TokenClaims> => {
      throw new joseErrors.JWSSignatureVerificationFailed("signature verification failed");
    });
    const { verify } = publicAuth({ verifyJwt, now: () => t });
    const err = await verify(JWTISH("forged")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TokenVerifyError);
    expect((err as TokenVerifyError).transient, "a bad signature is not transient").toBe(false);
    await expect(verify(JWTISH("forged"))).rejects.toThrowError(/negatively cached/);
    expect(verifyJwt).toHaveBeenCalledTimes(1);
    t = T0 + 61; // past NEG_TTL — one crypto check per minute, not a permanent latch
    await expect(verify(JWTISH("forged"))).rejects.toThrowError(TokenVerifyError);
    expect(verifyJwt).toHaveBeenCalledTimes(2);
  });

  it("a transient JWKS failure fails closed but is NEVER negatively cached", async () => {
    const claims = goodClaims();
    const verifyJwt = vi
      .fn(async () => claims)
      .mockRejectedValueOnce(new Error("fetch failed: ECONNREFUSED"));
    const { verify } = publicAuth({ verifyJwt, now: () => T0 });
    const err = await verify(JWTISH("blip")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TokenVerifyError);
    expect((err as TokenVerifyError).transient).toBe(true);
    // The SAME bearer is re-admitted the instant JWKS recovers — no 60s latch.
    await expect(verify(JWTISH("blip"))).resolves.toMatchObject({ sub: "user-1" });
    expect(verifyJwt).toHaveBeenCalledTimes(2);
  });

  it("JWKSNoMatchingKey (rotation lag) is transient, not a cached rejection", async () => {
    const verifyJwt = vi.fn(async (): Promise<TokenClaims> => {
      throw new joseErrors.JWKSNoMatchingKey();
    });
    const { verify } = publicAuth({ verifyJwt, now: () => T0 });
    const err = await verify(JWTISH("rotating")).catch((e: unknown) => e);
    expect((err as TokenVerifyError).transient).toBe(true);
    await expect(verify(JWTISH("rotating"))).rejects.toThrowError(TokenVerifyError);
    expect(verifyJwt, "transient failures must never be served from a cache").toHaveBeenCalledTimes(
      2,
    );
  });

  it("a verified identity is positively cached: min(60s, exp − now)", async () => {
    let t = T0;
    const verifyJwt = vi.fn(async () => goodClaims());
    const { verify } = publicAuth({ verifyJwt, now: () => t });
    await verify(JWTISH("hot"));
    await verify(JWTISH("hot"));
    expect(verifyJwt, "the second call must hit the positive cache").toHaveBeenCalledTimes(1);
    t = T0 + 61; // past POS_TTL
    await verify(JWTISH("hot"));
    expect(verifyJwt).toHaveBeenCalledTimes(2);
  });

  it("the positive cache never outlives the token's own exp", async () => {
    let t = T0;
    const verifyJwt = vi.fn(async () => goodClaims({ exp: T0 + 10 }));
    const { verify } = publicAuth({ verifyJwt, now: () => t });
    await verify(JWTISH("short"));
    t = T0 + 11;
    const err = await verify(JWTISH("short")).catch((e: unknown) => e);
    expect(verifyJwt, "an expired cache entry must re-verify").toHaveBeenCalledTimes(2);
    // The mock still hands back the expired claims; the REAL jose path throws
    // JWTExpired here — either way nothing is served from the cache.
    expect(err).toMatchObject({ sub: "user-1" });
  });

  it("an identity already past exp is returned but never cached", async () => {
    const verifyJwt = vi.fn(async () => goodClaims({ exp: T0 - 5 }));
    const { verify } = publicAuth({ verifyJwt, now: () => T0 });
    await verify(JWTISH("past"));
    await verify(JWTISH("past"));
    expect(verifyJwt).toHaveBeenCalledTimes(2);
  });

  it("a non-JWT bearer is rejected without touching JWKS, and cached", async () => {
    const verifyJwt = vi.fn(async () => goodClaims());
    const { verify } = publicAuth({ verifyJwt, now: () => T0 });
    await expect(verify("not-a-jwt")).rejects.toThrowError(/not a JWT or missing sub/);
    await expect(verify("not-a-jwt")).rejects.toThrowError(/negatively cached/);
    expect(verifyJwt).not.toHaveBeenCalled();
  });

  it("missing sub rejects (exp+sub are required claims)", async () => {
    const verifyJwt = vi.fn(async () => goodClaims({ sub: undefined }));
    const { verify } = publicAuth({ verifyJwt, now: () => T0 });
    const err = await verify(JWTISH("nosub")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TokenVerifyError);
    expect((err as TokenVerifyError).transient).toBe(false);
  });

  it("the caches are bounded: FIFO eviction at 4096 entries", async () => {
    const verifyJwt = vi.fn(async () => goodClaims());
    const { verify } = publicAuth({ verifyJwt, now: () => T0 });
    for (let i = 0; i < 4097; i += 1) await verify(JWTISH(`t${i}`));
    expect(verifyJwt).toHaveBeenCalledTimes(4097);
    await verify(JWTISH("t0")); // evicted by the 4097th accept → re-verified
    expect(verifyJwt, "the oldest entry must have been FIFO-evicted").toHaveBeenCalledTimes(4098);
    await verify(JWTISH("t4096")); // still cached
    expect(verifyJwt).toHaveBeenCalledTimes(4098);
  });
});

describe("per-request identity resolvers (M-2)", () => {
  const identity: VerifiedIdentity = {
    sub: "user-9",
    clientId: "client-z",
    expiresAt: null,
    tenantId: null,
    email: null,
    name: null,
    claims: { sub: "user-9" },
  };

  it("currentActor reads the server-injected identity inside runWithIdentity", () => {
    expect(runWithIdentity(identity, () => currentActor())).toBe("user-9");
    expect(runWithIdentity(identity, () => currentIdentity())).toEqual(identity);
  });

  it("is null outside an identity scope (unauthenticated request)", () => {
    expect(currentActor()).toBeNull();
    expect(currentIdentity()).toBeNull();
  });
});

/**
 * Cleartext is refused where the CONTENT of the URL is trusted, and only
 * there. The distinction is the whole finding: the JWKS behind the SSO base is
 * the bearer gate's trust root, while the resource URL is an identifier that
 * gets string-compared against a token's `aud` and echoed in a challenge.
 */
describe("cleartext http:// — refused for what is fetched, allowed for what is compared", () => {
  it("refuses a remote cleartext SSO base (its JWKS is the trust root)", () => {
    expect(() => buildAuth({ ...SSO_ENV, KSOR_SSO_URL: "http://sso.example.org" })).toThrowError(
      /trust root|cleartext/i,
    );
  });

  it("refuses a remote cleartext KSOR_JWKS_URL for the same reason", () => {
    expect(() =>
      buildAuth({ ...SSO_ENV, KSOR_JWKS_URL: "http://keys.example.org/jwks" }),
    ).toThrowError(/trust root|cleartext/i);
  });

  it("ALLOWS a cleartext resource URL — it is compared, never fetched", () => {
    // The real deployment this blocked: a gateway behind a TLS-terminating
    // proxy whose canonical resource identifier is the internal http:// URL.
    const auth = buildAuth({
      ...SSO_ENV,
      KSOR_MCP_RESOURCE_URL: "http://content.internal:8080/mcp",
    });
    expect(auth.mode).toBe("public");
  });

  it("still refuses a resource URL that is not a URL at all", () => {
    expect(() => buildAuth({ ...SSO_ENV, KSOR_MCP_RESOURCE_URL: "not a url" })).toThrowError(
      /valid URL/i,
    );
  });
});

/**
 * A token from ANOTHER authorization server is a refusal, not an outage.
 *
 * An unknown `kid` raises `JWKSNoMatchingKey`, which is classified transient —
 * correctly, because the usual cause is key-rotation lag and the right answer is
 * "retry, do not cache". But a token minted by a DIFFERENT issuer produces the
 * same error, and a client then sees 503 "service unavailable" for a credential
 * that can never work: it retries forever, and a misconfiguration reads as an
 * outage in every dashboard. #26 predicted this exact shape — "silently fails
 * against every other with a rotation-lag-shaped error" — and it was reproduced
 * against a real Ory Hydra door presented with a real Keycloak token: 503.
 *
 * So when the operator has stated the issuer, the cheap decisive check runs
 * first. The `iss` here is read from an UNVERIFIED payload, which is sound for
 * exactly one purpose — REFUSING. It can never admit anything: a token that
 * passes this check still has its signature verified in full below.
 */
describe("a token from another issuer is refused, not reported as unavailable", () => {
  const ISS_ENV = { ...SSO_ENV, KSOR_SSO_ISSUER: "https://auth.example.org" };

  /** A token whose payload really is base64url JSON, so `iss` is readable. */
  const tokenIssuedBy = (iss: string): string => {
    const payload = Buffer.from(JSON.stringify({ iss, sub: "user-1", aud: "x" })).toString(
      "base64url",
    );
    return `header.${payload}.signature`;
  };

  it("refuses a foreign issuer WITHOUT calling the verifier at all", async () => {
    const verifyJwt = vi.fn(async (): Promise<TokenClaims> => {
      throw new joseErrors.JWKSNoMatchingKey();
    });
    const { verify } = publicAuth({ verifyJwt, now: () => T0 }, ISS_ENV);
    const err = await verify(tokenIssuedBy("https://SOMEONE-ELSE.example.com")).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(TokenVerifyError);
    expect(
      (err as TokenVerifyError).transient,
      "a foreign issuer can never become valid by retrying",
    ).toBe(false);
    expect(
      verifyJwt,
      "and it costs no JWKS fetch — the issuer settles it before any crypto",
    ).not.toHaveBeenCalled();
  });

  it("names the issuer it got and the one it expects", async () => {
    const { verify } = publicAuth({ verifyJwt: async () => goodClaims(), now: () => T0 }, ISS_ENV);
    const err = await verify(tokenIssuedBy("https://SOMEONE-ELSE.example.com")).catch(
      (e: unknown) => e,
    );
    expect(String((err as Error).message)).toMatch(/SOMEONE-ELSE\.example\.com/);
    expect(String((err as Error).message)).toMatch(/auth\.example\.org/);
  });

  it("lets the RIGHT issuer through to real verification", async () => {
    const verifyJwt = vi.fn(async () => goodClaims());
    const { verify } = publicAuth({ verifyJwt, now: () => T0 }, ISS_ENV);
    await expect(verify(tokenIssuedBy("https://auth.example.org"))).resolves.toMatchObject({
      sub: "user-1",
    });
    expect(verifyJwt, "the signature is still checked in full").toHaveBeenCalledTimes(1);
  });

  it("keeps rotation lag transient when the issuer MATCHES", async () => {
    // The behaviour the existing test protects, unchanged: same issuer, unknown
    // kid, so this really might be rotation lag and retrying really might work.
    const verifyJwt = vi.fn(async (): Promise<TokenClaims> => {
      throw new joseErrors.JWKSNoMatchingKey();
    });
    const { verify } = publicAuth({ verifyJwt, now: () => T0 }, ISS_ENV);
    const err = await verify(tokenIssuedBy("https://auth.example.org")).catch((e: unknown) => e);
    expect((err as TokenVerifyError).transient).toBe(true);
  });

  it("says nothing about issuers when the operator has not declared one", async () => {
    // KSOR_SSO_ISSUER unset means the operator has not stated it, and this check
    // has no ground to stand on. Unchanged behaviour, deliberately.
    const verifyJwt = vi.fn(async (): Promise<TokenClaims> => {
      throw new joseErrors.JWKSNoMatchingKey();
    });
    const { verify } = publicAuth({ verifyJwt, now: () => T0 });
    const err = await verify(tokenIssuedBy("https://SOMEONE-ELSE.example.com")).catch(
      (e: unknown) => e,
    );
    expect((err as TokenVerifyError).transient).toBe(true);
  });
});
