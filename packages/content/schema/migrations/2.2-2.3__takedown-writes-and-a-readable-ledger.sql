-- 2.2 -> 2.3 · A door for takedown, and a ledger someone can read.
--
-- Two governance mechanisms were complete except for the permission that makes
-- them usable:
--
--   takedown_denylist  the serving-side denial worked perfectly, but ingest
--                      held only SELECT — so the only way to impose a takedown
--                      was a superuser psql prompt, and nothing recorded who
--                      did it.
--   retrieval_log      FORCE row-level security, an INSERT policy, and NO
--                      select policy and no SELECT grant to any role. The
--                      provenance ledger the governance story rests on could
--                      be written and never read. CI only appeared to prove
--                      otherwise because its DSN is a superuser.

-- ── takedown: the write plane ────────────────────────────────────────────────
GRANT INSERT, UPDATE, DELETE ON takedown_denylist TO sor_content_ingest;

-- Same shape as ingest_write on the content tables: the tenant GUC must match
-- AND the grant table must authorize this role for this tenant. A takedown is
-- a write to the record's governance and is authorized the same way every
-- other write is.
DROP POLICY IF EXISTS takedown_write ON takedown_denylist;
CREATE POLICY takedown_write ON takedown_denylist FOR ALL TO sor_content_ingest
  USING (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g
                      WHERE g.role_name = current_user
                        AND g.tenant_id = takedown_denylist.tenant_id))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)
         AND EXISTS (SELECT 1 FROM ingest_tenant_grants g
                      WHERE g.role_name = current_user
                        AND g.tenant_id = takedown_denylist.tenant_id));

-- ── retrieval_log: a role that can actually read the ledger ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sor_content_auditor') THEN
    CREATE ROLE sor_content_auditor NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO sor_content_auditor;
GRANT SELECT ON retrieval_log TO sor_content_auditor;
-- An auditor reads the ledger and the denial list; it can reach no content.
GRANT SELECT ON takedown_denylist, schema_meta, corpora, ingestion_runs TO sor_content_auditor;

-- The tenant wall applies to the auditor exactly as it does to everyone else:
-- reading the ledger is still scoped to one tenant's rows.
DROP POLICY IF EXISTS tenant_read ON retrieval_log;
CREATE POLICY tenant_read ON retrieval_log FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id', true));

-- The applying user can assume it, the way it can already assume the other two.
DO $$
BEGIN
  EXECUTE format('GRANT sor_content_auditor TO %I WITH SET TRUE', current_user);
END $$;

-- Lifting a denial must be distinguishable from imposing one by the INDEXED
-- action column, not only by reading each row's JSON detail.
ALTER TABLE retrieval_log DROP CONSTRAINT IF EXISTS retrieval_log_action_check;
ALTER TABLE retrieval_log ADD CONSTRAINT retrieval_log_action_check CHECK (action = ANY (ARRAY[
  'content_served','similarity_searched','corpus_seeded','outline_served',
  'search_abstained','generation_activated','takedown_applied','takedown_revoked']));

-- Drop an index the serving predicate cannot use: it filters on
-- `coalesce(visibility, <runtime GUC>)`, which no plain btree on `visibility`
-- can satisfy. Built and maintained, never read — the same shape as the HNSW
-- index this release also stopped paying for.
DROP INDEX IF EXISTS idx_nodes_visibility;
