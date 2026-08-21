/**
 * The site's copy of the audience rule must be byte-identical to the kernel's.
 *
 * The site cannot import the kernel — its lib is deliberately dependency-light
 * and runs inside Next's build, while the kernel package carries pg and the
 * embedding providers — so the rule is COPIED. A copy that can drift is exactly
 * how this bug class survived four fixes, so the copy is asserted, not trusted.
 *
 * If this fails: copy `packages/content/src/lib/audience-rule.ts` over
 * `packages/ksor/templates/scaffold/system/site/lib/audience-rule.ts`. The
 * kernel's is canonical.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const CANONICAL = path.resolve(here, "..", "..", "content", "src", "lib", "audience-rule.ts");
const COPY = path.resolve(
  here,
  "..",
  "templates",
  "scaffold",
  "system",
  "site",
  "lib",
  "audience-rule.ts",
);

describe("the audience rule is one rule", () => {
  it("the scaffold's copy matches the kernel's canonical file exactly", () => {
    const canonical = readFileSync(CANONICAL, "utf8");
    const copy = readFileSync(COPY, "utf8");
    expect(
      copy,
      "the site's copy has drifted from the kernel's — copy packages/content/src/lib/audience-rule.ts over it",
    ).toBe(canonical);
  });

  it("and it is genuinely a leaf — no imports, so importing it has no side effects", () => {
    const canonical = readFileSync(CANONICAL, "utf8");
    expect(
      /^import\s/m.test(canonical),
      "an import here would make the rule untestable in isolation, which is why it was extracted",
    ).toBe(false);
  });
});
