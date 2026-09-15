/**
 * The credential seam: TWO ways in, ONE thing out.
 *
 * ```
 *   API key  ──┐
 *              ├──►  OrcaCredential  ──►  every caller (transport, catalog, provider)
 *   PKCE     ──┘
 * ```
 *
 * The interface is deliberately one method wide. A transport that asks "is
 * this key from a browser or from a paste?" has already lost the property this
 * module exists to hold: the provider, the model catalog and every AI entry
 * consume a `OrcaCredential` and cannot tell the two adapters apart. The
 * difference between them lives entirely in `acquire`, and it is a difference
 * of USER EXPERIENCE (paste a key vs. approve in a browser), never of protocol
 * or privilege — both produce the same ordinary `sk-orca-…` key, billed to the
 * same user's account.
 *
 * `source` exists for three honest reasons and no others: an operator reading
 * a status line, a UI labelling which of the two entries is configured, and a
 * test proving the seam is real. It must never gate a request.
 *
 * There is no `refresh` on this interface, and there never will be. An
 * OrcaRouter PKCE grant yields a DURABLE API KEY, not an access/refresh token
 * pair — there is no refresh endpoint to call and no grant to send. The
 * lifecycle is: reuse the stored key until OrcaRouter revokes it; when the
 * relay answers `401`, the credential is terminal and the account needs
 * reauthentication (`needsReauth`). A client that schedules a refresh here is
 * inventing a protocol, and one that re-authorizes on every launch locks its
 * own users out — the consent endpoint allows 10 PKCE-issued keys per user per
 * 24 hours and answers 429 over it.
 */

import { redact } from "./pkce.js";

/** Which of the two entries produced this credential. For display, never for routing. */
export type CredentialSource = "api_key" | "pkce";

/**
 * The granted scope, read back from the exchange response rather than assumed
 * from the request. A client that asked for `connector` and was granted `api`
 * was approved by someone whose workspace role does not permit the wider grant,
 * and must say so instead of acting as though it holds what it asked for.
 */
export type OrcaScope = "api" | "connector" | "unknown";

/** One usable OrcaRouter credential. Immutable. */
export interface OrcaCredential {
  /** `sk-orca-…`. Never logged, never in a URL, never in an error body. */
  readonly apiKey: string;
  /** Where it came from. Display only. */
  readonly source: CredentialSource;
  /** The account it belongs to, when the issuer named one. */
  readonly userId: string | null;
  /** What was GRANTED. `unknown` when the issuer did not say. */
  readonly scope: OrcaScope;
  /**
   * Bumped whenever this account's stored key is replaced. A late failure from
   * a request issued under an older generation must never mark a newly
   * reauthorized credential as broken — the comparison is on this number, not
   * on the account alone.
   */
  readonly generation: number;
}

/** The issuer's answer to a successful exchange, already parsed and validated. */
export interface IssuedKey {
  readonly apiKey: string;
  readonly userId: string | null;
  readonly scope: OrcaScope;
}

/**
 * How a credential is obtained. Both adapters are asynchronous because the
 * PKCE one waits on a human, and forcing the API-key one to be synchronous
 * would fork every call site into two shapes.
 */
export interface OrcaCredentialSource {
  readonly source: CredentialSource;
  /** Resolve a credential, or throw. Never returns a placeholder or an empty key. */
  acquire(): Promise<OrcaCredential>;
}

/**
 * The API-key adapter: the user pastes (or exports) a key they already hold.
 *
 * Validation is a FORMAT check and nothing more. `sk-orca-` is not proof that
 * a credential is valid, and OrcaRouter exposes no free, non-billing
 * validation request — so this adapter does not send one. Sending a paid
 * inference request to make a settings form say "valid" would bill the user
 * for a UI state, which is the wrong trade. Validity is established by the
 * first real request, and a `401` from that request is what marks the account
 * for reauthentication.
 */
export class ApiKeyCredentialSource implements OrcaCredentialSource {
  readonly source = "api_key" as const;
  private readonly key: string;
  private readonly userId: string | null;
  private readonly generation: number;

  constructor(key: string, opts: { userId?: string | null; generation?: number } = {}) {
    this.key = key;
    this.userId = opts.userId ?? null;
    this.generation = opts.generation ?? 0;
  }

  async acquire(): Promise<OrcaCredential> {
    return {
      apiKey: this.key,
      source: this.source,
      userId: this.userId,
      // An API key the user brought is not an exchange response, so no `scope`
      // was ever granted to US and there is nothing to read back. `api` is what
      // a console-issued key carries; saying so is a claim, so it is `unknown`
      // and the caller treats it as "not narrowed".
      scope: "unknown",
      generation: this.generation,
    };
  }
}

/** The PKCE adapter: a key minted by an authorization this process performed. */
export class PkceCredentialSource implements OrcaCredentialSource {
  readonly source = "pkce" as const;
  private readonly run: () => Promise<IssuedKey>;
  private readonly generation: number;

  constructor(run: () => Promise<IssuedKey>, opts: { generation?: number } = {}) {
    this.run = run;
    this.generation = opts.generation ?? 0;
  }

  async acquire(): Promise<OrcaCredential> {
    const issued = await this.run();
    return {
      apiKey: issued.apiKey,
      source: this.source,
      userId: issued.userId,
      scope: issued.scope,
      generation: this.generation,
    };
  }
}

/**
 * A record shape check an operator's typo can fail, so the refusal arrives
 * before a network round trip. NOT a validity check — see the adapter above.
 */
export function looksLikeOrcaKey(value: string): boolean {
  return /^sk-orca-[A-Za-z0-9_-]{8,}$/.test(value.trim());
}

/** What a UI or a log may show. The key itself is never part of it. */
export interface CredentialSummary {
  readonly source: CredentialSource;
  readonly userId: string | null;
  readonly scope: OrcaScope;
  readonly generation: number;
  /** `sk-orca…(48)` — enough to tell two keys apart, not enough to use one. */
  readonly masked: string;
}

export function summarize(credential: OrcaCredential): CredentialSummary {
  return {
    source: credential.source,
    userId: credential.userId,
    scope: credential.scope,
    generation: credential.generation,
    masked: redact(credential.apiKey),
  };
}
