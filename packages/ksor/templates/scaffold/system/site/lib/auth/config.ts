/**
 * Whether this record's site offers sign-in, and against whom.
 *
 * Sign-in is ABSENT unless an issuer is configured. There is no half-state and
 * no localhost fallback: a build with no issuer renders no control, and every
 * function here returns null rather than guessing. That is the same posture the
 * door takes (`ksor serve` refuses to boot rather than serve an undeclared
 * auth state) expressed in the only way a static build can — by not existing.
 *
 * What this buys, stated once so nobody has to infer it: a VERIFIED reader
 * identity, rather than a guessed one. It protects nothing the site publishes,
 * and nothing in the browser calls the door yet — the flow requests `openid
 * profile email` and no audience, so the access token it receives is the
 * issuer's own and is not something the door would accept. Making the browser
 * a door client means requesting this record's resource (RFC 8707) and is a
 * new read surface, not a config change. Under `output: "export"` every document is a file the host serves
 * to whoever asks; see `docs/deploying.md` → "Keeping people out of the site"
 * for the three mechanisms that actually restrict reading.
 */

/** Values are inlined at BUILD time, so they must be NEXT_PUBLIC_ to exist. */
export interface AuthConfig {
  /** The authorization server's base URL — the same issuer the door names. */
  readonly issuer: string;
  /** This site's public OAuth client. No secret: PKCE proves the caller. */
  readonly clientId: string;
  /**
   * The callback URL, written out LITERALLY.
   *
   * Never derived from `window.location`. A derivation has to guess whether the
   * first path segment is a base path, and guesses wrong under `KSOR_BASE_PATH`
   * — producing a `redirect_uri` the issuer rejects, with an error that names
   * the URI and not the guess that built it.
   */
  readonly redirectUri: string;
}

const issuer = process.env["NEXT_PUBLIC_KSOR_SSO_URL"]?.trim() ?? "";
const clientId = process.env["NEXT_PUBLIC_KSOR_OAUTH_CLIENT_ID"]?.trim() ?? "";
const redirectUri = process.env["NEXT_PUBLIC_KSOR_OAUTH_REDIRECT_URI"]?.trim() ?? "";

/**
 * The configuration, or null when this record does not offer sign-in.
 *
 * All three are required together. Two out of three is a misconfiguration that
 * would otherwise surface as a failed redirect on the reader's screen, so it
 * resolves to "no sign-in" and the control never renders.
 */
export const authConfig: AuthConfig | null =
  issuer !== "" && clientId !== "" && redirectUri !== "" ? { issuer, clientId, redirectUri } : null;

/** Where the record's own scopes end: identity only, and no refresh token. */
export const OAUTH_SCOPE = "openid profile email";
