// The kernel's public surface (explicit at the boundary — isolatedDeclarations).

export * from "./config.js";
export {
  parseInstance,
  parseInstanceText,
  parseFrontmatter,
  InstanceParseError,
  SUPPORTED_FORMATS,
  type ContentInstance,
} from "./instance.js";
export {
  contentPool,
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
export { aembedIntent, embedIntent, embedInput } from "./lib/embedding.js";
export {
  outlineDocuments,
  readDocument,
  DOCUMENT_BUDGET_CHARS,
  type OutlineNodeWire,
  type ReadOptions,
  type ReadResult,
} from "./service.js";
export { UnknownSlug, findDocument, outline, documentChunks } from "./lib/read.js";
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
