import { describe, expect, it } from "vitest";

import { keyRingFromEnv, mint, validate, TOKEN_TTL_S, type SnapshotScope } from "./snapshot.js";

const scope: SnapshotScope = {
  corpusId: "acme-handbook",
  tenantId: "acme",
  instanceDigest: "d1",
  viewer: ["public"],
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

  it("a malformed entry's refusal never echoes the entry — it is the secret when kid= was forgotten", () => {
    // The likeliest operator mistake is pasting a bare secret; the refusal
    // reaches whatever collects logs, so it may name only position and length.
    for (const [ring, secret] of [
      ["prod=good-one,s3cr3t-hunter2-oops", "s3cr3t-hunter2-oops"],
      ["prod=good-one,=s3cr3t-hunter2-oops", "s3cr3t-hunter2-oops"],
    ] as const) {
      let message = "";
      try {
        keyRingFromEnv(ring);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).not.toContain(secret);
      expect(message).toMatch(/entry 2 \(\d+ chars\)/);
      expect(message).toMatch(/kid=secret/);
    }
  });
});

/**
 * Replica behaviour — the case issue #33 listed as "documented, untested", and
 * that a real deployment then found the hard way.
 *
 * A generation pin is what keeps a multi-call conversation on ONE version of the
 * record: `search` answers from generation N and hands back a token, `read`
 * honours it. Unset `KSOR_SNAPSHOT_KEYS` mints a per-process key — which the
 * module's own comment calls "honest for a single replica". A container is not a
 * single replica. Every cold start mints a fresh key, so a token issued by one
 * instance is unverifiable by the next.
 *
 * It fails SOFT (`read` serves the active generation and says why), so nothing
 * errors and nothing logs, and the only symptom is an agent reading a generation
 * it did not search — observed live as roughly one read in three coming back
 * unpinned. These tests make the mechanism visible rather than inferred.
 */
describe("snapshot tokens across replicas", () => {
  const SCOPE = {
    corpusId: "book",
    tenantId: "t1",
    instanceDigest: "digest-1",
    viewer: ["public"],
  };

  it("an ephemeral ring cannot verify ANOTHER process's token", () => {
    // Two processes, each with no KSOR_SNAPSHOT_KEYS: two different keys.
    const replicaA = keyRingFromEnv(undefined);
    const replicaB = keyRingFromEnv(undefined);
    expect(replicaA.active).toBe("ephemeral");
    expect(replicaB.active).toBe("ephemeral");

    const issued = mint(replicaA, SCOPE, 3);
    // Same key id, different secret — so this is NOT "unknown_key". The id
    // matches and the signature does not, which is exactly why the failure is
    // invisible until you read the verdict.
    expect(validate(replicaB, issued.token, SCOPE)).toEqual({
      generation: null,
      reason: "invalid",
    });
    // The instance that minted it is fine, which is why a single-process dev run
    // never sees this.
    expect(validate(replicaA, issued.token, SCOPE).generation).toBe(3);
  });

  it("a SHARED ring verifies across every replica", () => {
    const shared = "k1=a-secret-shared-by-every-replica";
    const replicaA = keyRingFromEnv(shared);
    const replicaB = keyRingFromEnv(shared);
    expect(replicaA.active).toBe("k1");

    const issued = mint(replicaA, SCOPE, 3);
    expect(validate(replicaB, issued.token, SCOPE)).toEqual({ generation: 3, reason: null });
  });

  it("rotation keeps outstanding pins valid while the old key is still listed", () => {
    const before = keyRingFromEnv("k1=old-secret");
    const issued = mint(before, SCOPE, 7);

    // Rotate: new key first (active), old key retained to finish out its tokens.
    const during = keyRingFromEnv("k2=new-secret,k1=old-secret");
    expect(during.active).toBe("k2");
    expect(validate(during, issued.token, SCOPE)).toEqual({ generation: 7, reason: null });

    // Drop the old key and the outstanding pin dies — the cost that makes
    // rotation something you do deliberately, not on a schedule.
    const after = keyRingFromEnv("k2=new-secret");
    expect(validate(after, issued.token, SCOPE)).toEqual({
      generation: null,
      reason: "unknown_key",
    });
  });

  it("a token from another DEPLOYMENT is refused even with the same key", () => {
    // The reason a shared secret is per-deployment: two records that happened to
    // share a key must still not honour each other's pins.
    const ring = keyRingFromEnv("k1=same-secret-everywhere");
    const issued = mint(ring, SCOPE, 3);
    expect(validate(ring, issued.token, { ...SCOPE, instanceDigest: "digest-2" })).toEqual({
      generation: null,
      reason: "foreign_deployment",
    });
  });
});

describe("the token binds the VIEWER LIST, not only the deployment", () => {
  // A pin re-serves the generation a search answered from. Without the viewer
  // in the binding, a token minted for a public caller re-serves that pinned
  // generation to an internal one and vice versa — a caller's own follow-up
  // read is the one place a wider or narrower audience could be smuggled in
  // through a value the caller holds.
  it("a token minted at [public] is refused at [public, internal]", () => {
    const { token } = mint(ring, scope, 42, NOW);
    const wider = { ...scope, viewer: ["public", "internal"] };
    expect(validate(ring, token, wider, NOW).reason).toBe("foreign_deployment");
    expect(validate(ring, token, wider, NOW).generation).toBeNull();
  });

  it("…and one minted at [public, internal] is refused at [public]", () => {
    const wider = { ...scope, viewer: ["public", "internal"] };
    const { token } = mint(ring, wider, 42, NOW);
    expect(validate(ring, token, scope, NOW).reason).toBe("foreign_deployment");
  });

  it("ORDER is not identity — the same list in another order is the same viewer", () => {
    const a = { ...scope, viewer: ["public", "internal"] };
    const b = { ...scope, viewer: ["internal", "public"] };
    expect(validate(ring, mint(ring, a, 9, NOW).token, b, NOW)).toEqual({
      generation: 9,
      reason: null,
    });
  });
});
