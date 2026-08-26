-- 2.4 -> 2.5 · The record is the KSoR Profile of OKF (research/okf-native.md
-- §4.1; specs/ksor/record/spec.md; decision 26).
--
-- Three things change shape, and each is mapped rather than dropped:
--
--   audience     The ranked, single-valued `visibility` becomes a LIST with
--                overlap semantics (record spec §2.4). A carried row keeps
--                exactly the tier it declared — ARRAY[visibility] — which
--                under the old model meant "this tier and above" and under
--                the new one means "this identifier only". That narrowing is
--                deliberate: `ksor migrate` widens the FILE to every tier at or
--                above, and a re-ingest carries the widened list here. Until
--                then a pre-2.5 generation refuses to serve (GOVERNANCE_SINCE),
--                so no viewer is answered from a half-mapped row.
--   doc_status   approved -> stable, review -> draft, superseded -> deprecated;
--                anything else the author wrote is not a profile status and
--                becomes NULL (the checker refuses it on the next ingest). The
--                CHECK then closes the set, because the lifecycle predicate
--                keys on it.
--   trust_tier   0 unverified · 1 machine-confirmed · 2 human-reviewed. A
--                carried row has no `verified` list, so it is 0: the honest
--                state of a stable, approved, unverified concept (plan §2.13).
--
-- The run row gains the build it published (`build_id`), the policy it was
-- checked against (registry + authorities, and its digest) and the ledger's id
-- set; the denylist row gains the ledger entry that wrote it and, nullable,
-- the one that revoked it — the `DENIED` seam denies only `revoked_at IS NULL`.
--
-- compatible_from: 2.5

ALTER TABLE content_nodes
    ADD COLUMN IF NOT EXISTS audience       TEXT[],
    ADD COLUMN IF NOT EXISTS sources        JSONB,
    ADD COLUMN IF NOT EXISTS verified       JSONB,
    ADD COLUMN IF NOT EXISTS generated      JSONB,
    ADD COLUMN IF NOT EXISTS approval       JSONB,
    ADD COLUMN IF NOT EXISTS deprecated     JSONB,
    ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stale_after    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trust_tier     SMALLINT;

UPDATE content_nodes
   SET audience = ARRAY[visibility]
 WHERE visibility IS NOT NULL AND visibility <> '' AND audience IS NULL;

UPDATE content_nodes
   SET doc_status = CASE doc_status
                      WHEN 'approved'   THEN 'stable'
                      WHEN 'review'     THEN 'draft'
                      WHEN 'superseded' THEN 'deprecated'
                      WHEN 'draft'      THEN 'draft'
                      WHEN 'stable'     THEN 'stable'
                      WHEN 'deprecated' THEN 'deprecated'
                      ELSE NULL
                    END
 WHERE doc_status IS NOT NULL;

UPDATE content_nodes SET trust_tier = 0 WHERE kind = 'document' AND trust_tier IS NULL;

ALTER TABLE content_nodes DROP COLUMN IF EXISTS visibility;
ALTER TABLE content_nodes
    ADD CONSTRAINT nodes_doc_status_profile
        CHECK (doc_status IS NULL OR doc_status IN ('draft','stable','deprecated')),
    ADD CONSTRAINT nodes_trust_tier_range
        CHECK (trust_tier IS NULL OR trust_tier BETWEEN 0 AND 2);
CREATE INDEX IF NOT EXISTS idx_nodes_audience ON content_nodes USING gin (audience);

COMMENT ON COLUMN content_nodes.audience IS
  'ksor.audience, a list; a section carries the union of its descendants'' lists so `audience && viewer` admits it iff a descendant is visible. NULL on a pre-2.5 row that declared no visibility.';
COMMENT ON COLUMN content_nodes.trust_tier IS
  '0 unverified, 1 machine-confirmed, 2 human-reviewed — derived from `verified` at ingest, never authored.';

ALTER TABLE ingestion_runs
    ADD COLUMN IF NOT EXISTS build_id      TEXT,
    ADD COLUMN IF NOT EXISTS policy        JSONB,
    ADD COLUMN IF NOT EXISTS policy_sha256 TEXT,
    ADD COLUMN IF NOT EXISTS ledger_ids    TEXT[];

COMMENT ON COLUMN ingestion_runs.build_id IS
  'build.lock.json''s build_id — the publication this generation was ingested from; NULL on a pre-2.5 run.';
COMMENT ON COLUMN ingestion_runs.policy IS
  'The Governance Policy the generation was checked against: {audiences, approval_authorities, takedown_authorities, ownership}. The door binds to this row, never to the file.';
COMMENT ON COLUMN ingestion_runs.ledger_ids IS
  'Every id in .ksor/takedowns.yaml at ingest, in file order — the baseline ksor-ledger-shrank compares the next ingest against.';

ALTER TABLE takedown_denylist
    ADD COLUMN IF NOT EXISTS ledger_id         TEXT,
    ADD COLUMN IF NOT EXISTS actor             TEXT,
    ADD COLUMN IF NOT EXISTS applied_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revoked_ledger_id TEXT,
    ADD COLUMN IF NOT EXISTS revoked_at        TIMESTAMPTZ,
    -- A carried row predates the ledger entirely, so `present` is the only
    -- honest default: nothing in the repository yet says the file was deleted.
    -- The first ingest folds the ledger and writes what it actually says.
    ADD COLUMN IF NOT EXISTS expected          TEXT NOT NULL DEFAULT 'present';
ALTER TABLE takedown_denylist
    ADD CONSTRAINT takedown_expected_values CHECK (expected IN ('present','removed'));

COMMENT ON COLUMN takedown_denylist.ledger_id IS
  'The .ksor/takedowns.yaml entry that wrote this row. NULL = written before the ledger existed; the boot gate refuses it (ksor-takedown-unledgered) until an ingest attaches one by stable_id.';
COMMENT ON COLUMN takedown_denylist.expected IS
  'What the ledger expects of the FILE, as the latest amendment left it: present, or removed for a document withdrawn and then deliberately deleted. The orphan check skips `removed`; the DENIED seam never reads it, so a removed document stays denied.';
COMMENT ON COLUMN takedown_denylist.revoked_at IS
  'Set by a revocation entry; the DENIED seam denies only rows where this is NULL. A re-denial clears it — the ledger holds the history, the row holds the state.';

-- The author's own frontmatter bytes, so `read` can return them intact rather
-- than re-serialising the parsed columns into a document the record does not
-- contain. Additive and nullable: a carried row simply has none, and such a
-- generation is refused at boot anyway (GOVERNANCE_SINCE).
ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS frontmatter TEXT;

COMMENT ON COLUMN sources.frontmatter IS
  'The file''s frontmatter block, byte-exact as authored (comments and unknown keys included). Served verbatim by `read`; never re-serialised.';
