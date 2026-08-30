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
    -- The schema version in force when this generation was BUILT. A generation
    -- carried forward across the 2.1 -> 2.2 migration has NULL visibility on
    -- every node, which the serving predicate reads as the widest tier — so a
    -- record with an audience model must refuse to serve such a generation
    -- rather than quietly publish restricted documents (2.4).
    schema_version         TEXT,
    -- 2.5: the publication this generation was ingested from (build.lock.json's
    -- build_id), the Governance Policy it was checked against — registry and
    -- authorities as a row, with its digest, so the door binds to the row and
    -- the served container never needs the file — and the ledger's id set, the
    -- baseline the next ingest's ksor-ledger-shrank compares against.
    build_id               TEXT,
    policy                 JSONB,
    policy_sha256          TEXT,
    ledger_ids             TEXT[],
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
    -- The KSoR Profile of OKF (2.5, record spec §2): `ksor.audience` as a LIST
    -- with overlap semantics — a section carries the union of its descendants'
    -- lists, so `audience && viewer` admits it iff a descendant is visible;
    -- the authored lifecycle status, closed to the profile's set; the trust
    -- vocabulary as JSONB; effectivity and staleness as instants; and the trust
    -- tier derived from `verified` at ingest (0 unverified, 1 machine-confirmed,
    -- 2 human-reviewed). `provenance` (2.2) stays for a carried row; a 2.5
    -- ingest writes `sources`.
    audience      TEXT[],
    -- Named, not auto-named: the 2.4 -> 2.5 migration adds this same CHECK by
    -- name, and an unnamed inline constraint is auto-named after the column, so a
    -- migrated database and a fresh one carried the SAME rule under two different
    -- names — one schema nobody could diff (schema-parity.db.test.ts).
    doc_status    TEXT CONSTRAINT nodes_doc_status_profile
                    CHECK (doc_status IS NULL OR doc_status IN ('draft','stable','deprecated')),
    owner         TEXT,
    provenance    JSONB,                              -- pre-profile `provenance:`, carried rows only
    superseded_by TEXT,                               -- ksor.superseded_by, as a stable_id
    sources       JSONB,
    verified      JSONB,
    generated     JSONB,
    approval      JSONB,
    deprecated    JSONB,
    effective_from TIMESTAMPTZ,
    stale_after   TIMESTAMPTZ,
    trust_tier    SMALLINT CONSTRAINT nodes_trust_tier_range
                    CHECK (trust_tier IS NULL OR trust_tier BETWEEN 0 AND 2),
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
-- The overlap predicate (`audience && viewer`) is an array-overlap, which a GIN
-- serves and a btree cannot; the ranked predicate it replaces rode the
-- (tenant_id, generation, kind) index through a coalesce no index could read.
CREATE INDEX idx_nodes_audience ON content_nodes USING gin (audience);
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
    -- 2.5: the file's frontmatter block, byte-exact as the author wrote it —
    -- comments and unknown keys included (OKF §11). `read` serves it back
    -- verbatim; a re-serialisation from the parsed columns would be a
    -- DIFFERENT document wearing the record's name. NULL for a source with no
    -- frontmatter, and for a pre-2.5 carried row.
    frontmatter     TEXT,
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
    -- The text-search configuration is RENDERED from instance.md
    -- (retrieval.text_search_config), the way the embedding dimension is. It
    -- is STORED and GENERATED, so it cannot be changed without a re-ingest —
    -- which is exactly why the record declares it rather than inheriting
    -- 'english' from the DDL (audit finding 20).
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
    -- 2.5: the row is the STATE, the ledger (.ksor/takedowns.yaml) is the
    -- history. `ledger_id` names the entry that wrote the row (NULL = written
    -- before the ledger existed — the boot gate refuses it until an ingest
    -- attaches one by stable_id); a revocation sets `revoked_ledger_id` /
    -- `revoked_at`, and the DENIED seam denies only `revoked_at IS NULL`; a
    -- re-denial clears them. Rows are never deleted.
    ledger_id         TEXT,
    actor             TEXT,
    applied_at        TIMESTAMPTZ,
    revoked_ledger_id TEXT,
    revoked_at        TIMESTAMPTZ,
    -- What the ledger expects of the FILE, as the latest amendment left it
    -- (record spec §5). `present` is the ordinary case. `removed` says the
    -- document was withdrawn and then deliberately deleted — a state the boot
    -- gate must not read as an orphaned denial, because the honest answer to
    -- "is there still a node with this id?" is no, forever. Without this column
    -- every such denial refused `ksor ingest` and `ksor serve` permanently, and
    -- the remedy the refusal printed (`--removed`) moves no row, so the only
    -- escape was to un-withdraw the document (review 2026-08-25).
    --
    -- It does NOT weaken the denial: `removed` rows stay in force and the
    -- DENIED seam never reads this column. It records what happened to the
    -- FILE, not whether the withdrawal still stands.
    expected   TEXT NOT NULL DEFAULT 'present'
                 CONSTRAINT takedown_expected_values CHECK (expected IN ('present','removed')),
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
                   'search_abstained','generation_activated','takedown_applied','takedown_revoked')),
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
-- 2.4 stamps each generation with the schema it was built against, so a
-- generation predating the governance columns can be REFUSED rather than served
-- at default_visibility.
-- 2.5 puts the KSoR Profile on the node row (audience list, closed status set,
-- trust vocabulary, effectivity, trust tier), the policy and the lock on the
-- run, and the ledger on the denylist row; it DROPS `visibility`, so a 2.4
-- reader's predicate no longer resolves — compatible_from moves to 2.5.
-- Existing databases move forward through schema/migrations/; schema.sql
-- provisions a FRESH one at the current version.
INSERT INTO schema_meta (schema_version, compatible_from) VALUES ('2.5', '2.5');

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

-- Roles are CLUSTER-GLOBAL, so `IF NOT EXISTS` is check-then-act across every
-- database on the instance: two concurrent applies both see the role absent and
-- both create it. Measured on Postgres 17.7 — six concurrent runs against an
-- empty cluster, FIVE failed. Two `ksor schema --apply` runs, or two `pnpm
-- test:db` runs, are all it takes.
--
-- The raised SQLSTATE is `unique_violation` (23505) on pg_authid_rolname_index,
-- NOT `duplicate_object` (42710) — catching only the latter is the intuitive
-- fix and does not work. Both are caught, because which one surfaces depends on
-- where in the create the loser lands.
--
-- ONE BLOCK PER ROLE, deliberately: a `DO` block is a single statement, so an
-- exception anywhere in it rolls back the whole block. Three roles in one block
-- means a loser on the first role never creates the other two, and the apply
-- continues to GRANT against roles that do not exist.
DO $$ BEGIN
  CREATE ROLE sor_content_runtime NOLOGIN;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE sor_content_ingest NOLOGIN;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END $$;

-- The ledger's READER (2.3). Without it retrieval_log was write-only under
-- every credential ksor ships: FORCE RLS, an INSERT policy, and no way back in.
DO $$ BEGIN
  CREATE ROLE sor_content_auditor NOLOGIN;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
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
