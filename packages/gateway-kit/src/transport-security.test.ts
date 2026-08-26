import { describe, expect, it } from "vitest";

import { transportSecurityFromEnv } from "./transport-security.js";

describe("transportSecurityFromEnv — the opt-in DNS-rebind gate", () => {
  it("is null when both vars are unset or empty (no gate; the edge fronts the service)", () => {
    expect(transportSecurityFromEnv({})).toBeNull();
    expect(
      transportSecurityFromEnv({ KSOR_ALLOWED_HOSTS: "", KSOR_ALLOWED_ORIGINS: " , ," }),
    ).toBeNull();
  });

  it("arms the gate when hosts are set", () => {
    expect(transportSecurityFromEnv({ KSOR_ALLOWED_HOSTS: "content.example.org" })).toEqual({
      enableDnsRebindingProtection: true,
      allowedHosts: ["content.example.org"],
      allowedOrigins: [],
    });
  });

  it("arms the gate when only origins are set", () => {
    expect(transportSecurityFromEnv({ KSOR_ALLOWED_ORIGINS: "https://claude.ai" })).toEqual({
      enableDnsRebindingProtection: true,
      allowedHosts: [],
      allowedOrigins: ["https://claude.ai"],
    });
  });

  it("comma-splits, trims, and drops empties", () => {
    const settings = transportSecurityFromEnv({
      KSOR_ALLOWED_HOSTS: " a.example , b.example ,,",
      KSOR_ALLOWED_ORIGINS: "https://a.example,  https://b.example",
    });
    expect(settings, `settings: ${JSON.stringify(settings)}`).toEqual({
      enableDnsRebindingProtection: true,
      allowedHosts: ["a.example", "b.example"],
      allowedOrigins: ["https://a.example", "https://b.example"],
    });
  });
});

describe("the allowlist matches the way HTTP compares these values", () => {
  // Host is case-insensitive (RFC 9110 §4.2.3) and so are an origin's scheme
  // and host (RFC 6454 §4), but the allowlist was an exact `Set` lookup over
  // trimmed-only strings. So `KSOR_ALLOWED_HOSTS=MCP.Acme.com` — a perfectly
  // ordinary way to write a hostname — 421'd every client that resolved it,
  // and the refusal named neither the value nor the variable. A total outage
  // from a valid setting (review finding 4).
  it("lower-cases the hosts it was given", () => {
    const settings = transportSecurityFromEnv({
      KSOR_ALLOWED_HOSTS: "MCP.Acme.com, API.Example.ORG",
    });
    expect(settings?.allowedHosts).toEqual(["mcp.acme.com", "api.example.org"]);
  });

  it("lower-cases the origins too, scheme included", () => {
    const settings = transportSecurityFromEnv({ KSOR_ALLOWED_ORIGINS: "HTTPS://MCP.Acme.com" });
    expect(settings?.allowedOrigins).toEqual(["https://mcp.acme.com"]);
  });
});

describe("an origin is normalised through the parser, not by string handling", () => {
  it("accepts the form people copy out of a browser bar", () => {
    // `https://a.com/` became the allowlist entry "https://a.com/" while a
    // browser sends `Origin: https://a.com`, so the exact Set lookup in the
    // door 403'd every browser client — a total outage from a valid setting
    // (security review, 2026-08-25).
    expect(
      transportSecurityFromEnv({ KSOR_ALLOWED_ORIGINS: "https://a.com/" })?.allowedOrigins,
    ).toEqual(["https://a.com"]);
  });

  it("keeps a non-default port, which IS part of an origin", () => {
    expect(
      transportSecurityFromEnv({ KSOR_ALLOWED_ORIGINS: "https://a.com:8443/" })?.allowedOrigins,
    ).toEqual(["https://a.com:8443"]);
  });

  it("refuses a value that is not an origin at all, rather than never matching", () => {
    expect(() => transportSecurityFromEnv({ KSOR_ALLOWED_ORIGINS: "a.com" })).toThrowError(
      /not an origin/,
    );
  });
});
