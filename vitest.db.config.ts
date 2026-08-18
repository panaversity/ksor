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
    hookTimeout: 120_000,
  },
});
