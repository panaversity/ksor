/**
 * The body of a deferred-boot refusal, and the one decision inside it: whose
 * message may go on the wire.
 *
 * Three AUTHORED failures carry a remedy written for the operator —
 * `SchemaVersionError`, `GovernanceGateError`, `TextSearchConfigMismatch`. Their
 * whole multi-line message is the point; a caller that receives only the first
 * line has been told a problem exists and not how to end it.
 *
 * Everything else reaching this catch is infrastructure — most of it straight
 * from `pg`, whose connection and authentication failures name the host, the
 * resolved address, the port and the database user. Those went out verbatim
 * under `data.detail`, because the catch treated every error alike.
 *
 * So the split is by TYPE, not by message inspection: a class we wrote is a
 * class whose text we control. A driver error is refused with its class named
 * and its text withheld — the operator finds the real message in the server's
 * own logs, which is where an infrastructure fault belongs.
 *
 * "Text we control" turned out not to mean "text that is safe". A
 * `GovernanceGateError` names the `stable_id`s of documents somebody WITHDREW,
 * and under `KSOR_AUTH=disabled-public` this body reaches anyone who can reach
 * the port — so the strongest governance act in the product was enumerating
 * what it had removed, in both the summary line and the detail. That class now
 * carries a `wire` text with the identifiers removed, and this module reads it.
 * Which half is public is decided where the message is WRITTEN; all that is
 * decided here is that the public half is the one used.
 */

import {
  AudienceError,
  EmbeddingSpaceMismatch,
  GovernanceGateError,
  SchemaVersionError,
  TextSearchConfigMismatch,
} from "@panaversity/ksor-content";

/** The JSON-RPC error envelope a 503 refusal returns. */
export interface RefusalBody {
  readonly jsonrpc: "2.0";
  readonly error: {
    readonly code: number;
    readonly message: string;
    readonly data?: { readonly detail: string };
  };
  readonly id: null;
}

/**
 * OUR OWN REFUSALS, and which part of each may be served — one table, because
 * this was two lists and they drifted.
 *
 * `compose` re-throws these rather than deferring them: they are verdicts about
 * the record, and no retry changes a verdict. This module serves their text,
 * because a caller told only that something is wrong has been told nothing they
 * or their operator can act on. Those are the same set, and they were written
 * out separately — so `AudienceError` and `EmbeddingSpaceMismatch` were refused
 * by one and unrecognised by the other, and fell to the driver branch. A
 * one-character typo in `KSOR_AUDIENCE`, on a container whose database happened
 * to be asleep at boot, then answered every request with "the content store is
 * unavailable (AudienceError)": a refusal misdiagnosing itself as the outage it
 * is not, about a database that had just replied, while the text naming the fix
 * reached nobody.
 *
 * Each entry states which half of its message is public and WHY. Two classes
 * carry record content — the paths of withdrawn documents, the record's own
 * audience registry — and hold a `wire` text without it, decided where the
 * message is written. The rest name only schema versions, configured values and
 * remedies, which are not facts about the governed content.
 *
 * Anything NOT here is infrastructure and is refused with its class named and
 * its text withheld, which is the fail-closed direction: forgetting to enrol a
 * new class costs a caller some detail, and never leaks.
 */
interface Refusal {
  readonly matches: (error: unknown) => boolean;
  readonly wire: (error: Error) => string;
}

/**
 * One entry, with the narrowing CARRIED rather than asserted.
 *
 * Written the obvious way, each entry needs `wire: (e) => (e as
 * GovernanceGateError).wire` — and an `as` on a value this module exists to
 * police is the wrong instrument: it is an assertion the compiler stops
 * checking, so a getter reading a field its matcher's class does not have would
 * put `undefined` on the wire instead of a refusal. Here the guard that
 * SELECTED the entry is the guard that narrows the argument, so no assertion is
 * made at all.
 *
 * What this does NOT buy is a compile error for pairing the wrong getter with
 * the wrong matcher — tried both ways before writing this down, and neither is
 * rejected, because TypeScript is structural and the two classes that carry a
 * `wire` are interchangeable to it. That crossing is harmless for exactly the
 * same reason (both getters read the same field), so the guarantee worth having
 * is the one above: no unchecked assertion. The membership itself is asserted
 * in `refusal-body.test.ts`, which is where it can be.
 */
