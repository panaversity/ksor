// The bind contract from serve.py: loopback unless the bind is a deliberate
// public act ($PORT from a container platform, or an explicit SOR_MCP_HOST).

import { describe, expect, it } from "vitest";

import { RequiredEnvError, requireEnv, resolveBind } from "./serve.js";

describe("resolveBind — the loopback auto-gate", () => {
  it("defaults to loopback:8080 — a local run must not expose the server on the LAN", () => {
    expect(resolveBind({})).toEqual({ host: "127.0.0.1", port: 8080 });
  });

  it("binds all interfaces only when the container platform sets $PORT", () => {
    expect(resolveBind({ PORT: "9090" })).toEqual({ host: "0.0.0.0", port: 9090 });
  });

  it("SOR_MCP_HOST overrides explicitly, in both postures", () => {
    expect(resolveBind({ SOR_MCP_HOST: "10.0.0.5" })).toEqual({ host: "10.0.0.5", port: 8080 });
    expect(resolveBind({ SOR_MCP_HOST: "127.0.0.1", PORT: "9090" })).toEqual({
      host: "127.0.0.1",
      port: 9090,
    });
  });

  it("SOR_MCP_PORT beats $PORT (local/dev override)", () => {
    const bind = resolveBind({ SOR_MCP_PORT: "8123", PORT: "9090" });
    expect(bind.port, `bind: ${JSON.stringify(bind)}`).toBe(8123);
    expect(bind.host, "the $PORT container signal still decides the host").toBe("0.0.0.0");
  });

  it("an empty $PORT is treated as unset", () => {
    expect(resolveBind({ PORT: "" })).toEqual({ host: "127.0.0.1", port: 8080 });
  });

  it("a malformed port fails loud, naming the variable", () => {
    expect(() => resolveBind({ SOR_MCP_PORT: "eight" })).toThrowError(/SOR_MCP_PORT/);
    expect(() => resolveBind({ PORT: "70000" })).toThrowError(/PORT/);
  });
});

describe("requireEnv — fail loud, never half-boot", () => {
  it("returns the trimmed value when present", () => {
    expect(requireEnv({ SOR_X: "  value  " }, "SOR_X")).toBe("value");
  });

  it("throws the operator message when missing or blank", () => {
    expect(() => requireEnv({}, "SOR_INSTANCE_URI")).toThrowError(RequiredEnvError);
    expect(() => requireEnv({}, "SOR_INSTANCE_URI")).toThrowError("SOR_INSTANCE_URI is required");
    expect(() => requireEnv({ SOR_X: "   " }, "SOR_X")).toThrowError("SOR_X is required");
  });
});
