/**
 * PKCE, in one small module, so no caller can do it a slightly different way.
 *
 * The whole point of the flow is that the **verifier never leaves this
 * process**: only its SHA-256 hash rides the authorize URL. Anyone who
 * intercepts the auth code — from browser history, a proxy, a request log —
 * cannot redeem it, because redeeming it requires the verifier, and the
 * verifier is not in any of those places. Every rule below follows from that
 * one sentence.
 *
 *   - Fresh, from a cryptographic RNG, **per attempt**. A verifier reused
 *     across attempts, or derived from anything guessable (a timestamp, a
 *     username, a fixed salt), gives the property away.
 *   - `S256` ALWAYS. `plain` sends the verifier itself as the challenge, which
 *     puts it exactly where the design says it must not be. The spec requires
 *     S256 for the out-of-band flow; it is equally required for loopback,
 *     because the consent screen lets the user choose "show me a code" and no
 *     authorize parameter prevents it — so a human can always end up holding
 *     the code, and a shown code must be redeemable only by the process that
 *     generated the verifier.
 *   - The challenge is `base64url(sha256(verifier))` with **no padding**, which
 *     is what the server compares against.
 *
 * `state` is a separate secret with a separate job: it is the CSRF token that
 * proves a callback delivered to our listener was delivered for OUR attempt.
 * It is compared before the code is looked at, and in constant time.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 bytes of entropy, base64url — 43 characters, within the RFC 7636 43–128 range. */
const VERIFIER_BYTES = 32;
/** 16 bytes. Opaque and unguessable is the whole requirement; it is not a credential. */
const STATE_BYTES = 16;

/** RFC 4648 §5, unpadded — the encoding both `code_challenge` and `state` use. */
export function base64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

/** `base64url(sha256(verifier))`, unpadded. The only challenge method this client sends. */
export function challengeFor(verifier: string): string {
  return base64url(createHash("sha256").update(verifier, "utf8").digest());
}

export interface PkceAttempt {
  /** Never logged, never URL-encoded, never sent before the exchange. */
  readonly verifier: string;
  /** The only half that rides the authorize URL. */
  readonly challenge: string;
  /** Echoed back verbatim by the consent screen; compared before the code is used. */
  readonly state: string;
}

/** A brand-new attempt. Called once per authorization, never cached, never reused. */
export function createAttempt(): PkceAttempt {
  const verifier = base64url(randomBytes(VERIFIER_BYTES));
  return {
    verifier,
    challenge: challengeFor(verifier),
    state: base64url(randomBytes(STATE_BYTES)),
  };
}

/**
 * Constant-time state comparison.
 *
 * A byte-by-byte `===` on a short string is a timing oracle in principle; here
 * the state is checked against an attacker who chose the callback, so the
 * comparison is the one place worth spending a `timingSafeEqual` on. Lengths
 * are compared first because `timingSafeEqual` throws on a length mismatch —
 * and a length mismatch is a mismatch, not a secret.
 */
export function stateMatches(expected: string, received: string | null): boolean {
  if (received === null) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Redact a secret for any message a user or a log can see. Keeps the first
 * four characters of the `sk-orca-` prefix and nothing else, so an operator can
 * tell two keys apart without either being recoverable.
 */
export function redact(secret: string): string {
  if (secret === "") return "(none)";
  const head = secret.slice(0, Math.min(8, secret.length));
  return `${head}…(${secret.length})`;
}

/**
 * Strip every OrcaRouter key out of a piece of EXTERNAL text before it reaches
 * a message.
 *
 * A vendor's error body is written by somebody else, and it is allowed to
 * quote the request back — including, on a badly-built gateway, the
 * `Authorization` header it just rejected. Passing that text through
 * unmodified puts a live credential into our error, which then goes to a
 * terminal, a log file, or a crash report. The key in that text belongs to the
 * USER, so it is theirs to lose, not ours to print.
 *
 * Applied at the ONE place external text enters an error (`parseErrorBody`),
 * so a second call site cannot forget it.
 */
export function scrubSecrets(text: string): string {
  // The prefix plus the base64url body a real key carries. Length-bounded so a
  // pathological input cannot make this quadratic.
  return text.replace(/\bsk-orca-[A-Za-z0-9_-]{4,}/g, (match) => redact(match));
}
