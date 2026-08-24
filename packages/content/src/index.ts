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
// will run. Nothing in the CLI consumes it yet.
export { splitFrontmatter, normalizeText, type Split } from "./record/frontmatter.js";
export { REFUSAL_SLUGS, sortRefusals, type Refusal, type RefusalSlug } from "./record/refusal.js";
export {
  parseConcept,
  conceptIdOf,
  RESERVED_TYPES,
  STATUSES,
  LEGACY_KEYS,
  TRUST_TIERS,
  type Concept,
  type ConceptResult,
  type Status,
  type TrustTier,
} from "./record/profile.js";
export {
  parsePolicy,
  resolveApprovers,
  resolveOwner,
  type Policy,
  type PolicyResult,
} from "./record/policy.js";
export {
  parseLedger,
  inForce,
  checkLedgerActors,
  checkLedgerAgainstTree,
  checkLedgerShrank,
  type Ledger,
  type LedgerEntry,
  type LedgerBaseline,
} from "./record/ledger.js";
export { generateIndexes, parseIndex, humanise, type IndexInput } from "./record/index-file.js";
export {
  checkRecord,
  type RecordFiles,
  type CheckOptions,
  type CheckResult,
} from "./record/check.js";
export { loadRecord, resolveInstanceDir } from "./record/load.js";
export { overlaps, mayReach } from "./lib/audience-rule.js";
export { OVERLAP_CASES, WIDENING_CASES } from "./lib/audience-conformance.js";
export { admitsLifecycle, type LifecycleDoc, type Surface } from "./lib/lifecycle-rule.js";
export { LIFECYCLE_CASES } from "./lib/lifecycle-conformance.js";
