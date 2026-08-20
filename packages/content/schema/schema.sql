-- sor-content schema v2 — the generational corpus store (specs/platform/generations.md §2 is the
-- design this implements; specs/platform/spec.md §5 the roles; the legacy schema the quarry).
-- This file provisions a FRESH database at the current version; an EXISTING one moves forward
-- through schema/migrations/<from>-<to>__<slug>.sql (spec §9: compatibility is a RANGE, recorded
-- in schema_meta). Both halves are required — the file alone cannot migrate rows an adopter has.
--
-- Carried from legacy verbatim where the eval lock demands it: HNSW (m=16, ef_construction=64)
-- cosine, 'english' generated tsvector, per-tenant one-embedding-model trigger, fail-closed tenant
-- RLS keyed on GUC app.tenant_id. The two embedding columns (chunks, node_centroids) carry the
-- dimension of the DECLARED embedding space (instance.md `embedding.dim`): `schema/schema.sql` in
-- the repo is the shipped, eval-locked rendering (Gemini Embedding 001 at its MRL truncation);
-- `sor_content.render_schema(dim)` / `sor-content-schema --instance <dir>` re-render it for another
-- declared space. A different space is a NEW database.
-- v2 decisions recorded here:
--   • generation BIGINT on every corpus table; natural uniques are GENERATION-SCOPED.
--   • status='published' filtering is an ARM PREDICATE on every serving path (resolving the legacy
--     open decision): drafts embed like everything else, serving hides them; RLS stays a pure
--     tenant wall.
--   • hnsw.iterative_scan = relaxed_order + pinned ef_search are RUNTIME SET LOCALs applied by the
--     query builder on every vector arm (the legacy documented-but-unapplied fix becomes code in 1b).
--   • takedown_denylist has NO generation column BY DESIGN (denial beats every generation, §6).

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================ corpus pointer + runs
CREATE TABLE corpora (
    tenant_id           TEXT NOT NULL,
    corpus_id           TEXT NOT NULL,               -- immutable, globally unique (spec §4)
    active_generation   BIGINT NOT NULL,
    rollback_generation BIGINT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, corpus_id)
);

CREATE TABLE ingestion_runs (
    run_id                 BIGSERIAL PRIMARY KEY,
    tenant_id              TEXT NOT NULL,
    corpus_id              TEXT NOT NULL,
    generation             BIGINT NOT NULL,
    state                  TEXT NOT NULL CHECK (state IN ('building','ready','active','retired','abandoned','reaped')),
    source_commit          TEXT NOT NULL,
    instance_bundle_sha256 TEXT NOT NULL,
    started_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    heartbeat_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at            TIMESTAMPTZ,
    UNIQUE (tenant_id, corpus_id, generation)
);

