import { describe, expect, it } from "vitest";

import { resolveSecurity } from "./http.js";

/**
 * Host-validation allowlist for the loopback door (the DNS-rebind default).
 * Every loopback spelling arms it; a public bind returns null (bearer-gated,
 * not Host-gated). Regression guard for review finding #6 — an origins-only
 * config once produced an empty allowlist and re-opened the hole.
 */
describe("resolveSecurity — the loopback rebind allowlist (Host + Origin)", () => {
  it("arms the Host gate for every loopback spelling, with all host:port forms", () => {
    for (const host of ["127.0.0.1", "localhost", "::1"]) {
      const { hosts } = resolveSecurity({ host, port: 8080 });
      expect(hosts, `host ${host}`).not.toBeNull();
      expect(hosts?.has("127.0.0.1:8080"), host).toBe(true);
      expect(hosts?.has("localhost:8080"), host).toBe(true);
      expect(hosts?.has("[::1]:8080"), host).toBe(true);
      expect(hosts?.has("evil.example.com"), host).toBe(false);
    }
  });

  it("a public bind is not Host-gated (null) — it is bearer-gated instead", () => {
    expect(resolveSecurity({ host: "0.0.0.0", port: 8080 }).hosts).toBeNull();
  });

  it("an origins-only config STILL Host-gates on loopback (no empty-allowlist bypass)", () => {
    process.env["KSOR_ALLOWED_ORIGINS"] = "https://claude.ai";
    try {
      const s = resolveSecurity({ host: "127.0.0.1", port: 8080 });
      // Host gate is NOT dropped to an empty allowlist (the review-6 hole)
      expect(s.hosts, "loopback host gate must remain armed").not.toBeNull();
      expect(s.hosts?.has("127.0.0.1:8080")).toBe(true);
      // and the Origin gate is honored
      expect(s.origins?.has("https://claude.ai")).toBe(true);
    } finally {
      delete process.env["KSOR_ALLOWED_ORIGINS"];
    }
  });

  it("an explicit hosts+origins config is honored on a public bind", () => {
    process.env["KSOR_ALLOWED_HOSTS"] = "mcp.acme.com";
    process.env["KSOR_ALLOWED_ORIGINS"] = "https://claude.ai";
    try {
      const s = resolveSecurity({ host: "0.0.0.0", port: 443 });
      expect(s.hosts?.has("mcp.acme.com")).toBe(true);
      expect(s.origins?.has("https://claude.ai")).toBe(true);
    } finally {
      delete process.env["KSOR_ALLOWED_HOSTS"];
      delete process.env["KSOR_ALLOWED_ORIGINS"];
    }
  });
});
