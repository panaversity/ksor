// The kernel's public surface (explicit at the boundary — isolatedDeclarations).

export * from "./config.js";
export {
  parseInstance,
  parseInstanceText,
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
  ContentInputError,
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
  parseViewer,
  validateViewer,
  WHOLE_RECORD_SCOPE,
  type ViewerRefusal,
} from "./lib/audience.js";
export { servingPolicy, type ServingPolicy } from "./lib/policy-row.js";
export {
  parseTrustFloor,
  tierOrdinal,
  tightenTrustFloor,
  TrustFloorError,
  trustGucs,
} from "./lib/trust.js";
export {
  GATE_PREDICATE_DIGEST,
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

export { instancePathOf, runContentCli } from "./commands.js";
// Provenance sentences, shared with `ksor build` (which cannot import commands'
// verb dispatch, and must not need to, to say the same thing about a commit).
export {
  dirtyNotice,
  provenanceGap,
  provenanceNotice,
  type ProvenanceGap,
} from "./lib/provenance.js";

export { AUDIENCE_CASES, type AudienceCase } from "./lib/audience-conformance.js";
// The canonical attachment rule, for the surfaces OUTSIDE this package that
// must not hand-copy it (decision 18) — the CLI's build lock and migrate.
export { attachmentKindOf, type AttachmentKind } from "./lib/attachment-rule.js";
export { withProbeDeadline, ProbeDeadlineError } from "./db.js";
export {
  assertGovernanceServable,
  GovernanceGateError,
  GOVERNANCE_SINCE,
} from "./governance-gate.js";
// The record module (record spec; decision 26): the profile, the control
// files and the checker `ksor build`, `ksor ingest` and the emitted checker
// run. Also exported as the `./record` subpath, which is what the emitted
// checker bundles; `ksor ingest` reads the record through it and `ksor build`
// writes with it.
export * from "./record/index.js";
export { parseInstanceDocument, type InstanceDocument } from "./record/instance.js";
// The ingest-side seams the record module does not own: the lock gate ingest
// reads, the manifest it builds, and the ledger it applies.
export {
  checkLock,
  conceptHashes,
  sha256OfDocument,
  formatRefusals,
  LOCK_PATH,
  type IngestRefusal,
  type IngestSlug,
} from "./ingest/lock-gate.js";
export { RecordRefused, policyRow } from "./ingest/build.js";
export { buildManifestFromRecord, BUNDLE } from "./ingest/adapters/plain-tree.js";
export { manifestToJson, type Manifest, type ManifestNode } from "./ingest/manifest.js";
export { governanceOf, sectionGovernance, type NodeGovernance } from "./ingest/governance.js";
export { applyLedger, foldLedger, unmergedLines } from "./ingest/ledger-apply.js";
