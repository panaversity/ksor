-- 2.3 -> 2.4 · A generation records the schema it was built against.
--
-- The 2.1 -> 2.2 migration added `content_nodes.visibility` and backfilled only
-- `corpus_id`, because a migration cannot know what a document's frontmatter
-- says. So on an upgraded database every PRE-EXISTING node has visibility NULL,
-- and the serving predicate coalesces NULL to `app.default_visibility` — the
-- WIDEST tier. An adopter who migrated and did not re-ingest served every
-- `visibility: restricted` document to every public-tier agent, with the schema
-- gate green, /ready green, and the boot line reporting the audience model as
-- enforced (round-5 review of #43).
--
-- Nothing could detect that, because a generation had no record of when it was
-- built. Now it does: `ingestion_runs.schema_version` is stamped at ingest, and
-- NULL means "built before this column existed" — which is exactly the set of
-- generations whose governance columns cannot be trusted. `serve` refuses to
-- boot on one when the record declares an audience model.

ALTER TABLE ingestion_runs
    ADD COLUMN IF NOT EXISTS schema_version TEXT;

COMMENT ON COLUMN ingestion_runs.schema_version IS
  'The schema_meta version in force when this generation was built. NULL means it predates the governance columns, so its visibility values are absent rather than empty.';
