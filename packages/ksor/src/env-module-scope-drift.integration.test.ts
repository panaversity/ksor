/**
 * A tuning knob read at module scope is inert for the shipped binary: `cli.ts`
 * imports every kernel module STATICALLY, so a `const X = envInt(...)` /
 * `= envFloat(...)` at column 0 evaluates before `main()` calls
 * `loadDotEnv()` — the value is frozen at its default forever, and an
 * adopter's `.env` setting silently changes nothing, with no error pointing
 * at why (issue #149; the fourth live instance of this ESM-ordering trap).
 *
 * `http.ts`'s `drainTimeoutMs` already carries the fix — read inside a
 * function, at USE time, after `loadDotEnv()` has run — and
 * `drain-knob.integration.test.ts` already guards that one file. This is the
 * CLASS guard the finding asked for: every kernel package is scanned, not
 * just that file, so a fifth recurrence of the same trap is a red light here
 * instead of a fifth review round.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * Same transient-install exclusion as env-documented.integration.test.ts:
 * init.integration.test.ts roots a fake npm install under packages/ksor and
 * fills it with a copy of templates/scaffold. Descending into it would scan
 * those files a second time, and can crash on an entry deleted mid-walk by
 * that other suite.
 */
const TRANSIENT = /^ksor-fakeinstall-/;

function kernelSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    if (TRANSIENT.test(name)) continue;
    const full = path.join(dir, name);
    if (entry.isDirectory()) kernelSourceFiles(full, out);
    // Test files never ship in the bundled binary, so a const inside one is
    // not subject to the ESM-ordering trap this guards against.
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

// Module scope = column 0 (no leading whitespace). A knob read inside a
// function is indented — by the time that function body runs, main() has
// already called loadDotEnv(), which is exactly what makes it safe.
const MODULE_SCOPE_ENV_READ = /^(export )?const \w+\s*(:[^=]+)?=\s*env(Int|Float)\(/;

describe("no kernel package reads env(Int|Float) at module scope", () => {
  it("every const = envInt(...) / envFloat(...) is read inside a function, not at import time", () => {
    const offenders: string[] = [];
    for (const file of kernelSourceFiles(path.join(repoRoot, "packages"))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (MODULE_SCOPE_ENV_READ.test(line)) {
          offenders.push(`${path.relative(repoRoot, file).replace(/\\/g, "/")}:${i + 1}`);
        }
      });
    }
    expect(
      offenders,
      "these are evaluated at import time, before loadDotEnv() runs in cli.ts's main() — " +
        "convert each to a function called at use time (the drainTimeoutMs pattern in " +
        "packages/content-gateway/src/http.ts): " +
        offenders.join(", "),
    ).toEqual([]);
  });
});
