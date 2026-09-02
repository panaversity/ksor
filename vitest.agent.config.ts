import { defineConfig } from "vitest/config";

// The agent tier: a shipped skill run by a real coding agent in a real
// scaffold, with the skill and without it, graded on what it leaves behind.
// Gated twice, like the database tier — by this separate config (never part
// of `pnpm test:integration`) and by each suite's own `describe.runIf`, so a
// machine with no key and no logged-in `claude` prints that it skipped instead
// of failing. It spends model tokens: `skill-evals.yml` runs it on push to
// main and by hand, never per pull request.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.agent.test.ts"],
    testTimeout: 20 * 60_000,
    hookTimeout: 5 * 60_000,
    // One agent at a time: each arm scaffolds, installs and runs a model.
    fileParallelism: false,
  },
});
