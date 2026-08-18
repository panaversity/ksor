// @panaversity/ksor-gateway-kit — the fail-closed serving kit for KSoR
// gateways: auth postures (public / disabled / refuse), edge hardening,
// transport security, and bind resolution. Converted from the production
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
export { harden } from "./harden.js";
export type { HardenOptions, HttpHandler } from "./harden.js";
export { RequiredEnvError, requireEnv, resolveBind, runServer } from "./serve.js";
export type { Bind, RunningServer, RunServerOptions } from "./serve.js";
export { transportSecurityFromEnv } from "./transport-security.js";
export type { TransportSecuritySettings } from "./transport-security.js";
