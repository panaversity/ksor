import { describe, expect, it } from "vitest";

import { loopbackSecurity } from "./http.js";

/**
 * Regression guard for review round 2, F2: the loopback rebind default
 * must arm for every loopback SPELLING, not a literal 127.0.0.1 — binding
 * by the name `localhost` once shipped with protection OFF.
 */
describe("loopbackSecurity — the DNS-rebind default", () => {
  it("arms for every loopback spelling", () => {
    for (const host of ["127.0.0.1", "localhost", "::1"]) {
      const security = loopbackSecurity({ host, port: 8080 });
      expect(security?.enableDnsRebindingProtection, `host ${host}`).toBe(true);
      expect(security?.allowedHosts, `host ${host}`).toContain("localhost:8080");
      expect(security?.allowedHosts, `host ${host}`).toContain("127.0.0.1:8080");
    }
  });

  it("does not arm a public bind — that door is bearer-gated instead", () => {
    expect(loopbackSecurity({ host: "0.0.0.0", port: 8080 })).toBeNull();
  });
});
