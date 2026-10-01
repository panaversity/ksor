/**
 * OrcaRouter, as ONE import surface.
 *
 * [OrcaRouter](https://www.orcarouter.ai) is an OpenAI-compatible AI gateway
 * built for both models and agents, with adaptive routing, automatic failover,
 * zero-markup inference, observability, guardrails, and agent-tool governance.
 *
 * Everything the rest of ksor is allowed to know about OrcaRouter is
 * re-exported here, so a caller never reaches into a submodule and the
 * boundaries between the credential seam, the transport and the catalog stay
 * visible in one file.
 */

export {
  AUTHORIZE_PATH,
  DEFAULT_API_BASE,
  DEFAULT_AUTH_BASE,
  EXCHANGE_PATH,
  OrcaEndpointError,
  authorizeUrl,
  chatCompletionsUrl,
  exchangeUrl,
  isLoopbackHost,
  modelsUrl,
  parseOrigin,
  resolveEndpoints,
  type OrcaEndpoints,
} from "./endpoints.js";

export {
  base64url,
  challengeFor,
  createAttempt,
  redact,
  stateMatches,
  type PkceAttempt,
} from "./pkce.js";

export {
  ApiKeyCredentialSource,
  PkceCredentialSource,
  looksLikeOrcaKey,
  summarize,
  type CredentialSource,
  type CredentialSummary,
  type IssuedKey,
  type OrcaCredential,
  type OrcaCredentialSource,
  type OrcaScope,
} from "./credential.js";

export {
  ORCA_KEY_VAR,
  OrcaCredentialFileError,
  clearStoredKey,
  credentialsPath,
  readStoredKey,
  currentSummary,
  operatorCredential,
  operatorResolver,
  storedCredential,
  storedSummary,
  writeStoredKey,
} from "./store.js";

export {
  OrcaAuthError,
  buildAuthorizeUrl,
  connectLoopback,
  connectOutOfBand,
  exchangeCode,
  openInBrowser,
  scopeWarning,
  type AuthFailureKind,
} from "./connect.js";

export {
  DEFAULT_TEXT_MODEL,
  OrcaHttpError,
  OrcaRouterEmbeddingProvider,
  OrcaRouterTextGenerator,
  OrcaUnauthorizedError,
  describeCredential,
  isFatal,
  isRetryable,
  isRetryableQuery,
  type OrcaCredentialResolver,
} from "./transport.js";

export {
  CATALOG_MAX_BYTES,
  CATALOG_MAX_ITEMS,
  CATALOG_TIMEOUT_MS,
  VERIFIED_SEED,
  discoverCatalog,
  parseModel,
  selectModels,
  stillCompatible,
  type Capability,
  type Catalog,
  type CatalogModel,
  type FilterOptions,
  type InputModality,
} from "./catalog.js";

export { escapeHtml, renderConsolePage, type ConsoleModel } from "./console-page.js";

export { startConsole, type ConsoleHandle, type ConsoleOptions } from "./console.js";

export {
  INITIAL_STATE,
  installCredential,
  markNeedsReauth,
  refOf,
  reauthMessage,
  usable,
  type AccountCredentialState,
  type CredentialRef,
  type CredentialStatus,
} from "./reauth.js";
