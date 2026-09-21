/**
 * The two PKCE connect flows, and the exchange they both end at.
 *
 * Flow A — loopback redirect. The client binds `127.0.0.1:<ephemeral>`, opens
 * the consent screen with that address as `callback_url`, and the browser
 * hands the code straight back. One click, no copying.
 *
 * Flow B — out-of-band. `callback_url=oob`; the consent screen displays the
 * code and the user pastes it in. For a session with no browser to return to:
 * SSH, a container, a locked-down machine.
 *
 * WHY A is the default here: `ksor` is a local CLI whose operator is at a
 * machine with a browser and a loopback interface, which is exactly the case
 * loopback serves best. Flow B is offered for the sessions where that is not
 * true, and it is the same exchange either way.
 *
 * `S256` on BOTH, unconditionally. The consent screen lets the user choose
 * "Show me a code" even when a real `callback_url` was supplied, and there is
 * no authorize parameter that prevents it — so a human can always end up
 * holding the code, and a displayed code must be redeemable only by the
 * process that generated the verifier. `plain` would put the verifier itself
 * on the authorize URL, through browser history and every proxy in between.
 *
 * What this module refuses to do, all of it deliberate: it never prints the
 * verifier; it never puts the verifier in a URL; it compares `state` before it
 * looks at the code; it treats a missing code, a denial, a mismatch, a
 * timeout and a cancel as distinct terminal outcomes with distinct remedies;
 * and it never retries a `403` — an auth code is single-use with a 10 minute
 * TTL, so retrying a spent one is a hot loop against a door that will not open.
 */

import { createServer } from "node:http";
import { exec } from "node:child_process";

import { authorizeUrl, exchangeUrl, isLoopbackHost } from "./endpoints.js";
import { createAttempt, stateMatches, type PkceAttempt } from "./pkce.js";
import type { IssuedKey, OrcaScope } from "./credential.js";

/** Every way this flow can end without a key, named so a caller can branch. */
export type AuthFailureKind =
  | "denied"
  | "state_mismatch"
  | "expired_or_used"
  | "bad_request"
  | "scope_refused"
  | "rate_limited"
  | "timeout"
  | "cancelled"
  | "network"
  | "server";

export class OrcaAuthError extends Error {
  readonly slug = "ksor-orcarouter-auth";
  readonly kind: AuthFailureKind;
  /** A remedy a user can act on. Never carries a key, a code, or a verifier. */
  readonly fix: string;

  constructor(kind: AuthFailureKind, message: string, fix: string) {
    super(message);
    this.name = "OrcaAuthError";
    this.kind = kind;
    this.fix = fix;
  }
}

export interface ExchangeOptions {
  readonly authBase: string;
  readonly code: string;
  readonly verifier: string;
  /** Injected in tests; the network is never touched by a unit test. */
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  /** Abort an exchange in flight (the Cancel button, a page teardown). */
  readonly signal?: AbortSignal;
}

const EXCHANGE_TIMEOUT_MS = 30_000;

function scopeOf(raw: unknown): OrcaScope {
  return raw === "api" || raw === "connector" ? raw : "unknown";
}

/**
 * POST the code and the verifier to `/api/v1/auth/keys` on the AUTH origin.
 *
 * The body is JSON with `code`, `code_verifier` and `code_challenge_method`,
 * which is what the endpoint documents. `code_challenge_method` is sent back
 * because the server refuses a method that differs from the one presented at
 * authorize time — that check is the downgrade defence, and omitting the field
 * on the exchange is how a client accidentally opts out of asserting it.
 */
