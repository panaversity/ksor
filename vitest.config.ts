import { defineConfig } from "vitest/config";

// Unit tier: pure, colocated, no fs/subprocess/network. Integration tests have
// their own config (vitest.integration.config.ts) because they require a build.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "scripts/**/*.test.ts"],
    // *.db.test.ts is the database tier (vitest.db.config.ts) — it needs a
    // real Postgres and must never be collected here, or an exported
    // KSOR_DB_URL runs heavy DB suites in the parallel unit tier and they
    // race (found live 2026-08-19).
    exclude: [
      "**/*.integration.test.ts",
      "**/*.db.test.ts",
      // The agent tier spends model tokens; it runs from its own config only.
      "**/*.agent.test.ts",
      "**/node_modules/**",
      "**/dist/**",
    ],
  },
});
