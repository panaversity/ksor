/**
 * A tuning knob read with `env(Int|Float)(…)` bound straight to a module-scope
 * `const`/`let` is read at IMPORT time — before the CLI runs `loadDotEnv()`
 * inside `main()` — so the value freezes at the default and every `.env`
 * setting is silently ignored. This repo has paid for that ESM-ordering trap
 * four times; the fourth (kernel review finding A2) was `KSOR_EMBED_TIMEOUT_S`,
 * `KSOR_QUERY_EMBED_TIMEOUT_S` and `KSOR_EMBED_CACHE_MAX`.
 *
 * The rule this guards: a knob is read inside a function
 * (`const X = () => envInt(…)`, the shape `db.ts` and `http.ts` already use),
 * never `const X = envInt(…)` at module scope. A fifth instance is a red light
 * here instead of a fifth review round.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

/** The kernel packages — the ones that carry env-tunable knobs. */
const KERNEL_PACKAGES = ["postgres", "content", "gateway-kit", "content-gateway"];

/**
 * `const NAME = envInt(` / `export let NAME: T = envFloat(` — a direct
 * module-scope binding. `const NAME = () => envInt(` does NOT match: after `=`
 * comes `(`, not `env`, so a read-at-use wrapper is allowed. An indented line
 * (a read inside a function body) does not match either — `const` must sit at
 * column 0.
 */
const MODULE_SCOPE_ENV_READ =
  /^(?:export\s+)?(?:const|let)\s+[A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*env(?:Int|Float)\s*\(/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("env tuning knobs are read at use, never frozen at module load", () => {
  it("no kernel source binds env(Int|Float) straight to a module-scope const", () => {
    const offenders: string[] = [];
    for (const pkg of KERNEL_PACKAGES) {
      for (const file of sourceFiles(path.join(repoRoot, "packages", pkg, "src"))) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (MODULE_SCOPE_ENV_READ.test(line)) {
              offenders.push(`${path.relative(repoRoot, file)}:${i + 1}  ${line.trim()}`);
            }
          });
      }
    }
    expect(
      offenders,
      "these read the environment at import time, before loadDotEnv() runs — wrap each in a " +
        "read-at-use function (see db.ts's READ_RETRY_ATTEMPTS):\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
