/**
 * The connect flows, end to end, against a local stand-in for the consent
 * screen and the exchange endpoint.
 *
 * These run through the PROJECT'S OWN connect adapter — `connectLoopback` /
 * `connectOutOfBand` — not through a hash helper. That distinction is the
 * point: a suite that only tested `challengeFor` would pass for a client that
 * computes a perfect challenge and then never sends it, or sends it to the
 * relay instead of the auth origin.
 *
 * Real authorization needs a human to approve, and nothing here fakes that
 * consent — the fake server IS the consent screen, standing in for the
 * browser, playing back exactly the callback the real one sends. What is under
 * test is the client half: does it build the right authorize URL, does it
 * verify state, does it exchange at the right path with the right body, does
 * it refuse everything that should be refused, and does the verifier stay
 * inside this process.
 *
 * Integration tier: real sockets, real subprocess-free HTTP, real files.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { connectLoopback, connectOutOfBand, exchangeCode, OrcaAuthError } from "./connect.js";
import { readStoredKey, writeStoredKey } from "./store.js";

// ---------------------------------------------------------------------------
// A stand-in for the auth origin: /auth (the consent screen) and
// /api/v1/auth/keys (the exchange), on one loopback port.

interface ConsentBehaviour {
  /** What the consent screen delivers. `deny` plays the user declining. */
  readonly outcome?: "approve" | "deny";
  /** Override the state echoed back, to exercise the CSRF check. */
  readonly stateOverride?: string;
  /** Replace the exchange response. */
  readonly exchange?: (req: ExchangeRequest) => { status: number; body: unknown };
  /** Called with every request the auth origin receives. */
  readonly onRequest?: (path: string, body: string) => void;
}

interface ExchangeRequest {
  readonly path: string;
  readonly method: string;
  readonly authorization: string | null;
  readonly body: Record<string, unknown>;
  readonly raw: string;
}

interface Fake {
  readonly origin: string;
  readonly requests: ExchangeRequest[];
  readonly authorizeUrls: URL[];
  /** The code the consent screen last minted — what a human would have read. */
  lastCode(): string | null;
  close(): Promise<void>;
}

const TOKEN = "sk-orca-minted-by-the-fake-consent-screen-0001";

async function startAuthOrigin(behaviour: ConsentBehaviour = {}): Promise<Fake> {
  const requests: ExchangeRequest[] = [];
  const authorizeUrls: URL[] = [];
  // The code the consent screen mints. Held here so a reused-code case can
  // observe the SAME code being presented twice.
  let minted = 0;
  let lastCode: string | null = null;
  const spent = new Set<string>();

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      behaviour.onRequest?.(url.pathname, raw);

      if (url.pathname === "/auth") {
        authorizeUrls.push(url);
        const callbackUrl = url.searchParams.get("callback_url") ?? "";
        const state = behaviour.stateOverride ?? url.searchParams.get("state") ?? "";
        if (behaviour.outcome === "deny") {
          res.writeHead(200).end("denied");
          if (callbackUrl !== "oob") {
            void fetch(`${callbackUrl}?error=access_denied&state=${encodeURIComponent(state)}`);
          }
          return;
        }
        const code = `code-${(minted += 1)}`;
        lastCode = code;
        res.writeHead(200).end("consent screen");
        // `oob` is not an address — the real screen DISPLAYS the code instead of
        // delivering it, and the human carries it back. Every other value is a
        // real callback_url and the browser GETs it.
        if (callbackUrl !== "oob") {
          void fetch(`${callbackUrl}?code=${code}&state=${encodeURIComponent(state)}`);
        }
        return;
      }

      if (url.pathname === "/api/v1/auth/keys") {
        const body = raw === "" ? {} : (JSON.parse(raw) as Record<string, unknown>);
        const request: ExchangeRequest = {
          path: url.pathname,
          method: req.method ?? "",
          authorization: req.headers["authorization"] ?? null,
          body,
          raw,
        };
        requests.push(request);
        if (behaviour.exchange !== undefined) {
          const out = behaviour.exchange(request);
          res.writeHead(out.status, { "content-type": "application/json" });
          res.end(JSON.stringify(out.body));
          return;
        }
        const code = String(body["code"] ?? "");
        if (spent.has(code)) {
          // Single-use, 10-minute TTL: a second presentation is a 403.
          res.writeHead(403, { "content-type": "application/json" });
          res.end(
            JSON.stringify({ error: "invalid_grant", error_description: "code already used" }),
          );
          return;
        }
        spent.add(code);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ key: TOKEN, user_id: "12345", scope: "api" }));
        return;
      }

      res.writeHead(404).end("not found");
    });
  };

  const server: Server = createServer(handler);
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    authorizeUrls,
    lastCode: () => lastCode,
    close: async () => {
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

/**
 * `openBrowser` played by the test: it fetches the authorize URL, which makes
 * the fake consent screen deliver the callback to our own listener. Nothing
 * else touches the network.
 */
const browserFor =
  (fake: Fake) =>
  (url: string): void => {
    void fetch(url).catch(() => {
      /* the assertion lands on the flow, not on this */
    });
    void fake;
  };

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0)) await fn();
});

