// The kernel's public surface (explicit at the boundary — isolatedDeclarations).

export * from "./config.js";
export {
  parseInstance,
  parseInstanceText,
  parseFrontmatter,
  InstanceParseError,
  NoDatabaseDeclared,
  SUPPORTED_FORMATS,
  type ContentInstance,
} from "./instance.js";
export {
  contentPool,
  contentPoolMin,
  runAuditRead,
  runRead,
  runProbe,
  runAudit,
  runIngest,
  ContentStoreError,
  TENANT_GUC,
  RUNTIME_ROLE,
  INGEST_ROLE,
  type DbOp,
} from "./db.js";
export {
  applySchema,
  assertSchemaCompatible,
  renderSchema,
  renderSchemaText,
  schemaSqlPath,
  schemaVersion,
  SchemaVersionError,
} from "./schema.js";
export { grantIngest, revokeIngest, SchemaNotAppliedError, type GrantOutcome } from "./grant.js";
export { keywordAbstains, vectorAbstains, type AbstainConfig } from "./lib/abstain.js";
export {
  audienceGucs,
  AudienceError,
  visibleTiers,
  WHOLE_RECORD_SCOPE,
  type AudienceModel,
} from "./lib/audience.js";
export {
  hybridSearch,
  keywordSearch,
  topOneScore,
  splitHits,
  vectorLiteral,
  VECTOR_TXN_GUCS,
  type Hit,
  type SearchScope,
} from "./lib/search.js";
export {
  keyRingFromEnv,
  mint,
  validate,
  TOKEN_TTL_S,
  type KeyRing,
  type SnapshotScope,
  type SnapshotToken,
  type TokenVerdict,
} from "./lib/snapshot.js";
export { logRead, type ReadAction, type ReadLogEntry } from "./lib/rlog.js";
export {
  search,
  EmptyQueryError,
  UncalibratedFloorError,
  CONTENT_ADVISORY,
  MAX_QUERY_CHARS,
  MAX_SEARCH_K,
  SEARCH_BUDGET_CHARS,
  instructionLike,
  stripAssetMarkup,
  type SearchHit,
  type SearchResult,
  type ServiceContext,
  type SnapshotEnvelope,
} from "./service.js";
export {
  buildShippedProvider,
  providerNeedsApiKey,
  PROVIDERS,
  MissingProviderKeyError,
} from "./lib/providers/registry.js";
export type { EmbeddingProvider, Intent, TextGenerator } from "./lib/embedding.js";
export {
  embedQueryVlit,
  EmptyQueryError as QueryEmbedEmptyError,
  QueryEmbedTimeoutError,
  QueryEmbedUnavailable,
} from "./lib/query-embed.js";
export { checkEmbeddingSpace, EmbeddingSpaceMismatch, type SpaceCheck } from "./lib/space.js";
export { storedTextSearchConfig, TextSearchConfigMismatch } from "./schema.js";
export { aembedIntent, embedIntent, embedInput } from "./lib/embedding.js";
export {
  outlineDocuments,
  readDocument,
  DOCUMENT_BUDGET_CHARS,
  type OutlineNodeWire,
  type ReadOptions,
  type ReadResult,
} from "./service.js";
export {
  UnknownSlug,
  findDocument,
  outline,
  documentChunks,
  MAX_OUTLINE_LIMIT,
} from "./lib/read.js";
export { windowDocument, codePointLength, cleanCut, estTokens } from "./lib/windowing.js";
export {
  normalizeQueries,
  parseQueriesFile,
  runCalibration,
  type CalibrationOptions,
} from "./calibrate/run.js";
export {
  buildReport,
  renderReport,
  BUILT_IN_OOC,
  type CalibrationReport,
  type ScoredQuery,
} from "./calibrate/math.js";
export { GeminiTextGenerator } from "./lib/providers/gemini.js";

export { runContentCli } from "./commands.js";

export { AUDIENCE_CASES, type AudienceCase } from "./lib/audience-conformance.js";
export { decideVisible, type AudienceModel as SiteAudienceModel } from "./lib/audience-rule.js";
export { withProbeDeadline, ProbeDeadlineError } from "./db.js";
export {
  assertGovernanceServable,
  GovernanceGateError,
  GOVERNANCE_SINCE,
} from "./governance-gate.js";
export {
  frontmatterMap,
  isDenied,
  scalarLike,
  stableIdFrom,
  recordPathFrom,
  type DenylistManifest as SiteDenylistManifest,
} from "./lib/denial-rule.js";

// The record module (record spec; decision 26): the profile, the control
// files and the checker `ksor build`, `ksor ingest` and the emitted checker
// run. Also exported as the `./record` subpath, which is what the emitted
// checker bundles.
export * from "./record/index.js";
