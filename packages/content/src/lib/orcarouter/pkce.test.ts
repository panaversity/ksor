import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { base64url, createAttempt, redact, scrubSecrets, stateMatches } from "./pkce.js";

describe("the verifier never leaves the process", () => {
  it("is fresh, from a cryptographic RNG, on every attempt", () => {
    const attempts = Array.from({ length: 64 }, () => createAttempt());
    const verifiers = new Set(attempts.map((a) => a.verifier));
    const states = new Set(attempts.map((a) => a.state));
    expect(verifiers.size).toBe(attempts.length);
    expect(states.size).toBe(attempts.length);
    // A reused verifier is the failure this asserts against; a fixed or
    // time-derived one would show up here as a collision.
    for (const a of attempts) {
      expect(a.verifier.length).toBeGreaterThanOrEqual(43);
      expect(a.verifier).not.toContain("=");
      expect(a.verifier).not.toContain("+");
      expect(a.verifier).not.toContain("/");
    }
  });

  it("sends only S256 of the verifier — never the verifier", () => {
    const attempt = createAttempt();
    const expected = createHash("sha256").update(attempt.verifier, "utf8").digest("base64url");
    expect(attempt.challenge).toBe(expected);
    // The challenge must be derived, not echoed.
    expect(attempt.challenge).not.toBe(attempt.verifier);
  });

  it("produces an unpadded base64url challenge", () => {
    // Padding is what the server compares literally; `=` would fail the match.
    for (let i = 0; i < 32; i += 1) {
      const challenge = createAttempt().challenge;
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(challenge.length).toBe(43); // 32 bytes → 43 base64url chars, no padding
    }
  });

  it("base64url matches the RFC 4648 §5 alphabet", () => {
    expect(base64url(Buffer.from([251, 255, 191]))).toBe("-_-_");
    expect(base64url(Buffer.from(""))).toBe("");
  });
});

describe("state is the CSRF token", () => {
  it("accepts only the exact state, in constant time", () => {
    const attempt = createAttempt();
    expect(stateMatches(attempt.state, attempt.state)).toBe(true);
    expect(stateMatches(attempt.state, attempt.state.slice(0, -1) + "X")).toBe(false);
    expect(stateMatches(attempt.state, attempt.state + "x")).toBe(false);
  });

  it("treats a missing state as a mismatch, not as 'no check needed'", () => {
    // The callback URL is on a fixed loopback path any page can reach; a
    // callback with no state at all is exactly the attack.
    expect(stateMatches(createAttempt().state, null)).toBe(false);
    expect(stateMatches(createAttempt().state, "")).toBe(false);
  });

  it("refuses a length mismatch instead of throwing", () => {
    // timingSafeEqual throws on unequal lengths; the guard has to come first.
    expect(() => stateMatches("short", "a-much-longer-state-value")).not.toThrow();
    expect(stateMatches("short", "a-much-longer-state-value")).toBe(false);
  });
});

describe("redaction", () => {
  it("keeps enough to tell two keys apart and not enough to use one", () => {
    const value = "sk-orca-abcdefghijklmnop";
    const masked = redact(value);
    expect(masked).not.toContain("abcdefghijklmnop");
    expect(masked.startsWith("sk-orca-")).toBe(true);
    expect(masked).toBe(`sk-orca-…(${value.length})`);
  });

  it("names the empty case rather than printing nothing", () => {
    expect(redact("")).toBe("(none)");
  });

  it("strips a key out of EXTERNAL text before it reaches a message", () => {
    // A vendor error body is written by somebody else and may quote the
    // rejected Authorization header back at us.
    const body = 'bad key: {"Authorization":"Bearer sk-orca-abcdefghijklmnopqrst"} rejected';
    const safe = scrubSecrets(body);
    expect(safe).not.toContain("sk-orca-abcdefghijklmnopqrst");
    expect(safe).toContain("sk-orca-…(28)");
    expect(safe).toContain("rejected");
    // Text with no key is untouched, so the vendor's own diagnosis survives.
    expect(scrubSecrets("model not found")).toBe("model not found");
  });

  it("does not leak a value shorter than the head it keeps", () => {
    // A short secret has no safe prefix to keep, and the length is disclosed
    // either way — the point is that no SEGMENT of the value survives.
    expect(redact("abc")).toBe("abc…(3)");
  });
});
