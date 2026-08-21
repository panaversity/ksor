/**
 * The site's copy of the reading-order rule must be byte-identical to the
 * kernel's, for the same reason the audience rule's is: the site cannot import
 * the kernel (its lib runs inside Next's build and is deliberately
 * dependency-light, while the kernel package carries pg and the embedding
 * providers), so the rule is COPIED — and a copy that can drift is exactly how
 * the two surfaces came to disagree about reading order in the first place.
 *
 * If this fails: copy `packages/content/src/lib/order-rule.ts` over
 * `packages/ksor/templates/scaffold/system/site/lib/order-rule.ts`. The
 * kernel's is canonical.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
/** Both halves of the rule are copied: the rule itself, and the tree sort. */
const COPIED = ["order-rule.ts", "page-order.ts"] as const;
const canonicalPath = (file: string): string =>
  path.resolve(here, "..", "..", "content", "src", "lib", file);
const copyPath = (file: string): string =>
  path.resolve(here, "..", "templates", "scaffold", "system", "site", "lib", file);

/**
 * Two differences are normalized before comparing, and NOTHING else is.
 *
 * Line endings, because they are a property of the checkout rather than of the
 * rule — `.gitattributes` pins the templates to LF while the kernel's copy takes
 * the platform default (caught by CI's Windows job, 2026-08-21).
 *
 * The extension on a relative import, because the two module systems disagree
 * about it and neither is wrong: the kernel is `moduleResolution: nodenext`, so
 * `./order-rule.js` is REQUIRED, and Next's resolver does not map a `.js`
 * specifier onto a `.ts` file, so the site build fails on exactly that
 * specifier. Found by building the real scaffold site, not by reading (a
 * `.js`-spelled copy typechecked clean here and broke `pnpm build` there,
 * 2026-08-21). Every other byte must match.
 */
const ruleText = (file: string): string =>
  readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/(from "\.\/[a-z-]+)\.js"/g, '$1"');

describe("the reading-order rule is one rule", () => {
  it.each(COPIED)("the scaffold's %s matches the kernel's canonical file exactly", (file) => {
    expect(
      ruleText(copyPath(file)),
      `the site's copy has drifted — copy packages/content/src/lib/${file} over it`,
    ).toBe(ruleText(canonicalPath(file)));
  });

  it("order-rule.ts is genuinely a leaf — no imports, so the copy has no side effects", () => {
    expect(
      /^import\s/m.test(ruleText(canonicalPath("order-rule.ts"))),
      "an import here would make the rule untestable in isolation, which is why it was extracted",
    ).toBe(false);
  });

  it("page-order.ts imports ONLY the rule — no framework, or the copy stops being testable", () => {
    const imports = [
      ...ruleText(canonicalPath("page-order.ts")).matchAll(/^import .*from "(.*)";$/gm),
    ].map((m) => m[1]);
    expect(imports).toEqual(["./order-rule"]);
  });
});
