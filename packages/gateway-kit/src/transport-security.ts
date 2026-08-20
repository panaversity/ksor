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
  const split = (raw: string | undefined): string[] =>
    (raw ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
  const allowedHosts = split(env.KSOR_ALLOWED_HOSTS);
  const allowedOrigins = split(env.KSOR_ALLOWED_ORIGINS);
  if (allowedHosts.length === 0 && allowedOrigins.length === 0) return null;
  return { enableDnsRebindingProtection: true, allowedHosts, allowedOrigins };
}
