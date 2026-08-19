// The opt-in DNS-rebinding / Host+Origin gate, converted from the
// predecessor's wiring.transport_security_from_env (decision 6 — the ONLY
// piece of wiring.py that crosses; the product/bundle plane around it was
// dropped). The result is the settings shape the MCP SDK's streamable-HTTP
// transport accepts, and it must be passed wherever that transport is
// configured so a set var is never a silent no-op. The MCP spec's
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
