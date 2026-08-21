/**
 * Discovery makes any standards-compliant AS work unmodified.
 *
 * The verifier appended `/api/auth/jwks` — Better Auth's layout — to
 * `KSOR_SSO_URL`. Auth0, Okta, Entra, Keycloak and Cognito all publish
 * elsewhere, so all of them failed the fetch, which is classified transient,
 * so the door booted clean and 503'd every request naming nothing. The only
 * posture an operator could reach was the one that props the door open
 * (issue #26).
 *
 * Verified against three REAL providers on 2026-08-21 (not tested here — a
 * test that needs the network is a test that fails offline):
 *
 *   accounts.google.com                    RFC 8414   → googleapis.com/oauth2/v3/certs
 *   token.actions.githubusercontent.com    OIDC       → .../.well-known/jwks
 *   login.microsoftonline.com/common/v2.0  OIDC       → .../discovery/v2.0/keys
 *
 * Two of those matter beyond "it worked". Entra's issuer carries a PATH, which
 * is the case a naive `${sso}/.well-known/...` gets wrong; and Google's
 * jwks_uri is a DIFFERENT ORIGIN from its issuer, which a same-origin check
 * would have rejected — so the rule here is https-only, not same-origin.
 */

import { describe, expect, it, vi } from "vitest";

import { metadataUrls, resolveJwks } from "./jwks-discovery.js";

/** A fetch that answers only the URLs it is given, 404 for everything else. */
const serving = (docs: Record<string, unknown>) =>
  vi.fn(async (url: string) =>
    url in docs
      ? ({ ok: true, json: async () => docs[url] } as Response)
      : ({ ok: false, json: async () => ({}) } as Response),
  );

describe("where the metadata document lives", () => {
  it("uses the RFC 8414 shape: well-known BEFORE the issuer path", () => {
    // RFC 8414 §3 inserts the segment after the host. Appending it instead is
    // the mistake that makes multi-tenant issuers undiscoverable.
    expect(metadataUrls("https://sso.example.com/tenant-a")).toContain(
      "https://sso.example.com/.well-known/oauth-authorization-server/tenant-a",
    );
  });

  it("also tries the OIDC APPENDED shape, which real deployments serve", () => {
    expect(metadataUrls("https://sso.example.com/tenant-a")).toContain(
      "https://sso.example.com/tenant-a/.well-known/openid-configuration",
    );
  });

  it("does not duplicate when the issuer has no path", () => {
    const urls = metadataUrls("https://sso.example.com");
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("resolveJwks", () => {
  it("an explicit KSOR_JWKS_URL wins, and asks the network nothing", async () => {
    const fetchImpl = serving({});
    const r = await resolveJwks(
      { ssoUrl: "https://sso.example.com", explicitJwksUrl: "https://keys.example.com/jwks" },
      fetchImpl,
    );
    expect(r).toEqual({ url: "https://keys.example.com/jwks", source: "explicit", advisory: null });
    expect(
      fetchImpl,
      "an operator who said where must not be second-guessed",
    ).not.toHaveBeenCalled();
  });

  it("reads jwks_uri from an RFC 8414 document — the OAuth AS shape", async () => {
    const r = await resolveJwks(
      { ssoUrl: "https://sso.example.com" },
      serving({
        "https://sso.example.com/.well-known/oauth-authorization-server": {
          issuer: "https://sso.example.com",
          jwks_uri: "https://sso.example.com/oauth2/jwks",
        },
      }),
    );
    expect(r.url).toBe("https://sso.example.com/oauth2/jwks");
    expect(r.source).toBe("oauth-authorization-server");
    expect(r.advisory).toBeNull();
  });

  it("reads jwks_uri from an OIDC document — the shape Auth0 and Okta serve", async () => {
    const r = await resolveJwks(
      { ssoUrl: "https://acme.eu.auth0.com" },
      serving({
        "https://acme.eu.auth0.com/.well-known/openid-configuration": {
          jwks_uri: "https://acme.eu.auth0.com/.well-known/jwks.json",
        },
      }),
    );
    expect(r.url).toBe("https://acme.eu.auth0.com/.well-known/jwks.json");
    expect(r.source).toBe("openid-configuration");
  });

  it("falls back to the vendor path and SAYS it is a guess", async () => {
    const r = await resolveJwks({ ssoUrl: "https://sso.example.com/" }, serving({}));
    expect(r.url).toBe("https://sso.example.com/api/auth/jwks");
    expect(r.source).toBe("vendor-fallback");
    expect(r.advisory, "the cause the 503s never named").toContain("KSOR_JWKS_URL");
    expect(r.advisory).toContain("GUESS");
  });

  it("REFUSES a cleartext jwks_uri, whatever the document says", async () => {
    // The document is trusted only as far as the AS is; a cleartext keys
    // endpoint would move the whole trust root onto an unauthenticated channel.
    const r = await resolveJwks(
      { ssoUrl: "https://sso.example.com" },
      serving({
        "https://sso.example.com/.well-known/oauth-authorization-server": {
          jwks_uri: "http://sso.example.com/oauth2/jwks",
        },
      }),
    );
    expect(r.source, "a cleartext advertisement is not a discovery").toBe("vendor-fallback");
  });

  it("survives an unreachable AS rather than refusing to boot", async () => {
    const r = await resolveJwks(
      { ssoUrl: "https://sso.example.com" },
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    expect(r.source).toBe("vendor-fallback");
    expect(r.advisory).not.toBeNull();
  });

  it("ignores a document that answers without a jwks_uri", async () => {
    const r = await resolveJwks(
      { ssoUrl: "https://sso.example.com" },
      serving({
        "https://sso.example.com/.well-known/oauth-authorization-server": { issuer: "x" },
      }),
    );
    expect(r.source).toBe("vendor-fallback");
  });
});