export async function exchangeCode(opts: ExchangeOptions): Promise<IssuedKey> {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? EXCHANGE_TIMEOUT_MS);
  const signal = opts.signal === undefined ? timeout : AbortSignal.any([timeout, opts.signal]);

  let res: Response;
  try {
    res = await doFetch(exchangeUrl(opts.authBase).toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: opts.code,
        code_verifier: opts.verifier,
        code_challenge_method: "S256",
      }),
      signal,
    });
  } catch (exc) {
    if (opts.signal?.aborted === true) {
      throw new OrcaAuthError(
        "cancelled",
        "the authorization was cancelled",
        "run it again when you are ready",
      );
    }
    // The message is the transport's, never the body we sent: the body holds
    // the verifier, and a fetch error can quote its request.
    throw new OrcaAuthError(
      "network",
      `could not reach ${opts.authBase}: ${exc instanceof Error ? exc.name : "unknown error"}`,
      "check the network (and any proxy) and retry",
    );
  }

  const text = await res.text();
  if (!res.ok) {
    // The statuses are the spec's, and they mean different things:
    if (res.status === 400) {
      throw new OrcaAuthError(
        "bad_request",
        "OrcaRouter refused the exchange: the challenge method is unrecognised or differs from the one sent at authorize time",
        "this is a client bug, not a credential problem — report it; retrying will not help",
      );
    }
    if (res.status === 403) {
      throw new OrcaAuthError(
        "expired_or_used",
        "OrcaRouter refused the code: it is unknown, expired (codes live 10 minutes), already used, or the verifier does not match",
        "start a new authorization — a code is single-use and cannot be replayed",
      );
    }
    if (res.status === 429) {
      throw new OrcaAuthError(
        "rate_limited",
        "OrcaRouter is rate-limiting key issuance: an account may mint 10 PKCE-issued keys per 24 hours",
        "reuse the key you already have, or revoke unused keys at https://www.orcarouter.ai/console/authorized-apps",
      );
    }
    throw new OrcaAuthError(
      "server",
      `OrcaRouter answered ${res.status} to the exchange`,
      "retry in a moment; if it persists, the authorization service is unwell",
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new OrcaAuthError(
      "server",
      "OrcaRouter answered 200 with a body that is not JSON",
      "retry; a 200 that cannot be parsed is not a credential",
    );
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const key = record["key"];
  if (typeof key !== "string" || key === "") {
    throw new OrcaAuthError(
      "server",
      "OrcaRouter answered 200 without a `key` — there is no credential here",
      "retry; this is not something the client can repair",
    );
  }
  return {
    apiKey: key,
    userId: typeof record["user_id"] === "string" ? record["user_id"] : null,
    // READ BACK, never assumed from the request. A client that asked for
    // `connector` and reads `api` was approved by someone whose role does not
    // permit the wider grant, and the honest thing is to hold what was granted.
    scope: scopeOf(record["scope"]),
  };
}

/** The scope the caller asked for, and what to say when less came back. */
export function scopeWarning(requested: OrcaScope, granted: OrcaScope): string | null {
  if (granted === "unknown") return null; // the issuer did not say; nothing was narrowed
  if (requested === granted) return null;
  return `you asked for the "${requested}" scope and were granted "${granted}" — acting on the wider grant would be acting on an authorization you do not hold`;
}

/** Shared authorize-URL construction, so both flows spell every parameter the same way. */
export function buildAuthorizeUrl(
  authBase: string,
  attempt: PkceAttempt,
  opts: { callbackUrl: string; appName: string; scope: OrcaScope; loginHint?: string },
): string {
  const url = authorizeUrl(authBase);
  url.searchParams.set("callback_url", opts.callbackUrl);
  url.searchParams.set("code_challenge", attempt.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", attempt.state);
  url.searchParams.set("app_name", opts.appName);
  url.searchParams.set("scope", opts.scope);
  if (opts.loginHint !== undefined) url.searchParams.set("login_hint", opts.loginHint);
  return url.toString();
}

const CLOSE_PAGE = `<!doctype html><meta charset="utf-8"><title>ksor</title>
<body style="font:16px system-ui;padding:3rem;max-width:36rem">
<h1 style="font-size:1.1rem">OrcaRouter connected</h1>
<p>You can close this tab and go back to your terminal.</p>
</body>`;

const DENIED_PAGE = `<!doctype html><meta charset="utf-8"><title>ksor</title>
<body style="font:16px system-ui;padding:3rem;max-width:36rem">
<h1 style="font-size:1.1rem">Authorization declined</h1>
<p>Nothing was changed. You can close this tab.</p>
</body>`;

export interface LoopbackOptions {
  readonly authBase: string;
  readonly appName: string;
  readonly scope?: OrcaScope;
  readonly loginHint?: string;
  /** Injected in tests. Opens the consent screen; never awaited. */
  readonly openBrowser?: (url: string) => void;
  readonly fetchImpl?: typeof fetch;
  /** How long to hold the listener open. */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Called with the URL to show, for a session where nothing opened. */
  readonly onAuthorizeUrl?: (url: string) => void;
}

const LOOPBACK_TIMEOUT_MS = 300_000;

/**
 * Flow A. Binds loopback FIRST so the port is known before the browser opens —
 * a listener started after the redirect is a race the user loses.
 *
 * Every terminal path closes the listener and settles the promise exactly
 * once: approval, denial, state mismatch, timeout, abort, and a bind failure.
 */
export async function connectLoopback(opts: LoopbackOptions): Promise<IssuedKey> {
  const attempt = createAttempt();
  const timeoutMs = opts.timeoutMs ?? LOOPBACK_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = opts.signal === undefined ? timeout : AbortSignal.any([timeout, opts.signal]);

  const { port, result } = await new Promise<{ port: number; result: Promise<string> }>(
    (ready, fail) => {
      let settle: (code: string) => void = () => {};
      let reject: (err: Error) => void = () => {};
      const result = new Promise<string>((res, rej) => {
        settle = res;
        reject = rej;
      });

      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/cb") {
          res.writeHead(404, { "content-type": "text/plain" }).end("not found");
          return;
        }
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        // STATE FIRST, before the code is read or trusted. This listener is on a
        // fixed path on a loopback port, so any page in the browser can reach it;
        // the state is the only thing that says the callback is ours.
        if (!stateMatches(attempt.state, state)) {
          res.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end(DENIED_PAGE);
          server.close();
          reject(
            new OrcaAuthError(
              "state_mismatch",
              "the callback did not carry the state this attempt sent",
              "start again — a callback that fails this check is not from your authorization",
            ),
          );
          return;
        }
        if (error !== null && error !== "") {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(DENIED_PAGE);
          server.close();
          // The user said no, or the request was invalid. Terminal either way.
          reject(
            new OrcaAuthError(
              "denied",
              `authorization was refused (${error})`,
              "run the command again and approve the request",
            ),
          );
          return;
        }
        const code = url.searchParams.get("code");
        if (code === null || code === "") {
          res.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end(DENIED_PAGE);
          server.close();
          reject(
            new OrcaAuthError(
              "bad_request",
              "the callback carried neither a code nor an error",
              "start again",
            ),
          );
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(CLOSE_PAGE);
        server.close();
        settle(code);
      });

      server.on("error", (err) => fail(err));
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address === null || typeof address === "string") {
          fail(new Error("the loopback listener bound no port"));
          return;
        }
        ready({ port: address.port, result });
      });
    },
  );

  const callbackUrl = `http://127.0.0.1:${port}/cb`;
  if (!isLoopbackHost(new URL(callbackUrl).hostname)) {
    // Belt and braces: the consent endpoint only accepts http: for loopback, so
    // this can only fire if the constant above were edited into something else.
    throw new OrcaAuthError(
      "bad_request",
      "the loopback callback is not on a loopback host",
      "this is a client bug",
    );
  }
  const url = buildAuthorizeUrl(opts.authBase, attempt, {
    callbackUrl,
    appName: opts.appName,
    scope: opts.scope ?? "api",
    ...(opts.loginHint === undefined ? {} : { loginHint: opts.loginHint }),
  });

  opts.onAuthorizeUrl?.(url);
  (opts.openBrowser ?? openInBrowser)(url);

  let code: string;
  try {
    code = await raceWithSignal(result, signal, timeoutMs);
  } catch (exc) {
    if (opts.signal?.aborted === true) {
      throw new OrcaAuthError(
        "cancelled",
        "the authorization was cancelled",
        "run it again when you are ready",
      );
    }
    if (exc instanceof OrcaAuthError) throw exc;
    throw new OrcaAuthError(
      "timeout",
      `no callback arrived within ${Math.round(timeoutMs / 1000)}s`,
      "run it again, or use the out-of-band flow if this machine cannot receive a redirect",
    );
  }
  return await exchangeCode({
    authBase: opts.authBase,
    code,
    verifier: attempt.verifier,
    ...(opts.fetchImpl === undefined ? {} : { fetchImpl: opts.fetchImpl }),
  });
}

