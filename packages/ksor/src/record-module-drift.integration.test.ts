/**
 * The site's copy of the record module must be the kernel's, exactly — up to
 * ONE mechanical transformation, asserted rather than trusted.
 *
 * The site reads the record with the SAME rules `ksor build` and `ksor ingest`
 * run — frontmatter, the profile, the policy, the ledger, the index generator,
 * the checker — and it cannot import the kernel (decision 18: the kernel
 * package carries pg and the embedding providers). So the module is COPIED,
 * mirroring the kernel's `src/` layout (`record/` beside `lib/`) so every
 * relative import inside it resolves unchanged. The one transformation: the
 * kernel writes `./x.js` (Node ESM), and Turbopack does not map that onto
 * `x.ts` (found live 2026-08-25: `Module not found: Can't resolve
 * '../lib/order-rule.js'`), so the copy drops the extension — the site's own
 * modules are extensionless for the same reason. Decision 26 says the copy
 * becomes generated at package-build time; until then this is what keeps it
 * one rule set.
 *
 * If this fails: copy the named file from `packages/content/src/` over the
 * site's copy and drop the `.js` from its relative imports. The kernel's is
 * canonical.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const KERNEL = path.resolve(here, "..", "..", "content", "src");
const SITE = path.resolve(here, "..", "templates", "scaffold", "system", "site");

/** Line endings are the checkout's, not the rule's (Windows CI, 2026-08-21). */
const text = (file: string): string => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

/** The kernel's file as the site must carry it: relative imports without `.js`. */
const asSiteCopy = (kernel: string): string =>
  kernel.replace(/(from "\.{1,2}\/[^"]+?)\.js"/g, '$1"');

/** Every shipped module of the record set, test files excluded. */
const RECORD_FILES: readonly string[] = readdirSync(path.join(KERNEL, "record"))
  .filter((name) => name.endsWith(".ts") && !name.includes(".test."))
  .sort();

/** The leaf rules under `lib/` the record module and the site both read. */
const LIB_FILES = ["audience-rule.ts", "lifecycle-rule.ts"] as const;

describe("the record module is one rule set", () => {
  it("ships every kernel record file, so the list is not hand-kept", () => {
    expect(RECORD_FILES).toContain("check.ts");
    expect(RECORD_FILES).toContain("index-file.ts");
    expect(RECORD_FILES.length).toBeGreaterThanOrEqual(12);
  });

  for (const name of RECORD_FILES) {
    it(`record/${name}: the site's copy is the kernel's, minus the .js import extensions`, () => {
      expect(
        text(path.join(SITE, "record", name)),
        `system/site/record/${name} has drifted — copy packages/content/src/record/${name} over it and drop the .js from its relative imports`,
      ).toBe(asSiteCopy(text(path.join(KERNEL, "record", name))));
    });
  }

  for (const name of LIB_FILES) {
    it(`lib/${name}: the site's copy matches the kernel's exactly`, () => {
      expect(
        text(path.join(SITE, "lib", name)),
        `system/site/lib/${name} has drifted — copy packages/content/src/lib/${name} over it`,
      ).toBe(text(path.join(KERNEL, "lib", name)));
    });
  }

  it("the record module reaches outside itself only for the lib leaves and its declared deps", () => {
    // A new import from `../something` in the kernel would silently break the
    // site's mirrored copy; name it here when it is deliberate.
    const allowed = new Set(["../lib/audience-rule.js", "../lib/order-rule.js"]);
    for (const name of RECORD_FILES) {
      for (const m of text(path.join(KERNEL, "record", name)).matchAll(/from "(\.\.\/[^"]+)"/g)) {
        expect(allowed, `record/${name} imports ${m[1]}, which the site does not carry`).toContain(
          m[1],
        );
      }
    }
  });
});
