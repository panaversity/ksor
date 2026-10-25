/**
 * The two halves of an authorization-code flow, as plain functions.
 *
 * Everything is `fetch` and `window.location`. Nothing here needs a server on
 * this origin, which is why a static export can do it at all.
 */

import { authConfig, OAUTH_SCOPE, type AuthConfig } from "./config";
import { discover } from "./discovery";
import { createPkcePair, createState } from "./pkce";
import { writeSession, type Session } from "./session";

/**
 * The verifier and state, held across the redirect.
 *
 * `sessionStorage`, not a variable: the browser leaves this origin entirely and
 * comes back to a fresh page load, so anything in memory is gone. It is also
 * not `localStorage` — this is single-flow, single-tab state that should not
 * outlive the tab that started it.
 */
const PENDING = "ksor.oauth.pending";

interface Pending {
  readonly verifier: string;
  readonly state: string;
  /** Where the reader was, so sign-in returns them there. */
  readonly returnTo: string;
}

/** Send the reader to the issuer. Returns only if it could not start. */
export async function beginSignIn(returnTo: string): Promise<void> {
  callback = null;
  const config: AuthConfig | null = authConfig;
  if (config === null) return;

  const { verifier, challenge } = await createPkcePair();
  const state = createState();
  const pending: Pending = { verifier, state, returnTo };
  sessionStorage.setItem(PENDING, JSON.stringify(pending));

  const endpoints = await discover(config.issuer);
  if (endpoints === null) return;

  const url = new URL(endpoints.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", OAUTH_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  window.location.assign(url.toString());
}

export type CallbackResult =
  | { readonly ok: true; readonly returnTo: string }
  | { readonly ok: false; readonly reason: string };

interface TokenResponse {
  readonly access_token?: unknown;
  readonly id_token?: unknown;
  readonly expires_in?: unknown;
}

/** Claims this site reads. Everything else in the token is ignored. */
interface IdClaims {
  readonly sub?: unknown;
  readonly name?: unknown;
  readonly email?: unknown;
}

/** Decode a JWT payload WITHOUT verifying it. Read the caveat before using. */
function decodeClaims(idToken: string): IdClaims | null {
  try {
    const payload = idToken.split(".")[1];
    if (payload === undefined) return null;
    const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as IdClaims) : null;
  } catch {
    return null;
  }
}

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

let callback: { readonly key: string; readonly result: Promise<CallbackResult> } | null = null;

/**
 * Redeem the code the issuer sent back, and store the session.
 * Keep the result for this page load so an effect replay cannot consume it twice.
 *
 * The id_token's claims are decoded, NOT verified, and that is deliberate: they
 * are used only to render a name in this browser's own navbar. A forged token
 * would let a reader lie to themselves about their own display name and nothing
 * else — no content is gated on it, and the ACCESS token is verified by the
 * server that actually accepts it (the door checks signature, issuer and
 * audience per request). Verifying here would mean shipping a JWKS client to
 * defend against the reader's own devtools.
 */
export function completeSignIn(params: URLSearchParams): Promise<CallbackResult> {
  const key = params.toString();
  if (callback?.key === key) return callback.result;
  const result = exchangeCode(new URLSearchParams(params)).catch((): CallbackResult => ({
    ok: false,
    reason: "Sign-in could not complete. Return to the record and try again.",
  }));
  callback = { key, result };
  return result;
}

async function exchangeCode(params: URLSearchParams): Promise<CallbackResult> {
  const config: AuthConfig | null = authConfig;
  if (config === null) return { ok: false, reason: "This record does not offer sign-in." };

  const issuerError = params.get("error");
  if (issuerError !== null) {
    return { ok: false, reason: params.get("error_description") ?? issuerError };
  }

  let raw: string | null;
  try {
    raw = sessionStorage.getItem(PENDING);
    sessionStorage.removeItem(PENDING);
  } catch {
    return {
      ok: false,
      reason: "Allow this site's storage, then return to the record and sign in again.",
    };
  }
  if (raw === null) {
    return { ok: false, reason: "This sign-in did not start here. Try again from the site." };
  }
  let pending: Pending;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) throw new Error("invalid pending sign-in");
    const fields = value as Record<string, unknown>;
    if (
      typeof fields["state"] !== "string" ||
      fields["state"] === "" ||
      typeof fields["verifier"] !== "string" ||
      fields["verifier"] === "" ||
      typeof fields["returnTo"] !== "string"
    )
      throw new Error("invalid pending sign-in");
    pending = {
      state: fields["state"],
      verifier: fields["verifier"],
      returnTo: fields["returnTo"],
    };
  } catch {
    return {
      ok: false,
      reason: "The saved sign-in is invalid. Return to the record and try again.",
    };
  }

  // CSRF: the state must be the one this browser generated. Checked before the
  // code is sent anywhere, so a planted code is never redeemed.
  if (params.get("state") !== pending.state) {
    return { ok: false, reason: "Sign-in could not be verified. Try again." };
  }
  const code = params.get("code");
  if (code === null) return { ok: false, reason: "The issuer returned no authorization code." };

  // No `credentials: "include"`: a public PKCE client sends no cookies, and
  // sending them is refused outright by browsers against a wildcard CORS origin.
  const endpoints = await discover(config.issuer);
  if (endpoints === null) {
    return { ok: false, reason: "The authorization server published no metadata document." };
  }

  let response: Response;
  try {
    response = await fetch(endpoints.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        code_verifier: pending.verifier,
      }),
    });
  } catch {
    return {
      ok: false,
      reason: "Could not reach the authorization server. Check your connection and sign in again.",
    };
  }
  if (!response.ok) {
    return { ok: false, reason: `The issuer refused the exchange (${response.status}).` };
  }

  let token: TokenResponse;
  try {
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("invalid token response");
    }
    token = value as TokenResponse;
  } catch {
    return {
      ok: false,
      reason: "The authorization server returned an invalid response. Try again from the record.",
    };
  }
  const accessToken = str(token.access_token);
  if (accessToken === null) return { ok: false, reason: "The issuer returned no access token." };

  const claims = typeof token.id_token === "string" ? decodeClaims(token.id_token) : null;
  const lifetime = typeof token.expires_in === "number" ? token.expires_in : 3600;
  const session: Session = {
    subject: str(claims?.sub) ?? "unknown",
    name: str(claims?.name),
    email: str(claims?.email),
    accessToken,
    expiresAt: Date.now() + lifetime * 1000,
  };
  if (!writeSession(session)) {
    return {
      ok: false,
      reason: "Allow this site's storage, then return to the record and sign in again.",
    };
  }
  return { ok: true, returnTo: pending.returnTo };
}
