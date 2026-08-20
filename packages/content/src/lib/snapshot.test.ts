import { describe, expect, it } from "vitest";

import { keyRingFromEnv, mint, validate, TOKEN_TTL_S, type SnapshotScope } from "./snapshot.js";

const scope: SnapshotScope = {
  corpusId: "acme-handbook",
  tenantId: "acme",
  instanceDigest: "d1",
};

const ring = keyRingFromEnv("k1=secret-one,k2=secret-two");
const NOW = 1_755_600_000_000;

describe("snapshot tokens", () => {
  it("mints and validates round-trip, pinning the generation", () => {
    const { token, expiresAt } = mint(ring, scope, 42, NOW);
    expect(expiresAt.endsWith("Z") && !expiresAt.includes("."), expiresAt).toBe(true);
    expect(validate(ring, token, scope, NOW + 1000)).toEqual({ generation: 42, reason: null });
  });

  it("expires at TTL — with the reason, never an error", () => {
    const { token } = mint(ring, scope, 42, NOW);
    expect(validate(ring, token, scope, NOW + TOKEN_TTL_S * 1000)).toEqual({
      generation: null,
      reason: "expired",
    });
  });

  it("a different deployment's digest is foreign, not merely invalid", () => {
    const { token } = mint(ring, scope, 42, NOW);
    const verdict = validate(ring, token, { ...scope, instanceDigest: "other" }, NOW);
    expect(verdict.reason).toBe("foreign_deployment");
  });

  it("an unknown key id names itself; a forged mac is invalid", () => {
    const other = keyRingFromEnv("k9=elsewhere");
    const { token } = mint(other, scope, 42, NOW);
    expect(validate(ring, token, scope, NOW).reason).toBe("unknown_key");
    const [payload] = mint(ring, scope, 42, NOW).token.split(".");
    expect(
      validate(ring, `${payload}.${Buffer.from("forged").toString("base64url")}`, scope, NOW)
        .reason,
    ).toBe("invalid");
  });

  it("corpus or tenant mismatch is invalid; garbage is invalid", () => {
    const { token } = mint(ring, scope, 42, NOW);
    expect(validate(ring, token, { ...scope, corpusId: "other" }, NOW).reason).toBe("invalid");
    expect(validate(ring, "not-a-token", scope, NOW).reason).toBe("invalid");
    expect(validate(ring, "a.b", scope, NOW).reason).toBe("invalid");
  });

  it("rotation: old key ids validate until their tokens age out", () => {
    const rotated = keyRingFromEnv("k2=secret-two,k1=secret-one");
    const { token } = mint(ring, scope, 7, NOW);
    expect(validate(rotated, token, scope, NOW + 1000).generation).toBe(7);
  });

  it("the env ring refuses half-parsed entries; unset yields an ephemeral key", () => {
    expect(() => keyRingFromEnv("k1")).toThrowError(/kid=secret/);
    const ephemeral = keyRingFromEnv(undefined);
    const { token } = mint(ephemeral, scope, 1, NOW);
    expect(validate(ephemeral, token, scope, NOW).generation).toBe(1);
    // Another process's ephemeral ring shares the kid but not the key: the
    // MAC fails — the soft "refreshed" path, exactly what ephemeral means.
    expect(validate(keyRingFromEnv(undefined), token, scope, NOW).reason).toBe("invalid");
  });
});
