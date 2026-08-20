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