/** Reject when the signal aborts, otherwise the inner promise's own outcome. */
async function raceWithSignal<T>(
  inner: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  if (signal.aborted) throw new Error("aborted");
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    const onAbort = (): void => reject(new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    inner.then(
      (value) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export interface OutOfBandOptions {
  readonly authBase: string;
  readonly appName: string;
  readonly scope?: OrcaScope;
  readonly loginHint?: string;
  /** How the code gets back in. Injected so a test never reads stdin. */
  readonly readCode: () => Promise<string>;
  readonly openBrowser?: (url: string) => void;
  readonly fetchImpl?: typeof fetch;
  readonly onAuthorizeUrl?: (url: string) => void;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

/**
 * Flow B. `callback_url=oob` — spelled out, because the mode is asked for
 * rather than guessed at — and `S256` is mandatory here rather than merely
 * advisable: a displayed code goes into human hands, so it must be redeemable
 * only by the process holding the verifier.
 */
export async function connectOutOfBand(opts: OutOfBandOptions): Promise<IssuedKey> {
  const attempt = createAttempt();
  const url = buildAuthorizeUrl(opts.authBase, attempt, {
    callbackUrl: "oob",
    appName: opts.appName,
    scope: opts.scope ?? "api",
    ...(opts.loginHint === undefined ? {} : { loginHint: opts.loginHint }),
  });
  opts.onAuthorizeUrl?.(url);
  (opts.openBrowser ?? openInBrowser)(url);

  const code = (await opts.readCode()).trim();
  if (code === "") {
    throw new OrcaAuthError(
      "cancelled",
      "no code was entered",
      "run the command again and paste the code the consent screen showed",
    );
  }
  return await exchangeCode({
    authBase: opts.authBase,
    code,
    verifier: attempt.verifier,
    ...(opts.fetchImpl === undefined ? {} : { fetchImpl: opts.fetchImpl }),
    ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
    ...(opts.signal === undefined ? {} : { signal: opts.signal }),
  });
}

/**
 * Open the consent screen. Failure is not fatal and is not reported as one:
 * the URL is printed either way, which is the whole remedy for a machine with
 * no opener.
 */
export function openInBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    exec(`${command} "${url}"`, () => {
      /* the printed URL covers a failure here */
    });
  } catch {
    /* same */
  }
}
