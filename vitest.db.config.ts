import { defineConfig } from "vitest/config";

// The database tier: kernel suites that need a real Postgres with pgvector.
// Gated twice — by this separate config (never part of `pnpm
// test:integration`'s <15s budget) and by each suite's own
// `describe.runIf(process.env.KSOR_DB_URL)`, so a machine without a database
// skips with a notice instead of failing. CI provides a pgvector service
// container; dev uses local Postgres or a throwaway Neon.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.db.test.ts", "scripts/**/*.db.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Drop the scratch databases an INTERRUPTED run left behind, before this
    // one starts. Every suite now names its database uniquely per run (guard
    // rule 12), which is what stops two runs dropping each other's — but a run
    // killed with Ctrl-C never reaches its `afterAll`, and a unique name is one
    // nothing will ever reuse. The rename and the reaper are one change.
    globalSetup: ["scripts/db-reaper.ts"],
    // Suites get their own DATABASE, but Postgres ROLES are cluster-global:
    // two suites applying schema.sql concurrently raced its check-then-act
    // CREATE ROLE into a pg_authid duplicate-key error (found live in CI,
    // 2026-08-19). That cause is GONE — the DDL tolerates the race now, on
    // both paths that create a role (issue #166) — and so is the second one,
    // the fixed scratch names that let two files force-drop each other's
    // database mid-test.
    //
    // What keeps it false is now a BUDGET, not a bug: these suites hold pools,
    // and running 40 files at once against one Postgres asks for more backends
    // than a default `max_connections` of 100 will give. Raising this is a
    // measurement (how many workers a 100-connection cluster survives), not a
    // one-line flip.
    fileParallelism: false,
  },
});
