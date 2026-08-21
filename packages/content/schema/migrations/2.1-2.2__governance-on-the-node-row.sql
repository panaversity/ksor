-- 2.1 -> 2.2 · Governance moves onto the node row.
--
-- Until now the ingest adapter kept four things from a document's frontmatter
-- (title, order, an optional sor_id, and the path-derived slug) and discarded
-- the rest, so `visibility`, the authored `status`, `owner` and `provenance`
-- existed only in markdown and in whichever surface happened to re-derive them.
-- The site enforced `visibility:`; the MCP door could not, because the record
-- did not carry it. This migration gives the record the columns every surface
-- must read, so the guarantee lives in one place instead of being re-implemented
-- per surface.
--
-- Every column is additive and nullable, so a 2.1 reader still reads a 2.2
-- database (compatible_from stays 2.0). `corpus_id` is backfilled from the
-- corpora pointer, which is exact while one corpus serves one tenant — the
-- state this migration runs in.

ALTER TABLE content_nodes
    -- Which record this node belongs to. Content rows were scoped by
    -- (tenant_id, generation) only, while corpora/ingestion_runs/takedown are
    -- keyed (tenant_id, corpus_id); carrying it here closes that split before a
    -- second record exists.
    ADD COLUMN IF NOT EXISTS corpus_id     TEXT,
    -- The audience tier the document declares. NULL = the instance's
    -- default_visibility. Enforced at the serving door, not only at site build.
    ADD COLUMN IF NOT EXISTS visibility    TEXT,
    -- The AUTHORED governance status (draft / approved / superseded). Distinct
    -- from `status`, which is the SERVING state of the row (published /
    -- draft / archived) and is set by the pipeline, not by the author.
    ADD COLUMN IF NOT EXISTS doc_status    TEXT,
    ADD COLUMN IF NOT EXISTS owner         TEXT,
    -- Where the document's claims come from, as authored. JSONB so a list of
    -- sources survives without inventing a side table.
    ADD COLUMN IF NOT EXISTS provenance    JSONB,
    -- stable_id of the document that replaces this one, when it is superseded.
    ADD COLUMN IF NOT EXISTS superseded_by TEXT;

UPDATE content_nodes n
   SET corpus_id = c.corpus_id
  FROM corpora c
 WHERE c.tenant_id = n.tenant_id
   AND n.corpus_id IS NULL;

-- NOTE (2.4): this index is DROPPED again by 2.2 -> 2.3, and schema.sql builds
-- a fresh database without it. The rationale below is wrong and is kept only
-- because a migration that has run somewhere must not be rewritten: the serving
-- predicate filters on `coalesce(visibility, <a per-transaction GUC>)`, which no
-- plain btree on `visibility` can serve, so the index was built and maintained
-- and never read — the same defect the HNSW arm was fixed for. An operator
-- reading this file sees the claim, so it is corrected here rather than
-- silently (round-9 review of PR 43).
--
-- The serving filter is (tenant, generation, visibility); without this the
-- audience predicate turns every search into a scan of the generation.
CREATE INDEX IF NOT EXISTS idx_nodes_visibility
    ON content_nodes (tenant_id, generation, visibility);