function refusal<T extends Error>(
  matches: (error: unknown) => error is T,
  wire: (error: T) => string,
): Refusal {
  return { matches, wire: (error) => (matches(error) ? wire(error) : error.message) };
}

const REFUSALS: readonly Refusal[] = [
  // Names a schema version and a `ksor schema` command.
  refusal(
    (e): e is SchemaVersionError => e instanceof SchemaVersionError,
    (e) => e.message,
  ),
  // Names the two text-search configurations, both from instance.md / the DDL.
  refusal(
    (e): e is TextSearchConfigMismatch => e instanceof TextSearchConfigMismatch,
    (e) => e.message,
  ),
  // Names the embedding model and dimension the deployment declares.
  refusal(
    (e): e is EmbeddingSpaceMismatch => e instanceof EmbeddingSpaceMismatch,
    (e) => e.message,
  ),
  // CARRIES RECORD CONTENT: the stable_ids of withdrawn documents.
  refusal(
    (e): e is GovernanceGateError => e instanceof GovernanceGateError,
    (e) => e.wire,
  ),
  // CARRIES RECORD CONTENT: the record's registered audience names.
  refusal(
    (e): e is AudienceError => e instanceof AudienceError,
    (e) => e.wire,
  ),
];

/**
 * Is this one of OUR verdicts, rather than an infrastructure failure?
 *
 * Named classes only. Matching on message prose would put the decision back
 * inside the strings it is meant to police, and a reworded driver error would
 * quietly re-open the leak. Exported so `compose` decides what to defer with
 * this same table instead of a second copy of the list.
 */
export function isRefusal(error: unknown): error is Error {
  return REFUSALS.some((entry) => entry.matches(error));
}

/**
 * The authored text a CALLER may read.
 *
 * For two of the five, `message` is the operator's copy and names the record's
 * own documents or audiences while `wire` is the same refusal without them.
 * Read for the summary line as well as the detail, because the identifiers were
 * in the first line too — a fix that guarded only `data.detail` would have left
 * them on the wire.
 */
function wireText(error: Error): string {
  return REFUSALS.find((entry) => entry.matches(error))?.wire(error) ?? error.message;
}

export function refusalBody(error: unknown): RefusalBody {
  if (isRefusal(error)) {
    const text = wireText(error);
    return {
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: `this record cannot be served: ${text.split("\n")[0] ?? ""}`,
        data: { detail: text },
      },
      id: null,
    };
  }
  // The class name is safe and useful — it distinguishes "your request was
  // fine, our store is not" from a refusal the caller could act on — and it is
  // the same reduction `ContentStoreError` already applies on the serving path.
  const kind = error instanceof Error ? error.name : "Error";
  return {
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message:
        `this record cannot be served: the content store is unavailable (${kind}). ` +
        "The reason is in this server's logs; it is withheld here because a driver " +
        "error names the database host and user.",
    },
    id: null,
  };
}

/**
 * Why this instance is NOT ready, for the readiness probe.
 *
 * `/ready` collapsed every rejection to `false` and hardcoded "content store
 * unreachable", so a refusal no retry can fix — a too-old schema, a governance
 * violation — was reported forever as a network fault, about a database that
 * had just answered. Meanwhile POST /mcp returned the real remedy: one door
 * telling two stories about why it was down.
 *
 * It deliberately says LESS than {@link refusalBody} does, and this is the one
 * place in the door where that asymmetry is right. `/ready` is unauthenticated
 * on EVERY posture — a bearer-gated deployment still answers it to anyone who
 * can reach the port, which is exactly what a load balancer needs and exactly
 * what /mcp refuses. Repeating the governance text here would hand an anonymous
 * prober the record's governance state on the one deployment whose operator
 * paid for SSO so that it could not be had. So the probe names the CLASS — the
 * same reduction the driver path above already applies, and enough to tell an
 * operator whether to look at the network or at their configuration — and sends
 * them to the logs, where the full remedy has been written all along.
 */
export function notReadyReason(error: unknown): string {
  if (isRefusal(error)) {
    return (
      `boot checks refused (${error.name}) — a configuration or governance refusal, not a ` +
      "network fault; the reason and its fix are in this server's logs"
    );
  }
  return "content store unreachable";
}
