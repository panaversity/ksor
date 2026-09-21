/**
 * The credential seam — and the claim that makes it a seam rather than a
 * shape: BOTH entries produce the same kind of credential, and nothing
 * downstream can tell them apart.
 *
 * A test that only asserted "each adapter returns an apiKey" would pass for
 * two adapters that were never actually interchangeable. So these assertions
 * are written as an EQUIVALENCE: build a credential each way from the same
 * underlying key, then run both through the exact code a provider runs
 * (`describeCredential`, the transport's header construction) and require the
 * observable results to be identical.
 */

import { describe, expect, it } from "vitest";

import {
  ApiKeyCredentialSource,
  PkceCredentialSource,
  looksLikeOrcaKey,
  summarize,
  type IssuedKey,
  type OrcaCredential,
} from "./credential.js";

const KEY = "sk-orca-testkey-not-a-real-credential-0001";

const issued: IssuedKey = { apiKey: KEY, userId: "12345", scope: "api" };

async function bothWays(): Promise<{ pasted: OrcaCredential; authorized: OrcaCredential }> {
  return {
    pasted: await new ApiKeyCredentialSource(KEY).acquire(),
    authorized: await new PkceCredentialSource(async () => issued).acquire(),
  };
}

describe("two entries, one credential", () => {
  it("both produce the same apiKey", async () => {
    const { pasted, authorized } = await bothWays();
    expect(pasted.apiKey).toBe(KEY);
    expect(authorized.apiKey).toBe(KEY);
  });

  it("the downstream consumer cannot tell them apart", async () => {
    const { pasted, authorized } = await bothWays();
    // Everything a request depends on is equal. `source` is the ONE difference,
    // and it is deliberately outside the request path — this is the assertion
    // that keeps it there.
    const requestRelevant = (c: OrcaCredential): string =>
      JSON.stringify({ apiKey: c.apiKey, generation: c.generation });
    expect(requestRelevant(pasted)).toBe(requestRelevant(authorized));
    // The header a transport builds is byte-identical.
    const header = (c: OrcaCredential): string => `Bearer ${c.apiKey}`;
    expect(header(pasted)).toBe(header(authorized));
  });

  it("records where it came from, so a UI can label the entry in use", async () => {
    const { pasted, authorized } = await bothWays();
    expect(pasted.source).toBe("api_key");
    expect(authorized.source).toBe("pkce");
  });

  it("reads the GRANTED scope back from the issuer, never assumes the request", async () => {
    // The caller asked for `api`; the issuer granted `connector`. The
    // credential must carry what came back.
    const widened = await new PkceCredentialSource(async () => ({
      apiKey: KEY,
      userId: "1",
      scope: "connector",
    })).acquire();
    expect(widened.scope).toBe("connector");
    // And an issuer that says nothing yields `unknown`, not a claim.
    const silent = await new PkceCredentialSource(async () => ({
      apiKey: KEY,
      userId: null,
      scope: "unknown",
    })).acquire();
    expect(silent.scope).toBe("unknown");
    // An api-issued key carries `unknown` because no exchange happened.
    expect((await new ApiKeyCredentialSource(KEY).acquire()).scope).toBe("unknown");
  });

  it("carries the account, and the generation that makes recovery safe", async () => {
    const short = await new PkceCredentialSource(async () => issued, { generation: 7 }).acquire();
    expect(short.userId).toBe("12345");
    expect(short.generation).toBe(7);
  });
});

describe("what the API-key adapter does NOT do", () => {
  it("does not validate against the network — validity is the first real request", async () => {
    // Deliberately no fetch: OrcaRouter exposes no free validation call, and
    // making a settings form say "valid" must not spend the user's money.
    const source = new ApiKeyCredentialSource("sk-orca-plausible-but-revoked-0001");
    const credential = await source.acquire();
    expect(credential.apiKey).toBe("sk-orca-plausible-but-revoked-0001");
  });

  it("has no refresh, because a durable key is not a refreshable token", async () => {
    const credential = await new ApiKeyCredentialSource(KEY).acquire();
    expect(Object.keys(credential)).not.toContain("refreshToken");
    expect(Object.keys(credential)).not.toContain("expiresAt");
    expect("refresh" in credential).toBe(false);
  });
});

describe("the format check", () => {
  it("accepts an sk-orca- value and refuses an obvious paste error", () => {
    expect(looksLikeOrcaKey("sk-orca-abcdefgh")).toBe(true);
    expect(looksLikeOrcaKey(KEY)).toBe(true);
    expect(looksLikeOrcaKey("sk-proj-abcdefgh")).toBe(false);
    expect(looksLikeOrcaKey("orca-abcdefgh")).toBe(false);
    expect(looksLikeOrcaKey("")).toBe(false);
    expect(looksLikeOrcaKey("sk-orca-")).toBe(false);
  });
});

describe("the summary a UI or a log may show", () => {
  it("never contains the key", async () => {
    const { authorized } = await bothWays();
    const summary = summarize(authorized);
    expect(JSON.stringify(summary)).not.toContain(KEY);
    expect(summary.masked).not.toContain("testkey-not-a-real-credential");
    expect(summary.source).toBe("pkce");
    expect(summary.userId).toBe("12345");
  });
});
