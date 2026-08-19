import { describe, expect, it } from "vitest";

import { allowedHosts } from "./http.js";

/**
 * Host-validation allowlist for the loopback door (the DNS-rebind default).
 * Every loopback spelling arms it; a public bind returns null (bearer-gated,
 * not Host-gated). Regression guard for review finding #6 — an origins-only
 * config once produced an empty allowlist and re-opened the hole.
 */
describe("allowedHosts — the loopback rebind allowlist", () => {
  it("arms for every loopback spelling, with all host:port forms", () => {
    for (const host of ["127.0.0.1", "localhost", "::1"]) {
      const set = allowedHosts({ host, port: 8080 });
      expect(set, `host ${host}`).not.toBeNull();
      expect(set?.has("127.0.0.1:8080"), host).toBe(true);
      expect(set?.has("localhost:8080"), host).toBe(true);
      expect(set?.has("[::1]:8080"), host).toBe(true);
      // an evil rebind Host is rejected
      expect(set?.has("evil.example.com"), host).toBe(false);
    }
  });

  it("a public bind is not Host-gated (null) — it is bearer-gated instead", () => {
    expect(allowedHosts({ host: "0.0.0.0", port: 8080 })).toBeNull();
  });
});
