import { defineConfig } from "vitest/config";

// The database tier: kernel suites that need a real Postgres with pgvector.
// Gated twice — by this separate config (never part of `pnpm
// test:integration`'s <15s budget) and by each suite's own
// `describe.runIf(process.env.KSOR_DB_URL)`, so a machine without a database
// skips with a notice instead of failing. CI provides a pgvector service
// container; dev uses local Postgres or a throwaway Neon.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.db.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Suites get their own DATABASE, but Postgres ROLES are cluster-global:
    // two suites applying schema.sql concurrently raced its check-then-act
    // CREATE ROLE into a pg_authid duplicate-key error (found live in CI,
    // 2026-08-19). That cause is GONE — the DDL tolerates the race now, on
    // both paths that create a role (issue #166) — and the setting stays,
    // because it was never the only reason: 27 of these suites still bootstrap
    // a scratch database under a FIXED name and drop it `WITH (FORCE)`, so two
    // files running at once still terminate each other's connections. Removing
    // this is that half of #166, not this one.
    fileParallelism: false,
  },
});
