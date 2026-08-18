/**
 * EVAL-LOCKED constants, quarried verbatim from the oracle
 * (sor-agentfactory @ b554f91, config.py) — changing any of these is a
 * deliberate, measured decision, never a refactor; the bake-off record lives
 * with the predecessor's eval docs. Deployment-varying knobs (floors,
 * budgets, DSN env names, tenant) are NOT here — they live in the instance
 * definition and arrive parsed at composition time.
 */

export const EMBED_MODEL = "gemini-embedding-001";
/** MRL truncation of native 3072; == VECTOR(1536); truncation MUST re-normalize. */
export const EMBED_DIM = 1536;
export const EMBED_TASK_DOCUMENT = "RETRIEVAL_DOCUMENT";
export const EMBED_TASK_QUERY = "RETRIEVAL_QUERY";
/**
 * The full embed RECIPE identity (model · dimension · document task) — the
 * whole thing that has to match on insert and query or cosine is nonsense.
 * Changing ANY component is a deliberate, measured re-embed (never a
 * refactor): a MODEL change is gated on the carry-forward + finalize paths
 * and surfaced at serve time; DIM is enforced by the `vector(1536)` column
 * type (a mismatch errors at query time); a DOCUMENT-TASK change is
 * recipe-level and NOT observable in stored rows, so it is the operator's
 * FORCE=1 re-embed responsibility. Named here so drift has one label.
 */
export const EMBED_RECIPE: string = `${EMBED_MODEL}/d${EMBED_DIM}/${EMBED_TASK_DOCUMENT}`;
export const RRF_K = 60;
/** bump ⇒ provenance (v5: CommonMark fences). All char limits count CODE POINTS (Python len parity). */
export const CHUNK_POLICY = "heading-aware-1500-content-only-v5";
export const MAX_CHARS = 1500;
export const NAV_MAX_CHARS = 250;
/** < Gemini's 2048-token embed input. */
export const HARD_MAX_CHARS = 4000;
/** The servable-candidate floor (shared by every retrieval arm). */
export const MIN_CONTENT_CHARS = 24;
/** Tokenizer-free estimate carried from legacy. */
export const CHARS_PER_TOKEN = 4;
