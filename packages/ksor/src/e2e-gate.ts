/**
 * What a gated browser suite tells the reader when it does not run.
 *
 * Three suites gate on `KSOR_E2E=1` because they launch a real browser and
 * build a real scaffold, which the ordinary integration run must not pay for.
 * Gated, a run reports them as thirty-one skipped tests and nothing else — and
 * "skipped" with no reason is what let a green local run hide the browser
 * suites entirely. The note carries BOTH commands, in order, because the
 * second fails without the first: playwright is a devDependency of
 * `packages/ksor`, so its browser must be installed from that directory
 * (`pnpm exec` at the root does not see it — found live, 2026-08-18).
 */

/** The one-time browser install, from the package that declares playwright. */
export const E2E_INSTALL: string = "pnpm --dir packages/ksor exec playwright install chromium";

/** The skip note for one gated suite: the install, then the run. */
export function e2eSkipNote(file: string): string {
  return (
    `KSOR_E2E is unset — this suite drives a real browser. Run \`${E2E_INSTALL}\` once, then ` +
    `\`KSOR_E2E=1 pnpm exec vitest run --config vitest.integration.config.ts ${file}\` ` +
    "(or `pnpm test:e2e` for all three browser suites)"
  );
}
