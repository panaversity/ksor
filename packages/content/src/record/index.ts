/**
 * The record module as one surface (record spec §6; decision 26): the
 * profile, the control files, the checker, the lock and the leaf rules — and
 * nothing that touches a database or a provider. Published as the
 * `@panaversity/ksor-content/record` subpath so the emitted checker bundles
 * exactly this and not the kernel behind it (the first build that took the
 * package root carried pg-pool into an adopter's `pnpm check`).
 */
export { splitFrontmatter, frontmatterText, normalizeText, type Split } from "./frontmatter.js";
export { parseInstant } from "./instant.js";
export {
  REFUSAL_SLUGS,
  sortRefusals,
  formatRefusal,
  type Refusal,
  type RefusalSlug,
} from "./refusal.js";
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
} from "./profile.js";
export {
  parsePolicy,
  resolveApprovers,
  resolveOwner,
  type Policy,
  type PolicyResult,
} from "./policy.js";
export {
  parseLedger,
  inForce,
  checkLedgerActors,
  checkLedgerAgainstTree,
  checkLedgerAppendOnly,
  entryDigest,
  ledgerDigests,
  denies,
  type Ledger,
  type LedgerEntry,
  type LedgerBaseline,
  type LedgerBaselineEntry,
  type Denial,
} from "./ledger.js";
export {
  composeLock,
  parseLock,
  buildIdOf,
  sha256Hex,
  canonicalViewers,
  admittedViewersOf,
  OKF_PIN,
  LOCK_FORMAT,
  type Lock,
  type LockDocument,
  type LockInput,
  type LockResult,
  type BuildIdInputs,
  type AdmissionConcept,
  type Drafts,
} from "./lock.js";
export { git, historicLedger, type HistoricLedger } from "./git-ledger.js";
export { generateIndexes, parseIndex, humanise, type IndexInput } from "./index-file.js";
export { checkFootnotes, linkTargets, resolveLink } from "./citations.js";
export { checkRecord, type RecordFiles, type CheckOptions, type CheckResult } from "./check.js";
export { loadRecord, loadScaffoldStructure, resolveInstanceDir } from "./load.js";
export {
  checkHygiene,
  checkScaffoldStructure,
  firstBrokenPngChunk,
  type HygieneTree,
  type ScaffoldStructure,
} from "./hygiene.js";
export { overlaps, mayReach } from "../lib/audience-rule.js";
export { admitsLifecycle, type LifecycleDoc, type Surface } from "../lib/lifecycle-rule.js";
// The decision TABLES are not re-exported here. This barrel is what the site
// copies and what the emitted checker bundles, and a table is a test fixture:
// shipping it would put the spec's rows in an adopter's site bundle. Tests
// import them from `../lib/*-conformance.js`, and the package index exports
// them for the suites in packages/ksor.
