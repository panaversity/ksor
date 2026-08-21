/**
 * The site's copy of the denial rule must match the kernel's.
 *
 * Same arrangement, and same reason, as `audience-rule-drift.test.ts`: the site
 * cannot import the kernel — its lib is dependency-light and runs inside Next's
 * build, while the kernel package carries pg and the embedding providers — so
 * the rule is COPIED, and a copy that can drift is exactly how the
 * withdrawn-document leak survived four separate fixes.
 *
 * If this fails: copy `packages/content/src/lib/denial-rule.ts` over
 * `packages/ksor/templates/scaffold/system/site/lib/denial-rule.ts`. The
 * kernel's is canonical.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const CANONICAL = path.resolve(here, "..", "..", "content", "src", "lib", "denial-rule.ts");
const COPY = path.resolve(
  here,
  "..",
  "templates",
  "scaffold",
  "system",
  "site",
  "lib",
  "denial-rule.ts",
);

/** Line endings are a property of the checkout, not of the rule. */
const ruleText = (file: string): string => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

describe("the denial rule is one rule", () => {
  it("the scaffold's copy matches the kernel's canonical file exactly", () => {
    expect(
      ruleText(COPY),
      "the site's copy has drifted — copy packages/content/src/lib/denial-rule.ts over it",
    ).toBe(ruleText(CANONICAL));
  });

  it("and it is genuinely a leaf — no imports, so importing it has no side effects", () => {
    expect(
      /^import\s/m.test(ruleText(CANONICAL)),
      "an import here would make the rule untestable in isolation, which is why it was extracted",
    ).toBe(false);
  });
});
