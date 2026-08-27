import { describe, expect, it } from "vitest";

import { rebindRefusal, resolveSecurity } from "./http.js";

/**
 * Host-validation allowlist for the loopback door (the DNS-rebind default).
 * Every loopback spelling arms it; a public bind returns null (bearer-gated,
 * not Host-gated). Regression guard for review finding #6 — an origins-only
 * config once produced an empty allowlist and re-opened the hole.
 */
describe("resolveSecurity — the loopback rebind allowlist (Host + Origin)", () => {
  // RFC 9110: clients OMIT the port when it is the scheme default, so on :80
  // the Host header is bare `localhost`. A port-qualified-only allowlist 421s
  // every request on a legal KSOR_MCP_PORT=80 — a total outage from a valid
  // setting (review, 2026-08-20).
  it("accepts the bare Host on the scheme-default ports, where clients omit it", () => {
    for (const port of [80, 443]) {
      const { hosts } = resolveSecurity({ host: "127.0.0.1", port });
      expect(hosts, `port ${port}`).not.toBeNull();
      for (const bare of ["localhost", "127.0.0.1", "[::1]"]) {
        expect(hosts?.has(bare), `bare Host ${bare} on :${port}`).toBe(true);
      }
      // …and the qualified spelling still works, since clients may send it.
      expect(hosts?.has(`localhost:${port}`), `qualified on :${port}`).toBe(true);
    }
  });

  it("does NOT accept a bare Host on a non-default port — that would widen the gate", () => {
    const { hosts } = resolveSecurity({ host: "127.0.0.1", port: 8080 });
    for (const bare of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(hosts?.has(bare), `bare ${bare} must not be allowed on :8080`).toBe(false);
    }
    expect(hosts?.has("localhost:8080")).toBe(true);
  });

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

  it("arms a DEFAULT Origin gate on loopback even with no KSOR_ALLOWED_ORIGINS (MCP Origin MUST)", () => {
    const { origins } = resolveSecurity({ host: "127.0.0.1", port: 8080 });
    expect(origins, "loopback Origin gate must be armed by default").not.toBeNull();
    expect(origins?.has("http://127.0.0.1:8080")).toBe(true);
    expect(origins?.has("http://localhost:8080")).toBe(true);
    expect(origins?.has("http://[::1]:8080")).toBe(true);
    expect(origins?.has("http://evil.example.com:8080")).toBe(false);
  });

  it("a public bind with no explicit origins is NOT Origin-gated (bearer-gated instead)", () => {
    expect(resolveSecurity({ host: "0.0.0.0", port: 8080 }).origins).toBeNull();
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

describe("what a rebind refusal TELLS the operator, and how it compares", () => {
  const security = resolveSecurity({ host: "127.0.0.1", port: 8080 });

  it("admits a Host that differs only in case — HTTP says they are the same value", () => {
    // RFC 9110 §4.2.3. The allowlist was an exact Set lookup on both sides, so
    // `LocalHost:8080` — which every HTTP client is entitled to send — was
    // refused by a door bound to exactly that (review finding 4).
    expect(rebindRefusal(security, "LocalHost:8080", undefined)).toBeNull();
  });

  it("admits an Origin that differs only in case", () => {
    expect(rebindRefusal(security, "localhost:8080", "HTTP://LocalHost:8080")).toBeNull();
  });

  it("still refuses a Host that is genuinely not allowed", () => {
    const refusal = rebindRefusal(security, "evil.example.com", undefined);
    expect(refusal?.status).toBe(421);
  });

  it("names the offending value and the variable that governs it", () => {
    // Every other refusal on this door carries its remedy; these two said
    // `{"error":"host not allowed"}` and left the operator with nothing to
    // search for — which is how a case-folding bug becomes an unexplained
    // total outage.
    const refusal = rebindRefusal(security, "evil.example.com", undefined);
    expect(refusal?.body.error, "the value it saw").toContain("evil.example.com");
    expect(refusal?.body.error, "the knob").toContain("KSOR_ALLOWED_HOSTS");
  });

  it("does the same for an Origin", () => {
    const refusal = rebindRefusal(security, "localhost:8080", "https://evil.example.com");
    expect(refusal?.status).toBe(403);
    expect(refusal?.body.error).toContain("https://evil.example.com");
    expect(refusal?.body.error).toContain("KSOR_ALLOWED_ORIGINS");
  });

  it("a request with no Origin is not a cross-origin request", () => {
    expect(rebindRefusal(security, "localhost:8080", undefined)).toBeNull();
  });
});
