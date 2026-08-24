/**
 * The reader's identity, for as long as the tab is open.
 *
 * Storage is `sessionStorage`, deliberately, and it is the one decision here
 * worth arguing about. The alternative — `localStorage` with long-lived tokens
 * — is what the predecessor did and is what NOT to copy: a token readable by
 * any script on the origin, surviving for days, for a feature that grants no
 * access to anything on this site. The blast radius should match the benefit.
 *
 * So: per-tab, gone when the tab closes, and no refresh token is requested at
 * all. Signing in again is one redirect through an issuer that already knows
 * the reader; it is not worth holding a long-lived credential to avoid.
 */

const KEY = "ksor.session";

export interface Session {
  /** The `sub` claim — the issuer's stable identifier for this reader. */
  readonly subject: string;
  readonly name: string | null;
  readonly email: string | null;
  /**
   * The issuer's access token. Held because a session without one is not a
   * session — NOT because anything here calls an API with it yet. No audience
   * is requested, so it is the issuer's own token and the door would refuse it.
   */
  readonly accessToken: string;
  /** Epoch milliseconds. A session past this is treated as absent. */
  readonly expiresAt: number;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["subject"] === "string" &&
    typeof v["accessToken"] === "string" &&
    typeof v["expiresAt"] === "number" &&
    (v["name"] === null || typeof v["name"] === "string") &&
    (v["email"] === null || typeof v["email"] === "string")
  );
}

/**
 * The stored session, or null.
 *
 * Every failure returns null rather than throwing: storage can be unavailable
 * (private windows, blocked site data), the value can be another version's
 * shape, and none of those are worth breaking a page render over.
 */
export function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSession(parsed)) return null;
    if (Date.now() >= parsed.expiresAt) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: Session): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable: the reader stays signed out, which is honest */
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do — a session that cannot be read cannot be used */
  }
}
