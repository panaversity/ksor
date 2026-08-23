/**
 * The site's copy of the attachment rule must be byte-identical to the kernel's.
 *
 * The site cannot import the kernel — its lib is deliberately dependency-light
 * and runs inside Next's build, while the kernel package carries pg and the
 * embedding providers — so the rule is COPIED. A copy that can drift is exactly
 * how this bug class survived four fixes, so the copy is asserted, not trusted.
 *
 * This rule has FOUR readers, which is one more than any other copied rule
 * here: ingest decides what becomes a node, staging decides what is copied,
 * source.config.ts decides what is a page, and the record's checker decides
 * what is well-formed. The last two cannot import TypeScript at all — a glob
 * and a dependency-free .mjs — so those two are held by the CASE TABLE below
 * rather than by bytes.
 *
 * If this fails: copy `packages/content/src/lib/attachment-rule.ts` over
 * `packages/ksor/templates/scaffold/system/site/lib/attachment-rule.ts`. The
 * kernel's is canonical.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const CANONICAL = path.resolve(here, "..", "..", "content", "src", "lib", "attachment-rule.ts");
const COPY = path.resolve(
  here,
  "..",
  "templates",
  "scaffold",
  "system",
  "site",
  "lib",
  "attachment-rule.ts",
);

/**
 * Line endings are NORMALIZED before comparing, because they are a property of
 * the checkout rather than of the rule. `.gitattributes` pins
 * `packages/ksor/templates/**` to LF — the templates are the published bytes —
 * while the kernel's copy takes the platform default, so on Windows the two
 * differ by \r on every line and nothing about the rule has changed. Caught by
 * CI's Windows job on the first run (2026-08-21).
 */
const ruleText = (file: string): string => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

describe("the attachment rule is one rule", () => {
  it("the scaffold's copy matches the kernel's canonical file exactly", () => {
    expect(
      ruleText(COPY),
      "the site's copy has drifted from the kernel's — copy packages/content/src/lib/attachment-rule.ts over it",
    ).toBe(ruleText(CANONICAL));
  });

  it("and it is genuinely a leaf — no imports, so importing it has no side effects", () => {
    const canonical = ruleText(CANONICAL);
    expect(
      /^import\s/m.test(canonical),
      "an import here would make the rule untestable in isolation, which is why it was extracted",
    ).toBe(false);
  });
});

/**
 * The glob half of this rule is NOT asserted here.
 *
 * `source.config.ts` expresses "an attachment is not a document" as tinyglobby
 * patterns, and tinyglobby is not a dependency of this repo — only an
 * undeclared transitive of fumadocs-mdx, which a test must not reach for. So
 * that half is proven where it is real: `scaffold-e2e.integration.test.ts`
 * reads the COLLECTIONS fumadocs actually generated from a built scaffold and
 * asserts every row of ATTACHMENT_CASES landed in the right one. An assertion
 * against a re-implementation of the matcher would prove only that two
 * re-implementations agree.
 */
