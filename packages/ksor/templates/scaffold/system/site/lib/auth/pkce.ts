/**
 * RFC 7636 (PKCE, S256) using the Web Crypto API — no dependency.
 *
 * PKCE is what lets a browser be an OAuth client with NO SECRET. The client
 * generates a random verifier, sends only its SHA-256 hash to start the flow,
 * and presents the verifier when redeeming the code. An attacker who steals the
 * authorization code cannot redeem it without the verifier, which never left
 * the browser that started the flow.
 *
 * That is the whole reason this site needs no server: there is nothing to keep
 * secret, so there is nothing that must live somewhere the reader cannot see.
 */

/** Base64url without padding — RFC 7636 §4.2 requires exactly this alphabet. */
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

/** A verifier and its S256 challenge. 32 bytes → 43 chars, the RFC's minimum. */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomBase64url(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** CSRF state, bound to this flow and checked when the issuer redirects back. */
export function createState(): string {
  return randomBase64url(16);
}