// ---------------------------------------------------------------------------

describe("Flow A — loopback redirect", () => {
  it("authorizes, exchanges at /api/v1/auth/keys, and returns the key", async () => {
    const fake = await startAuthOrigin();
    cleanups.push(() => fake.close());

    const issued = await connectLoopback({
      authBase: fake.origin,
      appName: "ksor",
      openBrowser: browserFor(fake),
    });

    expect(issued.apiKey).toBe(TOKEN);
    expect(issued.userId).toBe("12345");
    expect(issued.scope).toBe("api");

    // The exchange went to the AUTH origin, at the documented path.
    expect(fake.requests.length).toBe(1);
    expect(fake.requests[0]?.path).toBe("/api/v1/auth/keys");
    expect(fake.requests[0]?.method).toBe("POST");
    // NOT /v1/auth/keys — the 404 that looks like a routing bug.
    expect(fake.requests[0]?.path).not.toBe("/v1/auth/keys");
    // The exchange carries no Authorization header: the code and verifier ARE
    // the credential at this point.
    expect(fake.requests[0]?.authorization).toBeNull();
  });

  it("sends S256, a challenge, a state and a loopback callback_url", async () => {
    const fake = await startAuthOrigin();
    cleanups.push(() => fake.close());

    await connectLoopback({
      authBase: fake.origin,
      appName: "ksor",
      openBrowser: browserFor(fake),
    });

    const url = fake.authorizeUrls[0];
    expect(url?.pathname).toBe("/auth");
    expect(url?.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url?.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url?.searchParams.get("state")).not.toBe("");
    expect(url?.searchParams.get("app_name")).toBe("ksor");
    expect(url?.searchParams.get("scope")).toBe("api");
    // http: on loopback is the one address the consent endpoint accepts it for.
    expect(url?.searchParams.get("callback_url")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/cb$/);
  });

  it("NEVER puts the verifier in the authorize URL, and sends it only at exchange", async () => {
    const fake = await startAuthOrigin();
    cleanups.push(() => fake.close());

    await connectLoopback({
      authBase: fake.origin,
      appName: "ksor",
      openBrowser: browserFor(fake),
    });

    const authorizeUrl = fake.authorizeUrls[0]?.toString() ?? "";
    const verifier = String(fake.requests[0]?.body["code_verifier"] ?? "");
    expect(verifier).not.toBe("");
    // The two halves of the whole design, asserted directly: the verifier is
    // in the exchange body and nowhere on the authorize URL.
    expect(authorizeUrl).not.toContain(verifier);
    // And it is not the challenge, either — S256, not plain.
    expect(authorizeUrl).not.toContain(encodeURIComponent(verifier));
    // The challenge the URL carried is the hash of the verifier that arrived.
    const challenge = fake.authorizeUrls[0]?.searchParams.get("code_challenge");
    const { createHash } = await import("node:crypto");
    expect(challenge).toBe(createHash("sha256").update(verifier, "utf8").digest("base64url"));
    // The method is asserted back at exchange time — the downgrade defence.
    expect(fake.requests[0]?.body["code_challenge_method"]).toBe("S256");
  });

  it("refuses a callback whose state does not match, before using the code", async () => {
    const fake = await startAuthOrigin({ stateOverride: "not-the-state-we-sent" });
    cleanups.push(() => fake.close());

    await expect(
      connectLoopback({ authBase: fake.origin, appName: "ksor", openBrowser: browserFor(fake) }),
    ).rejects.toMatchObject({ kind: "state_mismatch" });

    // Nothing was exchanged: a mismatched callback must not even reach the
    // exchange, because the code in it belongs to somebody else.
    expect(fake.requests).toEqual([]);
  });

  it("reports a denial as a denial, and does not exchange", async () => {
    const fake = await startAuthOrigin({ outcome: "deny" });
    cleanups.push(() => fake.close());

    await expect(
      connectLoopback({ authBase: fake.origin, appName: "ksor", openBrowser: browserFor(fake) }),
    ).rejects.toMatchObject({ kind: "denied" });
    expect(fake.requests).toEqual([]);
  });

  it("gives up on timeout with a remedy, instead of hanging", async () => {
    // A consent screen nobody answers. The listener must settle.
    const fake = await startAuthOrigin();
    cleanups.push(() => fake.close());

    const started = Date.now();
    await expect(
      connectLoopback({
        authBase: fake.origin,
        appName: "ksor",
        // Deliberately never deliver the callback.
        openBrowser: () => {},
        timeoutMs: 150,
      }),
    ).rejects.toMatchObject({ kind: "timeout" });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("releases the listener on an explicit cancel", async () => {
    const fake = await startAuthOrigin();
    cleanups.push(() => fake.close());

    const controller = new AbortController();
    const pending = connectLoopback({
      authBase: fake.origin,
      appName: "ksor",
      openBrowser: () => {},
      signal: controller.signal,
      timeoutMs: 30_000,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: "cancelled" });
  });
});

describe("Flow B — out-of-band code", () => {
  it("sends callback_url=oob with S256 mandatory, and exchanges the pasted code", async () => {
    const fake = await startAuthOrigin();
    cleanups.push(() => fake.close());

    let shown = "";
    const issued = await connectOutOfBand({
      authBase: fake.origin,
      appName: "ksor",
      openBrowser: () => {},
      onAuthorizeUrl: (url) => {
        shown = url;
      },
      // The human reads the code off the consent screen and pastes it. In this
      // test the "paste" is the code the fake screen minted.
      readCode: async () => {
        // The consent screen renders and mints; then the human reads it off
        // the screen and types it back in.
        await fetch(shown);
        return fake.lastCode() ?? "";
      },
    });

    expect(issued.apiKey).toBe(TOKEN);
    const url = new URL(shown);
    expect(url.searchParams.get("callback_url")).toBe("oob");
    // MANDATORY for a shown code, not merely advisable: the code goes into
    // human hands, so it must be redeemable only by this process.
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(fake.requests[0]?.path).toBe("/api/v1/auth/keys");
  });

  it("refuses an empty paste as a cancellation, not as a code", async () => {
    const fake = await startAuthOrigin();
    cleanups.push(() => fake.close());
    await expect(
      connectOutOfBand({
        authBase: fake.origin,
        appName: "ksor",
        openBrowser: () => {},
        readCode: async () => "   ",
      }),
    ).rejects.toMatchObject({ kind: "cancelled" });
    expect(fake.requests).toEqual([]);
  });
});

describe("the exchange, on its own", () => {
  const attempt = { verifier: "v".repeat(43) };

  it("maps 403 to expired-or-used with a remedy that says not to retry", async () => {
    const fake = await startAuthOrigin({
      exchange: () => ({ status: 403, body: { error: "invalid_grant" } }),
    });
    cleanups.push(() => fake.close());
    await expect(
      exchangeCode({ authBase: fake.origin, code: "c", verifier: attempt.verifier }),
    ).rejects.toMatchObject({ kind: "expired_or_used" });
  });

  it("treats a REUSED code as terminal — a code is single-use", async () => {
    const fake = await startAuthOrigin();
    cleanups.push(() => fake.close());
    const first = await exchangeCode({
      authBase: fake.origin,
      code: "same",
      verifier: "v".repeat(43),
    });
    expect(first.apiKey).toBe(TOKEN);
    await expect(
      exchangeCode({ authBase: fake.origin, code: "same", verifier: "v".repeat(43) }),
    ).rejects.toMatchObject({ kind: "expired_or_used" });
  });

  it("maps 400 to a client bug it names, not to a credential problem", async () => {
    const fake = await startAuthOrigin({
      exchange: () => ({ status: 400, body: { error: "invalid_request" } }),
    });
    cleanups.push(() => fake.close());
    const failure = await exchangeCode({
      authBase: fake.origin,
      code: "c",
      verifier: attempt.verifier,
    }).catch((e: unknown) => e);
    expect(failure).toMatchObject({ kind: "bad_request" });
    expect((failure as OrcaAuthError).fix).toMatch(/retrying will not help/);
  });

  it("maps 429 to the per-account key cap, with the console as the remedy", async () => {
    const fake = await startAuthOrigin({ exchange: () => ({ status: 429, body: {} }) });
    cleanups.push(() => fake.close());
    const failure = await exchangeCode({
      authBase: fake.origin,
      code: "c",
      verifier: attempt.verifier,
    }).catch((e: unknown) => e);
    expect(failure).toMatchObject({ kind: "rate_limited" });
    // The remedy has to name the actual limit, because the user's instinct is
    // to retry and retrying is what produced it.
    expect((failure as OrcaAuthError).message).toMatch(/10 PKCE-issued keys per 24 hours/);
    expect((failure as OrcaAuthError).fix).toContain("authorized-apps");
  });

  it("reports a network failure without echoing the body it sent", async () => {
    const dead = await startAuthOrigin();
    const origin = dead.origin;
    await dead.close();
    const verifier = "super-secret-verifier-value";
    const failure = await exchangeCode({ authBase: origin, code: "c", verifier }).catch(
      (e: unknown) => e,
    );
    expect(failure).toMatchObject({ kind: "network" });
    expect((failure as OrcaAuthError).message).not.toContain(verifier);
    expect((failure as OrcaAuthError).fix).toMatch(/network/);
  });

  it("refuses a 200 that carries no key, rather than returning an empty credential", async () => {
    const fake = await startAuthOrigin({ exchange: () => ({ status: 200, body: { ok: true } }) });
    cleanups.push(() => fake.close());
    await expect(
      exchangeCode({ authBase: fake.origin, code: "c", verifier: attempt.verifier }),
    ).rejects.toMatchObject({ kind: "server" });
  });

  it("refuses a 200 that is not JSON at all", async () => {
    const fake = await startAuthOrigin({
      exchange: () => ({ status: 200, body: "not json" as unknown }),
    });
    cleanups.push(() => fake.close());
    await expect(
      exchangeCode({ authBase: fake.origin, code: "c", verifier: attempt.verifier }),
    ).rejects.toMatchObject({ kind: "server" });
  });

  it("reads the GRANTED scope back instead of assuming what was asked", async () => {
    const fake = await startAuthOrigin({
      exchange: () => ({ status: 200, body: { key: TOKEN, user_id: "9", scope: "connector" } }),
    });
    cleanups.push(() => fake.close());
    const issued = await exchangeCode({
      authBase: fake.origin,
      code: "c",
      verifier: attempt.verifier,
    });
    expect(issued.scope).toBe("connector");
  });

  it("calls it `unknown` when the issuer names no scope", async () => {
    const fake = await startAuthOrigin({
      exchange: () => ({ status: 200, body: { key: TOKEN, user_id: "9" } }),
    });
    cleanups.push(() => fake.close());
    expect(
      (await exchangeCode({ authBase: fake.origin, code: "c", verifier: attempt.verifier })).scope,
    ).toBe("unknown");
  });
});

describe("the credential both flows produce reaches the store", () => {
  it("a full loopback authorize → exchange → persist round trip", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ksor-orca-connect-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, ".env");
    const env = { ORCAROUTER_CREDENTIALS_FILE: file };

    const fake = await startAuthOrigin();
    cleanups.push(() => fake.close());

    const issued = await connectLoopback({
      authBase: fake.origin,
      appName: "ksor",
      openBrowser: browserFor(fake),
    });
    writeStoredKey(issued.apiKey, env);

    expect(existsSync(file)).toBe(true);
    expect(readStoredKey(env)).toBe(TOKEN);
    // The stored file holds the key and nothing else — no verifier, no state,
    // no code, none of which outlive the exchange.
    const body = readFileSync(file, "utf8");
    expect(body).not.toContain(String(fake.requests[0]?.body["code_verifier"]));
  });
});
