import { describe, expect, it } from "vitest";

import {
  AUTHORIZE_PATH,
  DEFAULT_API_BASE,
  DEFAULT_AUTH_BASE,
  EXCHANGE_PATH,
  OrcaEndpointError,
  authorizeUrl,
  chatCompletionsUrl,
  exchangeUrl,
  isLoopbackHost,
  modelsUrl,
  parseOrigin,
  resolveEndpoints,
} from "./endpoints.js";

describe("the two origins are two origins", () => {
  it("defaults to the public auth origin and the public relay base", () => {
    const e = resolveEndpoints({});
    expect(e.authBase).toBe("https://www.orcarouter.ai");
    expect(e.apiBase).toBe("https://api.orcarouter.ai/v1");
    // Stated as its own assertion because "the API default already ends in /v1"
    // is the fact every caller composes against.
    expect(DEFAULT_API_BASE.endsWith("/v1")).toBe(true);
    expect(DEFAULT_AUTH_BASE.includes("/v1")).toBe(false);
  });

  it("never derives one origin from the other", () => {
    // The mistake this module exists to prevent. Swapping the hostname, or
    // appending /v1 to the auth base, must not be what produces either value.
    const e = resolveEndpoints({});
    expect(e.apiBase).not.toBe(`${e.authBase}/v1`);
    expect(e.apiBase).not.toContain("www.");
    expect(e.authBase).not.toContain("api.");
  });

  it("puts the exchange on the auth origin at /api/v1/auth/keys — never /v1/auth/keys", () => {
    const e = resolveEndpoints({});
    expect(exchangeUrl(e.authBase).toString()).toBe("https://www.orcarouter.ai/api/v1/auth/keys");
    expect(authorizeUrl(e.authBase).toString()).toBe("https://www.orcarouter.ai/auth");
    expect(AUTHORIZE_PATH).toBe("/auth");
    expect(EXCHANGE_PATH).toBe("/api/v1/auth/keys");
    // The specific 404 the spec calls the single most common integration
    // mistake: the relay is at /v1 and the auth endpoints are not.
    expect(exchangeUrl(e.authBase).toString()).not.toContain(".ai/v1/auth/keys");
  });

  it("puts inference and the catalog on the relay base", () => {
    const e = resolveEndpoints({});
    expect(modelsUrl(e.apiBase)).toBe("https://api.orcarouter.ai/v1/models");
    expect(chatCompletionsUrl(e.apiBase)).toBe("https://api.orcarouter.ai/v1/chat/completions");
  });
});

describe("overrides", () => {
  it("an explicit per-origin override wins over everything", () => {
    const e = resolveEndpoints({
      ORCA_BASE_URL: "https://shared.example.com",
      ORCA_AUTH_BASE_URL: "https://auth.example.com",
      ORCA_API_BASE_URL: "https://relay.example.com/v1",
    });
    expect(e.authBase).toBe("https://auth.example.com");
    expect(e.apiBase).toBe("https://relay.example.com/v1");
  });

  it("ORCA_BASE_URL is the shared self-hosted fallback for BOTH planes", () => {
    const e = resolveEndpoints({ ORCA_BASE_URL: "https://one-host.example.com" });
    expect(e.authBase).toBe("https://one-host.example.com");
    // /v1 is appended to the SHARED base only — never to the auth origin.
    expect(e.apiBase).toBe("https://one-host.example.com/v1");
  });

  it("the API override names the relay base INCLUDING /v1, as documented", () => {
    const e = resolveEndpoints({ ORCA_API_BASE_URL: "https://relay.example.com/v1" });
    expect(e.apiBase).toBe("https://relay.example.com/v1");
    expect(e.authBase).toBe("https://www.orcarouter.ai");
  });

  it("an empty string is unset, not an empty origin", () => {
    const e = resolveEndpoints({ ORCA_AUTH_BASE_URL: "", ORCA_API_BASE_URL: "" });
    expect(e.authBase).toBe(DEFAULT_AUTH_BASE);
    expect(e.apiBase).toBe(DEFAULT_API_BASE);
  });

  it("a trailing slash does not produce a doubled path", () => {
    const e = resolveEndpoints({ ORCA_API_BASE_URL: "https://relay.example.com/v1/" });
    expect(modelsUrl(e.apiBase)).toBe("https://relay.example.com/v1/models");
  });
});

describe("transport security at the door", () => {
  it("refuses http: on a remote host, for either origin", () => {
    expect(() => parseOrigin("http://orcarouter.example.com", "ORCA_BASE_URL")).toThrow(
      OrcaEndpointError,
    );
    expect(() => parseOrigin("http://orcarouter.example.com", "ORCA_AUTH_BASE_URL")).toThrow(
      /https:/,
    );
  });

  it("permits http: on loopback only — local development and nothing else", () => {
    for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
      expect(parseOrigin(`http://${host}:8080`, "ORCA_BASE_URL")).toBe(`http://${host}:8080`);
    }
  });

  it("recognises exactly the loopback hosts", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("127.0.0.1.evil.com")).toBe(false);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
  });

  it("refuses userinfo, which would leak a credential into the origin", () => {
    expect(() => parseOrigin("https://user:pass@orcarouter.ai", "ORCA_BASE_URL")).toThrow(
      /userinfo/,
    );
  });

  it("refuses something that is not a URL at all", () => {
    expect(() => parseOrigin("not a url", "ORCA_BASE_URL")).toThrow(OrcaEndpointError);
  });
});
