// @panaversity/ksor-gateway-kit — the fail-closed serving kit for KSoR
// gateways: auth postures (public / disabled / refuse), transport
// security, and bind resolution (the door composes the SDK's Web-standard
// transport behind Hono — decision 13 — so hardening is Hono middleware now). Converted from the production
// sor-gateway-kit slice (decision 6); serving fails safe (decision 7).

export {
  AuthConfigError,
  TokenVerifyError,
  audOk,
  buildAuth,
  currentActor,
  currentIdentity,
  runWithIdentity,
} from "./auth.js";
export type {
  Auth,
  AuthConfig,
  AuthDisabled,
  AuthPublic,
  TokenClaims,
  VerifiedIdentity,
  Verify,
  VerifierDeps,
} from "./auth.js";
export { envInt } from "./env.js";
export type { Env, WarnLog } from "./env.js";
export { RequiredEnvError, requireEnv, resolveBind } from "./serve.js";
export type { Bind } from "./serve.js";
export { TransportSecurityError, transportSecurityFromEnv } from "./transport-security.js";
export type { TransportSecuritySettings } from "./transport-security.js";
export { metadataUrls, resolveJwks } from "./jwks-discovery.js";
export type { JwksResolution, JwksSource } from "./jwks-discovery.js";
