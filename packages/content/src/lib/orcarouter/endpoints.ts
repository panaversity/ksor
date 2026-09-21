/**
 * Where OrcaRouter lives, resolved in ONE place.
 *
 * Authentication and inference are DIFFERENT public origins and this module is
 * the only thing that knows it:
 *
 *   auth   `https://www.orcarouter.ai`       — `/auth` (consent), `/api/v1/auth/keys` (exchange)
 *   relay  `https://api.orcarouter.ai/v1`    — `/chat/completions`, `/models`
 *
 * The failure this exists to prevent is not hypothetical and is not visible
 * from the URLs: `https://api.orcarouter.ai/v1/auth/keys` is a 404 that looks
 * like a routing bug on the vendor's side. Deriving one origin from the other
 * by swapping a hostname, or by blindly appending `/v1` to the auth base, is
 * how a client ships that mistake — so neither origin is ever computed from
 * the other here. They are two independent defaults, each with its own
 * override.
 *
 * Precedence, per the integration spec: an EXPLICIT per-origin override wins;
 * `ORCA_BASE_URL` is the shared self-hosted fallback that both origins fall
 * back to; the public defaults are last. A self-hosted deployment that serves
 * both planes from one host therefore sets one variable and gets it.
 *
 * Transport security is enforced at the door rather than trusted: a remote
 * origin must be `https:`. `http:` is admitted only for a loopback host,
 * because that is a local development server and nothing else — an `http:`
 * origin on any other host would put the API key and the auth code on the wire
 * in clear text.
 */

/** Auth and the code exchange. */
export const DEFAULT_AUTH_BASE = "https://www.orcarouter.ai";
/** Inference and model discovery. The `/v1` is part of the base, as the spec states it. */
export const DEFAULT_API_BASE = "https://api.orcarouter.ai/v1";

/** The consent screen. Fixed — not a discovery document, not configurable. */
export const AUTHORIZE_PATH = "/auth";
/** The code→key exchange. Note `/api/v1/auth`, NOT `/v1/auth`: the relay is at `/v1`. */
export const EXCHANGE_PATH = "/api/v1/auth/keys";

export class OrcaEndpointError extends Error {
  readonly slug = "ksor-orcarouter-endpoint";
  constructor(message: string) {
    super(message);
    this.name = "OrcaEndpointError";
  }
}

/** `localhost`, `127.0.0.1`, `[::1]` — the only hosts an `http:` origin may name. */
export function isLoopbackHost(hostname: string): boolean {
  // URL#hostname KEEPS the brackets on an IPv6 literal in Node (`[::1]`), so
  // they are stripped here rather than assumed away — comparing the raw value
  // against `::1` silently refused the loopback v6 address, which is the one
  // host the http: exemption exists for.
  const bare =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  return bare === "localhost" || bare === "127.0.0.1" || bare === "::1";
}

/**
 * Parse an origin and refuse anything that would send a credential somewhere a
 * user did not agree to. Trailing slashes are dropped so the path constants
 * above concatenate to exactly one slash.
 */
export function parseOrigin(raw: string, variable: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OrcaEndpointError(`${variable}=${JSON.stringify(raw)} is not a URL`);
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new OrcaEndpointError(
      `${variable}=${JSON.stringify(raw)} is http: on a non-loopback host\n` +
        "  why: the API key and the auth code would cross the network in clear text\n" +
        "  fix: use https:, or point it at 127.0.0.1 for a local self-hosted deployment",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OrcaEndpointError(
      `${variable}=${JSON.stringify(raw)} must be an http: or https: origin`,
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new OrcaEndpointError(`${variable}=${JSON.stringify(raw)} carries userinfo`);
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** The three variables, read at USE — a static import evaluates before `.env` is loaded. */
export interface OrcaEnv {
  readonly ORCA_AUTH_BASE_URL?: string | undefined;
  readonly ORCA_API_BASE_URL?: string | undefined;
  readonly ORCA_BASE_URL?: string | undefined;
}

export interface OrcaEndpoints {
  /** The auth origin, no trailing slash: `https://www.orcarouter.ai`. */
  readonly authBase: string;
  /** The relay base INCLUDING `/v1`: `https://api.orcarouter.ai/v1`. */
  readonly apiBase: string;
}

/** Resolve both origins. Throws `OrcaEndpointError` on an unusable value. */
export function resolveEndpoints(env: OrcaEnv = process.env): OrcaEndpoints {
  const shared =
    env.ORCA_BASE_URL === undefined || env.ORCA_BASE_URL === ""
      ? null
      : parseOrigin(env.ORCA_BASE_URL, "ORCA_BASE_URL");
  const auth =
    env.ORCA_AUTH_BASE_URL === undefined || env.ORCA_AUTH_BASE_URL === ""
      ? null
      : parseOrigin(env.ORCA_AUTH_BASE_URL, "ORCA_AUTH_BASE_URL");
  const api =
    env.ORCA_API_BASE_URL === undefined || env.ORCA_API_BASE_URL === ""
      ? null
      : parseOrigin(env.ORCA_API_BASE_URL, "ORCA_API_BASE_URL");
  return {
    // Explicit per-origin override, then the shared fallback, then the default.
    authBase: auth ?? shared ?? DEFAULT_AUTH_BASE,
    // The API override names the relay base INCLUDING `/v1`, because that is the
    // unit every caller composes with. A shared `ORCA_BASE_URL` is a bare host,
    // so `/v1` is appended to IT — and only to it, never to the auth origin,
    // which is the derivation this module exists to forbid.
    apiBase: api ?? (shared === null ? DEFAULT_API_BASE : `${shared}/v1`),
  };
}

/** The consent URL for an authorization attempt. */
export function authorizeUrl(authBase: string): URL {
  return new URL(`${authBase}${AUTHORIZE_PATH}`);
}

/** The exchange URL — always on the auth origin, never on the relay. */
export function exchangeUrl(authBase: string): URL {
  return new URL(`${authBase}${EXCHANGE_PATH}`);
}

/** Model discovery, on the relay base. */
export function modelsUrl(apiBase: string): string {
  return `${apiBase}/models`;
}

/** Chat completions, on the relay base. */
export function chatCompletionsUrl(apiBase: string): string {
  return `${apiBase}/chat/completions`;
}
