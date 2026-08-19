import { defineConfig } from "vitest/config";

// Integration tier: exercises built artifacts and real subprocesses.
// Requires `pnpm build` first — the tests say so when dist/ is missing.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.integration.test.ts", "scripts/**/*.integration.test.ts"],
    exclude: ["**/*.db.test.ts", "**/node_modules/**", "**/dist/**"],
  },
});
