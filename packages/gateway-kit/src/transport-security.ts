// The opt-in DNS-rebinding / Host+Origin gate, converted from the
// predecessor's wiring.transport_security_from_env (decision 6 — the ONLY
// piece of wiring.py that crosses; the product/bundle plane around it was
// dropped). The result is the settings shape the MCP SDK's streamable-HTTP
// transport accepts, and it must be passed wherever that transport is
// configured so a set var is never a silent no-op. Known recorded deviation:
// the MCP spec's Origin-validation MUST is met only when these are set (or on
// a loopback bind, where the SDK arms its own gate); the public doors are
// bearer-gated, so an evil Origin gains nothing without a token.

import type { Env } from "./env.js";

export type TransportSecuritySettings = {
  enableDnsRebindingProtection: true;
  allowedHosts: string[];
  allowedOrigins: string[];
};

/**
 * SOR_ALLOWED_HOSTS / SOR_ALLOWED_ORIGINS (comma-separated) → settings, or
 * null when both are unset (no gate; the deployment edge fronts the service).
 */
export function transportSecurityFromEnv(env: Env = process.env): TransportSecuritySettings | null {
  const split = (raw: string | undefined): string[] =>
    (raw ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
  const allowedHosts = split(env.SOR_ALLOWED_HOSTS);
  const allowedOrigins = split(env.SOR_ALLOWED_ORIGINS);
  if (allowedHosts.length === 0 && allowedOrigins.length === 0) return null;
  return { enableDnsRebindingProtection: true, allowedHosts, allowedOrigins };
}
