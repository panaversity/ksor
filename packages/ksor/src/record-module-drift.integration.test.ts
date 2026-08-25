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

/**
 * Pinned exactly: the record module reads YAML with `yaml` and validates with
 * `zod`, in the site and in the kernel alike. TWO deps, not one — `zod` was
 * unpinned and unasserted here while `instance.ts`, `ledger.ts`, `lock.ts`,
 * `policy.ts` and `profile.ts` all import it, so the catalog's `^4.4.3` and
 * the site's exact `4.4.3` would have split on the first 4.5.0 release: two
 * halves of one rule set validating the same frontmatter under two different
 * validators, with nothing red.
 */
const PINNED: readonly (readonly [string, string])[] = [
  ["yaml", "2.9.0"],
  ["zod", "4.4.3"],
];

/** The leaf rules under `lib/` the record module and the site both read, held identical here. */
const LIB_FILES = ["audience-rule.ts", "lifecycle-rule.ts", "sim-rule.ts"] as const;

/** Leaves the site carries with a drift test of their own, so this file only has to allow them. */
const LIB_ELSEWHERE = ["order-rule.ts", "attachment-rule.ts"] as const;

describe("the record module is one rule set", () => {
  it("ships every kernel record file, so the list is not hand-kept", () => {
    expect(RECORD_FILES).toContain("check.ts");
    expect(RECORD_FILES).toContain("index-file.ts");
    expect(RECORD_FILES.length).toBeGreaterThanOrEqual(12);
  });

  // The list is derived from the KERNEL's directory, so a file the kernel
  // DELETES simply leaves the list — and its copy ships to every adopter
  // forever, unasserted. The set is compared both ways.
  it("carries no record file the kernel no longer has", () => {
    const site = readdirSync(path.join(SITE, "record"))
      .filter((name) => name.endsWith(".ts"))
      .sort();
    expect(
      site,
      "system/site/record must hold exactly the kernel's record modules — delete the extras, " +
        "or copy the missing ones over",
    ).toEqual([...RECORD_FILES]);
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

  it("imports no third-party package the site does not pin", () => {
    // The `../` allowlist below covers relative imports only, so a new bare
    // specifier in the kernel's record module — a second validator, a date
    // library — would reach the site's copy with nothing declaring it.
    const pinned = new Set(PINNED.map(([name]) => name));
    for (const name of RECORD_FILES) {
      for (const m of text(path.join(KERNEL, "record", name)).matchAll(/from "([^".][^"]*)"/g)) {
        const specifier = m[1]!;
        if (specifier.startsWith("node:")) continue;
        expect(
          pinned,
          `record/${name} imports "${specifier}"; pin it in system/site/package.json and add it to PINNED`,
        ).toContain(specifier);
      }
    }
  });

  it("the record module reaches outside itself only for the lib leaves and its declared deps", () => {
    // A new import from `../something` in the kernel would silently break the
    // site's mirrored copy; name it here when it is deliberate.
    // DERIVED from the lists above, not hand-kept: a hand-kept allowlist beside
    // a derived file list falls behind the moment a rule moves (it did — the
    // record module reached lifecycle-rule and attachment-rule while this set
    // still named two leaves).
    const allowed = new Set(
      [...LIB_FILES, ...LIB_ELSEWHERE].map((n) => `../lib/${n.replace(/\.ts$/, ".js")}`),
    );
    for (const name of RECORD_FILES) {
      for (const m of text(path.join(KERNEL, "record", name)).matchAll(/from "(\.\.\/[^"]+)"/g)) {
        expect(allowed, `record/${name} imports ${m[1]}, which the site does not carry`).toContain(
          m[1],
        );
      }
    }
  });
});

/**
 * The record module parses real YAML, so the site has to CARRY a YAML parser —
 * and an adopter's install has to be able to resolve it from the lockfile this
 * scaffold ships. The package.json half fails loudly (the build cannot find the
 * module); the LOCK half is the silent one, and it is the half that breaks an
 * adopter whose CI installs frozen.
 */
describe("the site carries the record module's runtime dependencies", () => {
  const SITE_MANIFEST = path.join(SITE, "package.json");
  const LOCK = path.resolve(here, "..", "templates", "scaffold", "pnpm-lock.yaml");
  const CATALOG = path.resolve(here, "..", "..", "..", "pnpm-workspace.yaml");

  /** The site importer's own dependency block, not the word appearing anywhere in a 5,000-line lock. */
  const importerBlock = (): string => {
    const lock = text(LOCK);
    const importer = lock.slice(lock.indexOf("\n  system/site:") + 1);
    // The importer ends where the next one begins: a line at exactly two
    // spaces of indent. Cutting on "\n  " alone cuts at the first nested key.
    const end = /\n {2}\S/.exec(importer.slice(1))?.index;
    return end === undefined ? importer : importer.slice(0, end + 1);
  };

  for (const [name, version] of PINNED) {
    it(`declares ${name} at exactly ${version}`, () => {
      const manifest = JSON.parse(text(SITE_MANIFEST)) as {
        dependencies?: Record<string, string>;
      };
      expect(
        manifest.dependencies?.[name],
        `system/site/package.json must declare ${name} — the copied record module imports it`,
      ).toBe(version);
    });

    it(`carries ${name} in the committed lockfile, so a frozen install resolves`, () => {
      const pattern = new RegExp(`\\n {6}${name}:\\n {8}specifier: (.+)\\n {8}version: (.+)\\n`);
      expect(
        pattern.exec(importerBlock())?.slice(1, 3),
        `system/site's importer in ${path.basename(LOCK)} does not resolve ${name} — run pnpm install in an emitted scaffold and commit the lock`,
      ).toEqual([version, version]);
    });

    // The half that was missing. The kernel resolves these through the
    // workspace CATALOG; a range there and an exact pin in the site is one
    // rule set validated by two different versions, which is decision 18's
    // failure mode wearing a semver caret.
    it(`resolves ${name} to the same version in the kernel's catalog`, () => {
      const catalog = text(CATALOG);
      const declared = new RegExp(`\\n  ${name}: (\\S+)`).exec(catalog)?.[1];
      expect(
        declared,
        `pnpm-workspace.yaml's catalog must pin ${name} to exactly ${version} — the kernel and ` +
          "the site's byte-identical copy must validate with one version, not two",
      ).toBe(version);
    });
  }
});
