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
 */

import {
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
 * Did WE write this error's text?
 *
 * Named classes only. Matching on message prose would put the decision back
 * inside the strings it is meant to police, and a reworded driver error would
 * quietly re-open the leak.
 */
function isAuthored(error: unknown): error is Error {
  return (
    error instanceof SchemaVersionError ||
    error instanceof GovernanceGateError ||
    error instanceof TextSearchConfigMismatch
  );
}

export function refusalBody(error: unknown): RefusalBody {
  if (isAuthored(error)) {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: `this record cannot be served: ${error.message.split("\n")[0] ?? ""}`,
        data: { detail: error.message },
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