-- ============================================================================ the tree
CREATE TABLE content_nodes (
    node_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  TEXT NOT NULL,
    generation BIGINT NOT NULL,
    stable_id  TEXT NOT NULL,                        -- durable identity WITHIN the corpus (spec §7)
    parent_id  UUID,
    kind       TEXT NOT NULL,
    slug       TEXT NOT NULL,
    title      TEXT NOT NULL,
    summary    TEXT,
    keywords   TEXT[],
    position   INT  NOT NULL DEFAULT 0,
    permalink  TEXT,                                  -- CONFIRMED site route (/docs/…), sitemap-verified at publish; NULL = no proven page URL (a group, or an unlisted route) — never a guess
    status     TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft','archived')),
    -- Governance the AUTHOR declares, carried by the record itself (2.2) so every
    -- surface reads one source instead of re-deriving it from markdown. `status`
    -- above is the SERVING state of the row; `doc_status` is what the document says.
    corpus_id     TEXT,                               -- which record this node belongs to
    visibility    TEXT,                               -- audience tier; NULL = instance default_visibility
    doc_status    TEXT,                               -- draft / approved / superseded, as authored
    owner         TEXT,
    provenance    JSONB,                              -- where the claims come from, as authored
    superseded_by TEXT,                               -- stable_id of the replacement
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT nodes_stable_uniq  UNIQUE (tenant_id, generation, stable_id),
    CONSTRAINT nodes_sibling_uniq UNIQUE (tenant_id, generation, parent_id, slug),
    CONSTRAINT nodes_id_tenant_uniq UNIQUE (node_id, tenant_id),
    CONSTRAINT nodes_no_self_parent CHECK (parent_id IS NULL OR parent_id <> node_id),
    CONSTRAINT nodes_parent_fk FOREIGN KEY (parent_id, tenant_id)
        REFERENCES content_nodes (node_id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX idx_nodes_gen      ON content_nodes (tenant_id, generation, kind);
CREATE INDEX idx_nodes_parent   ON content_nodes (parent_id);
CREATE INDEX idx_nodes_keywords ON content_nodes USING gin (keywords);
-- The serving audience filter is (tenant, generation, visibility) — without this
-- the audience predicate turns every search into a scan of the generation.
CREATE INDEX idx_nodes_visibility ON content_nodes (tenant_id, generation, visibility);
CREATE UNIQUE INDEX nodes_root_slug_uniq ON content_nodes (tenant_id, generation, slug) WHERE parent_id IS NULL;

CREATE TABLE slug_aliases (
    tenant_id      TEXT NOT NULL,
    generation     BIGINT NOT NULL,
    alias_slug     TEXT NOT NULL,
    canonical_slug TEXT NOT NULL,                    -- aliases FLATTEN at ingest (spec §7)
    PRIMARY KEY (tenant_id, generation, alias_slug)
);

-- ============================================================================ files + passages
CREATE TABLE sources (
    tenant_id       TEXT NOT NULL,
    generation      BIGINT NOT NULL,
    source_id       TEXT NOT NULL,                   -- path-derived, unique within (tenant, generation)
    node_id         UUID NOT NULL,
    modality        TEXT NOT NULL DEFAULT 'prose',
    title           TEXT NOT NULL,
    origin_path     TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    chunk_policy    TEXT NOT NULL,
    source_commit   TEXT,
    seeded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, generation, source_id),
    CONSTRAINT sources_node_fk FOREIGN KEY (node_id, tenant_id)
        REFERENCES content_nodes (node_id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX idx_sources_node ON sources (node_id);

CREATE TABLE chunks (
    chunk_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         TEXT NOT NULL,
    generation        BIGINT NOT NULL,
    source_id         TEXT NOT NULL,
    ordinal           INT  NOT NULL,
    content           TEXT NOT NULL,
    chunk_hash        TEXT NOT NULL,                 -- sha256(content): the carry-forward key (§3.4)
    heading_path      JSONB NOT NULL DEFAULT '[]',
    heading_path_text TEXT,
    anchor            TEXT,
    labels            JSONB NOT NULL DEFAULT '{}',
    embedding         VECTOR(1536),                  -- NULL while pending/failed; dim = the declared space
    embedding_status  TEXT NOT NULL DEFAULT 'embedded'
                      CHECK (embedding_status IN ('pending','embedded','failed')),
    search_tsv        TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    embedded_at       TIMESTAMPTZ,
    embedding_model   TEXT,
    embed_error       TEXT,
    UNIQUE (tenant_id, generation, source_id, ordinal),
    CONSTRAINT chunks_embedded_has_vector CHECK (embedding_status <> 'embedded' OR embedding IS NOT NULL),
    CONSTRAINT chunks_source_fk FOREIGN KEY (tenant_id, generation, source_id)
        REFERENCES sources (tenant_id, generation, source_id) ON DELETE CASCADE
);
CREATE INDEX idx_chunks_hnsw    ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_chunks_gen     ON chunks (tenant_id, generation);
CREATE INDEX idx_chunks_hpath   ON chunks (source_id, heading_path_text text_pattern_ops);
CREATE INDEX idx_chunks_pending ON chunks (tenant_id, generation, source_id) WHERE embedding_status <> 'embedded';
CREATE INDEX idx_chunks_tsv     ON chunks USING gin (search_tsv);

-- Materialized at run finalization (generations.md §2): the routing arm reads rows, never
-- aggregates at query time; generation-consistent by construction.
CREATE TABLE node_centroids (
    tenant_id  TEXT NOT NULL,
    generation BIGINT NOT NULL,
    node_id    UUID NOT NULL,
    stable_id  TEXT NOT NULL,                        -- denylist binds here without a join
    chunk_count INT NOT NULL,
    embedding  VECTOR(1536) NOT NULL,
    PRIMARY KEY (tenant_id, generation, node_id)
);

-- ============================================================================ takedown (NO generation)
-- scope (decision 14): 'node' denies EXACTLY this stable_id (identity — the
-- default, immune to reorganization, auditable as a frozen list); 'subtree'
-- denies this node AND every descendant, resolved at SERVING time by a
-- recursive parent_id walk (so descendants added by a FUTURE generation are
-- covered — this table has no generation column BY DESIGN). NO generation
-- column: denial beats every generation (§6).
CREATE TABLE takedown_denylist (
    tenant_id  TEXT NOT NULL,
    corpus_id  TEXT NOT NULL,
    stable_id  TEXT NOT NULL,
    scope      TEXT NOT NULL DEFAULT 'node' CHECK (scope IN ('node','subtree')),
    reason     TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, corpus_id, stable_id)
);

-- ============================================================================ the ledger
CREATE TABLE retrieval_log (
    id          BIGSERIAL,
    tenant_id   TEXT NOT NULL,
    corpus_id   TEXT,
    generation  BIGINT,
    actor       TEXT NOT NULL,                       -- NO default: unset errors loudly (carried)
    action      TEXT NOT NULL CHECK (action IN
                  ('content_served','similarity_searched','corpus_seeded','outline_served',
                   'search_abstained','generation_activated','takedown_applied')),
    source_id   TEXT,
    -- spec §7 audit fields (explicit + queryable; free detail rides JSONB)
    content_hash           TEXT,
    chunk_hash             TEXT,
    instance_bundle_sha256 TEXT,
    embedding_model        TEXT,
    chunk_policy_version   TEXT,
    detail      JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE TABLE retrieval_log_default PARTITION OF retrieval_log DEFAULT;
CREATE INDEX idx_rlog_tenant ON retrieval_log (tenant_id, created_at);
CREATE INDEX idx_rlog_action ON retrieval_log (action, created_at);

-- ============================================================================ meta + triggers
CREATE TABLE schema_meta (
    schema_version  TEXT NOT NULL,                   -- spec §9: readers/writers support a RANGE
    compatible_from TEXT NOT NULL,
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 2.1 adds takedown_denylist.scope (decision 14). 2.2 puts governance on the node
-- row (corpus_id, visibility, doc_status, owner, provenance, superseded_by).
-- 2.3 gives takedown a write plane and the ledger a reader (sor_content_auditor).
-- Both are additive and nullable, so a 2.0 reader still reads a 2.2 database —
-- compatible_from stays 2.0. Existing databases move forward through
-- schema/migrations/; schema.sql provisions a FRESH one at the current version.
INSERT INTO schema_meta (schema_version, compatible_from) VALUES ('2.3', '2.0');

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_nodes_touch   BEFORE UPDATE ON content_nodes FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_sources_touch BEFORE UPDATE ON sources       FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- One embedding model per tenant (carried verbatim — a model switch is a DELIBERATE full re-embed).
CREATE OR REPLACE FUNCTION sources_one_model() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM sources WHERE tenant_id = NEW.tenant_id AND embedding_model <> NEW.embedding_model) THEN
    RAISE EXCEPTION 'embedding-contract: tenant % is on model %, refusing % (a model switch is a deliberate full re-embed)',
      NEW.tenant_id,
      (SELECT embedding_model FROM sources WHERE tenant_id = NEW.tenant_id AND embedding_model <> NEW.embedding_model LIMIT 1),
      NEW.embedding_model;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_sources_one_model
  BEFORE INSERT OR UPDATE OF embedding_model ON sources
  FOR EACH ROW EXECUTE FUNCTION sources_one_model();

-- ============================================================================ roles (spec §5 — per-DB grants,
-- FORCE RLS, NO BYPASSRLS, no owner membership; the grant table IS ingest authorization)
CREATE TABLE ingest_tenant_grants (
    role_name  TEXT NOT NULL,
    tenant_id  TEXT NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (role_name, tenant_id)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sor_content_runtime') THEN CREATE ROLE sor_content_runtime NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sor_content_ingest')  THEN CREATE ROLE sor_content_ingest NOLOGIN;  END IF;
  -- The ledger's READER (2.3). Without it retrieval_log was write-only under
  -- every credential ksor ships: FORCE RLS, an INSERT policy, and no way back in.
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sor_content_auditor') THEN CREATE ROLE sor_content_auditor NOLOGIN; END IF;
END $$;

-- Explicit in-schema membership for the APPLYING role, so SET LOCAL ROLE works from day one
-- (spec §5: NO out-of-band grants — the legacy schema's missing owner-membership grant broke
-- every fresh project until hand-fixed). Deployment LOGIN roles receive the same membership
-- when they are provisioned (1h).
DO $$ BEGIN
  EXECUTE format('GRANT sor_content_runtime, sor_content_ingest, sor_content_auditor TO %I WITH SET TRUE', current_user);
END $$;

GRANT USAGE ON SCHEMA public TO sor_content_runtime, sor_content_ingest, sor_content_auditor;
-- runtime: read published corpora, write the ledger — NOTHING else.
GRANT SELECT ON corpora, content_nodes, sources, chunks, slug_aliases, node_centroids, takedown_denylist, schema_meta TO sor_content_runtime;
-- freshness on /health (2026-07-16): the runtime reads the active run's source_commit +
-- finished_at/heartbeat_at to report sync-age; RLS tenant_read already covers ingestion_runs.
GRANT SELECT ON ingestion_runs TO sor_content_runtime;
GRANT INSERT ON retrieval_log TO sor_content_runtime;
GRANT USAGE, SELECT ON SEQUENCE retrieval_log_id_seq TO sor_content_runtime;
-- ingest: build generations + flip, for AUTHORIZED tenants only (policy-checked via the grant table).
GRANT SELECT ON schema_meta, ingest_tenant_grants TO sor_content_ingest;
-- Takedown is a WRITE to the record's governance: ingest imposes and lifts it
-- through `ksor takedown`, authorized by the same grant table every other write
-- is (2.3 — before it, the only door was a superuser psql prompt).
GRANT SELECT, INSERT, UPDATE, DELETE ON takedown_denylist TO sor_content_ingest;
-- The ledger needs a READER. Without one, retrieval_log was write-only under
-- every credential ksor ships (2.3).
GRANT SELECT ON retrieval_log TO sor_content_auditor;
GRANT SELECT ON takedown_denylist, schema_meta, corpora, ingestion_runs TO sor_content_auditor;
GRANT SELECT, INSERT, UPDATE, DELETE ON corpora, ingestion_runs, content_nodes, sources, chunks, slug_aliases, node_centroids TO sor_content_ingest;
GRANT INSERT ON retrieval_log TO sor_content_ingest;
GRANT USAGE, SELECT ON SEQUENCE retrieval_log_id_seq, ingestion_runs_run_id_seq TO sor_content_ingest;

-- FORCE: even a table owner obeys (spec §5 hardened over legacy ENABLE).
ALTER TABLE corpora            ENABLE ROW LEVEL SECURITY; ALTER TABLE corpora            FORCE ROW LEVEL SECURITY;
ALTER TABLE ingestion_runs     ENABLE ROW LEVEL SECURITY; ALTER TABLE ingestion_runs     FORCE ROW LEVEL SECURITY;
ALTER TABLE content_nodes      ENABLE ROW LEVEL SECURITY; ALTER TABLE content_nodes      FORCE ROW LEVEL SECURITY;
ALTER TABLE sources            ENABLE ROW LEVEL SECURITY; ALTER TABLE sources            FORCE ROW LEVEL SECURITY;
ALTER TABLE chunks             ENABLE ROW LEVEL SECURITY; ALTER TABLE chunks             FORCE ROW LEVEL SECURITY;
ALTER TABLE slug_aliases       ENABLE ROW LEVEL SECURITY; ALTER TABLE slug_aliases       FORCE ROW LEVEL SECURITY;
ALTER TABLE node_centroids     ENABLE ROW LEVEL SECURITY; ALTER TABLE node_centroids     FORCE ROW LEVEL SECURITY;
ALTER TABLE retrieval_log      ENABLE ROW LEVEL SECURITY; ALTER TABLE retrieval_log      FORCE ROW LEVEL SECURITY;
ALTER TABLE takedown_denylist  ENABLE ROW LEVEL SECURITY; ALTER TABLE takedown_denylist  FORCE ROW LEVEL SECURITY;

-- Tenant wall (GUC app.tenant_id; unset ⇒ zero rows, fail-closed). Reads:
CREATE POLICY tenant_read ON corpora           FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY tenant_read ON content_nodes     FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY tenant_read ON sources           FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY tenant_read ON chunks            FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY tenant_read ON slug_aliases      FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY tenant_read ON node_centroids    FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY tenant_read ON takedown_denylist FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY tenant_read ON ingestion_runs    FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
-- Ledger writes:
CREATE POLICY tenant_read ON retrieval_log FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY tenant_write ON retrieval_log FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
-- Ingest mutations: tenant GUC match AND the grant table authorizes THIS role for THIS tenant
-- (a CLI flag is not authorization — spec §5).
CREATE POLICY takedown_write ON takedown_denylist FOR ALL TO sor_content_ingest
  USING (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = takedown_denylist.tenant_id))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = takedown_denylist.tenant_id));
