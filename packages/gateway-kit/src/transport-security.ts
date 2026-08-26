// The opt-in DNS-rebinding / Host+Origin gate, converted from the
// predecessor's wiring.transport_security_from_env (decision 6 — the ONLY
// piece of wiring.py that crosses; the product/bundle plane around it was
// dropped). It parses KSOR_ALLOWED_HOSTS/ORIGINS into an allowlist pair.
//
// The shape still mirrors the SDK transport's own options, but since
// decision 13 the gate is HONO MIDDLEWARE, not a transport option —
// `enableDnsRebindingProtection` is therefore unread here, and SDK v2 has
// itself deprecated those transport-level options in favour of external
// middleware (corrected 2026-08-20: this header used to instruct readers to
// pass the settings into the transport, a contract the code no longer has).
// The MCP spec's
// Origin-validation MUST is met by the DOOR, not the SDK: the content
// gateway's resolveSecurity arms a default loopback Origin allowlist on every
// loopback bind (the SDK's own DNS-rebinding gate is NOT enabled by that
// composition) and honors these explicit lists on a public bind — where the
// doors are also bearer-gated, so an evil Origin gains nothing without a token.

import type { Env } from "./env.js";

/** A malformed transport-security value, refused at boot rather than at the first request. */
export class TransportSecurityError extends Error {
  override readonly name: string = "TransportSecurityError";
}

export type TransportSecuritySettings = {
  enableDnsRebindingProtection: true;
  allowedHosts: string[];
  allowedOrigins: string[];
};

/**
 * KSOR_ALLOWED_HOSTS / KSOR_ALLOWED_ORIGINS (comma-separated) → settings, or
 * null when both are unset (no gate; the deployment edge fronts the service).
 */
export function transportSecurityFromEnv(env: Env = process.env): TransportSecuritySettings | null {
  // LOWER-CASED, not merely trimmed. A Host is case-insensitive (RFC 9110
  // §4.2.3) and so are an origin's scheme and host (RFC 6454 §4), while the
  // gate that reads these is an exact `Set` lookup — so
  // `KSOR_ALLOWED_HOSTS=MCP.Acme.com`, an ordinary way to write a hostname,
  // 421'd every client that ever resolved it. A total outage from a valid
  // setting, and the refusal named neither the value nor this variable
  // (review finding 4). The door lower-cases the incoming header to match.
  //
  // Only the ASCII case folding a hostname can carry: `toLowerCase` is enough
  // for host names and schemes, which are ASCII by the time they are on the
  // wire, and an origin has no path whose case could matter.
  const split = (raw: string | undefined): string[] =>
    (raw ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item !== "");
  const allowedHosts = split(env.KSOR_ALLOWED_HOSTS);
  // An origin is scheme + host + port and NOTHING else, so it is normalised
  // through the parser rather than by string handling. `https://a.com/` — the
  // form anyone copies out of a browser bar — became the allowlist entry
  // "https://a.com/", while a browser sends `Origin: https://a.com`, and the
  // exact `Set.has` in the door then 403'd every browser client. Same class as
  // the case-folding defect fixed in this diff: fails closed, so it is
  // availability rather than exposure, and it is a total outage from a valid
  // setting either way. A value that is not a URL at all is refused here rather
  // than silently never matching.
  const allowedOrigins = split(env.KSOR_ALLOWED_ORIGINS).map((value) => {
    try {
      return new URL(value).origin.toLowerCase();
    } catch {
      throw new TransportSecurityError(
        `KSOR_ALLOWED_ORIGINS contains ${JSON.stringify(value)}, which is not an origin. ` +
          "Each entry is scheme://host[:port] — for example https://app.example.com — with no " +
          "path; an unparseable entry would match nothing and refuse every browser client.",
      );
    }
  });
  if (allowedHosts.length === 0 && allowedOrigins.length === 0) return null;
  return { enableDnsRebindingProtection: true, allowedHosts, allowedOrigins };
}
