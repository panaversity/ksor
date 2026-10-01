/**
 * A `401` from the relay is a TERMINAL state, not a retry.
 *
 * An OrcaRouter PKCE grant produces a durable API key. There is no access
 * token, no refresh token and no refresh endpoint, so a rejected key cannot be
 * renewed — the only remedy is the user authorizing again. A client that
 * "refreshes" here is inventing a protocol, and one that retries is hammering
 * a door that will not open.
 *
 * The subtle half is WHICH credential gets marked. A login is asynchronous: a
 * request issued under generation 3 can fail after the user has already
 * reauthorized as generation 4. Marking "the account" broken at that moment
 * would poison a credential that is perfectly good — the user would have just
 * signed in and would be told they are signed out. So the transition names the
 * EXACT account AND the EXACT generation that made the rejected request, and
 * refuses to touch anything else. This is why `OrcaCredential` carries a
 * generation at all.
 */

import type { OrcaCredential } from "./credential.js";

export type CredentialStatus = "ok" | "needsReauth";

export interface AccountCredentialState {
  /** The account the issuer named. `null` when it named none. */
  readonly userId: string | null;
  /** Monotonic; bumped by every successful (re)authorization. */
  readonly generation: number;
  readonly status: CredentialStatus;
  /** Why the account needs reauthorization. Never holds a key. */
  readonly reason: string | null;
}

export const INITIAL_STATE: AccountCredentialState = {
  userId: null,
  generation: 0,
  status: "ok",
  reason: null,
};

/** The identity of the credential that made a request. */
export interface CredentialRef {
  readonly userId: string | null;
  readonly generation: number;
}

export function refOf(credential: OrcaCredential): CredentialRef {
  return { userId: credential.userId, generation: credential.generation };
}

/**
 * Mark the account that made a rejected request. Returns the SAME state object
 * when the ref is stale, so a caller can compare by identity and skip a
 * pointless store write.
 *
 * A stale ref is not an error and is not logged as one — it is the expected
 * outcome of an old request failing after a new login, and it is exactly the
 * case this function exists to make a no-op.
 */
export function markNeedsReauth(
  state: AccountCredentialState,
  rejected: CredentialRef,
  reason: string,
): AccountCredentialState {
  if (rejected.generation !== state.generation) return state;
  if (state.userId !== null && rejected.userId !== null && rejected.userId !== state.userId) {
    return state;
  }
  return {
    userId: state.userId ?? rejected.userId,
    generation: state.generation,
    status: "needsReauth",
    reason,
  };
}

/**
 * Install a freshly authorized credential: bump the generation and clear the
 * terminal status. Bumping is what makes every in-flight request issued under
 * the previous generation stale, so its failure can no longer mark this one.
 */
export function installCredential(
  state: AccountCredentialState,
  credential: OrcaCredential,
): AccountCredentialState {
  return {
    userId: credential.userId ?? state.userId,
    generation: state.generation + 1,
    status: "ok",
    reason: null,
  };
}

/** Whether a request may be attempted under this state. */
export function usable(state: AccountCredentialState): boolean {
  return state.status === "ok";
}

/** The sentence a user sees. Names the remedy, never the credential. */
export function reauthMessage(state: AccountCredentialState): string {
  return (
    `the OrcaRouter key for ${state.userId ?? "this account"} was rejected (401) — ` +
    "it has been revoked, or the authorization was withdrawn\n" +
    "  fix: run `ksor connect orcarouter` again, or paste a new key with `ksor connect orcarouter --key`\n" +
    "  note: an OrcaRouter key is durable, not a refreshable token — there is nothing to refresh, " +
    "so this state clears only when a new authorization succeeds"
  );
}