CREATE POLICY ingest_write ON content_nodes FOR ALL TO sor_content_ingest
  USING (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = content_nodes.tenant_id))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = content_nodes.tenant_id));
CREATE POLICY ingest_write ON sources FOR ALL TO sor_content_ingest
  USING (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = sources.tenant_id))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = sources.tenant_id));
CREATE POLICY ingest_write ON chunks FOR ALL TO sor_content_ingest
  USING (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = chunks.tenant_id))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = chunks.tenant_id));
CREATE POLICY ingest_write ON slug_aliases FOR ALL TO sor_content_ingest
  USING (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = slug_aliases.tenant_id))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = slug_aliases.tenant_id));
CREATE POLICY ingest_write ON node_centroids FOR ALL TO sor_content_ingest
  USING (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = node_centroids.tenant_id))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = node_centroids.tenant_id));
CREATE POLICY ingest_write ON ingestion_runs FOR ALL TO sor_content_ingest
  USING (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = ingestion_runs.tenant_id))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = ingestion_runs.tenant_id));
-- The FLIP (and only the flip-shaped mutation) on corpora:
CREATE POLICY ingest_flip ON corpora FOR ALL TO sor_content_ingest
  USING (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = corpora.tenant_id))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g WHERE g.role_name = current_user AND g.tenant_id = corpora.tenant_id));
