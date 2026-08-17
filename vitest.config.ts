import { defineConfig } from "vitest/config";

// Unit tier: pure, colocated, no fs/subprocess/network. Integration tests have
// their own config (vitest.integration.config.ts) because they require a build.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**", "**/dist/**"],
  },
});
