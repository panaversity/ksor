import { defineConfig } from "vitest/config";

// Integration tier: exercises built artifacts and real subprocesses.
// Requires `pnpm build` first — the tests say so when dist/ is missing.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.integration.test.ts", "scripts/**/*.integration.test.ts"],
    exclude: ["**/*.db.test.ts", "**/node_modules/**", "**/dist/**"],
    // Vitest's 5s default is calibrated for the pure unit tier. THIS tier
    // spawns the bundled CLI — ~0.35s per spawn locally and several times that
    // on the Windows runner — and many tests spawn it two or more times, so a
    // suite that passes on Linux fails on Windows purely on process cost (found
    // live 2026-08-20: the init determinism test at 5405ms, and the CLI verb
    // tests once a fifth corpus verb was added). 30s is generous enough for a
    // cold Windows spawn and still short enough that a genuine hang fails the
    // run instead of stalling it. Individually heavier tests (npm pack, browser
    // e2e) keep their own larger explicit timeouts.
    testTimeout: 30_000,
  },
});
