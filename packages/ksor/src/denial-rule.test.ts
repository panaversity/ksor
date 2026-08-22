/**
 * Whether a withdrawn document gets published — asserted as a rule.
 *
 * Every one of these functions is governance-critical and none had a test: a
 * round-8 mutation made `isDenied` return false unconditionally, which
 * publishes every withdrawn document to `/docs` and `llms.txt`, and 591 unit
 * plus 133 integration tests stayed green. No test referenced `stage-knowledge`,
 * `isDenied` or `stableIdOf` except as fixture strings, and none of the E2E
 * suites contained a takedown case at all.
 *
 * They were untestable rather than untested: they lived inside a module that
 * reads `instance.md` at import time. `denial-rule.ts` is the leaf they moved
 * to — canonical in the kernel, copied byte-identically into the scaffold, with
 * `denial-rule-drift.test.ts` holding the copy honest, exactly as decision 18
 * arranged the audience rule.
 *
 * The cases are the doors this leak has come through across four rounds: an
 * exact id, a subtree directory, a document the database has never seen, an
 * `sor_id:` override, and a trailing comment on that override.
 */

import { describe, expect, it } from "vitest";

import {
  isDenied,
  recordPathFrom,
  scalarLike,
  stableIdFrom,
  type SiteDenylistManifest as DenylistManifest,
} from "@panaversity/ksor-content";

const EMPTY: DenylistManifest = { source: "none", denied: [], denied_subtrees: [] };

describe("isDenied — exact ids", () => {
  const manifest: DenylistManifest = {
    source: "database",
    denied: [{ stable_id: "knowledge/hr/policy", scope: "node" }],
    denied_subtrees: [],
  };

  it("denies the listed id", () => {
    expect(isDenied(manifest, "knowledge/hr/policy", "knowledge/hr/policy.md")).toBe(true);
  });

  it("does NOT deny a different document", () => {
    expect(isDenied(manifest, "knowledge/hr/other", "knowledge/hr/other.md")).toBe(false);
  });

  it("does NOT deny by prefix — a section id ends in #section or /index", () => {
    // Prefix matching is the failure decision 14 records: it over-matches
    // prefix-siblings and misses real children.
    expect(
      isDenied(manifest, "knowledge/hr/policy-archive", "knowledge/hr/policy-archive.md"),
    ).toBe(false);
  });

  it("an empty manifest denies nothing", () => {
    expect(isDenied(EMPTY, "knowledge/hr/policy", "knowledge/hr/policy.md")).toBe(false);
  });
});

describe("isDenied — subtree directories", () => {
  const manifest: DenylistManifest = {
    source: "database",
    denied: [{ stable_id: "knowledge/hr#section", scope: "node" }],
    denied_subtrees: ["knowledge/hr/"],
  };

  it("denies a document inside the withdrawn directory", () => {
    expect(isDenied(manifest, "knowledge/hr/policy", "knowledge/hr/policy.md")).toBe(true);
  });

  it("denies one the DATABASE has never seen — the whole point", () => {
    // Added under a withdrawn section after the last ingest: absent from the
    // expanded id list, present on disk.
    expect(isDenied(manifest, "knowledge/hr/2026-layoffs", "knowledge/hr/2026-layoffs.md")).toBe(
      true,
    );
  });

  it("denies deeper descendants too", () => {
    expect(isDenied(manifest, "knowledge/hr/eu/policy", "knowledge/hr/eu/policy.md")).toBe(true);
  });

  it("does NOT deny a sibling directory that shares a prefix", () => {
    expect(isDenied(manifest, "knowledge/hr-archive/x", "knowledge/hr-archive/x.md")).toBe(false);
  });

  it("does NOT deny a document outside it", () => {
    expect(isDenied(manifest, "knowledge/about", "knowledge/about.md")).toBe(false);
  });

  it('"/" denies the whole record', () => {
    const all: DenylistManifest = { source: "database", denied: [], denied_subtrees: ["/"] };
    expect(isDenied(all, "knowledge/anything", "knowledge/anything.md")).toBe(true);
  });

  it("tolerates a directory written without its trailing slash", () => {
    const loose: DenylistManifest = {
      source: "database",
      denied: [],
      denied_subtrees: ["knowledge/hr"],
    };
    expect(isDenied(loose, "knowledge/hr/policy", "knowledge/hr/policy.md")).toBe(true);
    expect(isDenied(loose, "knowledge/hr-archive/x", "knowledge/hr-archive/x.md")).toBe(false);
  });
});

describe("stableIdFrom — the sor_id override a takedown has to match", () => {
  it("derives from the path when no override is declared", () => {
    expect(stableIdFrom("knowledge", "hr/policy.md", "title: Policy")).toBe("knowledge/hr/policy");
  });

  it("honours an sor_id override", () => {
    expect(stableIdFrom("knowledge", "hr/policy.md", "sor_id: legacy/policy")).toBe(
      "legacy/policy",
    );
  });

  it("strips a TRAILING COMMENT, the way the kernel does", () => {
    // The divergence that made a takedown match on the door and miss on the site.
    expect(stableIdFrom("knowledge", "hr/policy.md", "sor_id: legacy/policy # renamed 2026")).toBe(
      "legacy/policy",
    );
  });

  it("keeps a # that is INSIDE a quoted value", () => {
    expect(stableIdFrom("knowledge", "hr/policy.md", `sor_id: "legacy/policy#part2"`)).toBe(
      "legacy/policy#part2",
    );
  });

  it("ignores an EMPTY override rather than making the id empty", () => {
    expect(stableIdFrom("knowledge", "hr/policy.md", "sor_id:")).toBe("knowledge/hr/policy");
  });

  it("strips only a .md suffix, case-insensitively", () => {
    expect(stableIdFrom("knowledge", "hr/POLICY.MD", "")).toBe("knowledge/hr/POLICY");
    expect(stableIdFrom("knowledge", "hr/policy.mdx", "")).toBe("knowledge/hr/policy.mdx");
  });
});

describe("scalarLike — the kernel's reading of a plain scalar", () => {
  it.each([
    ["plain", "plain"],
    ["  padded  ", "padded"],
    ["value # comment", "value"],
    ["value\t# comment", "value"],
    ['"quoted # inside"', "quoted # inside"],
    ["'single quoted'", "single quoted"],
  ])("%s -> %s", (raw, expected) => {
    expect(scalarLike(raw)).toBe(expected);
  });

  it.each([
    // Values the kernel does not hand back as a STRING: an empty value is
    // null, and a bool/number is typed. None of them can be an id, so the
    // site must not read one where the kernel would not (round-10 review).
    [""],
    ["4711"],
    ["1.5"],
    ["no"],
    ["true"],
    ["~"],
  ])("%s is not a string value", (raw) => {
    expect(scalarLike(raw)).toBeUndefined();
  });

  it("undefined stays undefined — a key that is absent is not one that is empty", () => {
    expect(scalarLike(undefined)).toBeUndefined();
  });
});

describe("recordPathFrom — the frame origin_path uses", () => {
  it("prefixes the record directory's own name", () => {
    expect(recordPathFrom("knowledge", "hr/policy.md")).toBe("knowledge/hr/policy.md");
  });

  it("matches a subtree directory exported from the database", () => {
    const manifest: DenylistManifest = {
      source: "database",
      denied: [],
      denied_subtrees: ["knowledge/hr/"],
    };
    expect(isDenied(manifest, "irrelevant", recordPathFrom("knowledge", "hr/policy.md"))).toBe(
      true,
    );
  });
});
