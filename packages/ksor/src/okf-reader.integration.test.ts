/**
 * Record spec §7 acceptance 6, executed: **a bare OKF reader with no ksor code
 * reads the emitted starter's `knowledge/` as typed concepts.**
 *
 * This is the only acceptance that tests the record spec's stated business
 * claim — "a record that is literally an open bundle any OKF consumer can read
 * with no ksor in the loop" — and until now it was asserted by nothing. What is
 * asserted elsewhere (the fixture, the drift test, the build acceptance) runs
 * ksor's own parser on BOTH sides, which cannot tell a conformant bundle from
 * one only ksor understands.
 *
 * There is no reference `OKFDocument.parse` to run here — the spec is vendored,
 * the implementation is not — so the reader is written out in full below, from
 * the vendored spec alone, and shares NO code with
 * `packages/content/src/record`: it splits the fence itself and parses YAML
 * with the parser directly. If it ever needs to import a ksor module to pass,
 * that import is the finding.
 *
 * The spec's own bar is deliberately low (§4.1: "`type` is the only
 * always-required key"), so the assertions are OKF's floor plus the shapes an
 * ordinary consumer would act on: a title to display, a sentence to preview,
 * a `sources` list whose entries name where they came from, and the reserved
 * root index carrying `okf_version` (§8).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const KNOWLEDGE = fileURLToPath(new URL("../templates/scaffold/knowledge/", import.meta.url));

/** OKF §4: a document is `---\n<yaml>\n---\n<markdown>`. Hand-rolled on purpose. */
function readOkf(text: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return { frontmatter: {}, body: normalized };
  const end = normalized.indexOf("\n---", 3);
  expect(end, "the frontmatter fence is never closed").toBeGreaterThan(0);
  const yaml = normalized.slice(4, end + 1);
  const parsed: unknown = yaml.trim() === "" ? {} : parse(yaml);
  expect(typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)).toBe(true);
  return {
    frontmatter: parsed as Record<string, unknown>,
    body: normalized.slice(normalized.indexOf("\n", end + 1) + 1),
  };
}

function markdownUnder(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return markdownUnder(path.join(dir, entry.name), `${rel}/`);
    return entry.name.endsWith(".md") ? [rel] : [];
  });
}

/** Reserved by OKF §8 (the generated index) or by the profile (a companion). */
const RESERVED = /(^|\/)(index|README)\.md$|\.(summary)\.md$/;

describe("the emitted starter, read by a bare OKF reader", () => {
  const files = markdownUnder(KNOWLEDGE);
  const concepts = files.filter((f) => !RESERVED.test(f));

  it("ships concepts to read, and reserved files to skip", () => {
    expect(concepts.length, "no concept to read proves nothing").toBeGreaterThan(2);
    expect(files.filter((f) => RESERVED.test(f)).length).toBeGreaterThan(0);
  });

  for (const rel of concepts) {
    it(`${rel} is a typed concept with a title, a sentence and a body`, () => {
      const { frontmatter, body } = readOkf(readFileSync(path.join(KNOWLEDGE, rel), "utf8"));
      // OKF §4.1's floor.
      expect(typeof frontmatter["type"], `${rel} declares no \`type\``).toBe("string");
      expect(String(frontmatter["type"]).trim()).not.toBe("");
      // §4.1 recommended, and what any consumer renders.
      expect(typeof frontmatter["title"]).toBe("string");
      expect(typeof frontmatter["description"]).toBe("string");
      expect(body.trim(), `${rel} has no body`).not.toBe("");
      // §5.1: a source names the asset it came from.
      const sources = frontmatter["sources"];
      if (sources !== undefined) {
        expect(Array.isArray(sources)).toBe(true);
        for (const source of sources as Record<string, unknown>[]) {
          expect(typeof source["resource"], `${rel} has a source with no resource`).toBe("string");
        }
      }
    });
  }

  it("the root index is the reserved §8 form: okf_version, and no governance", () => {
    const { frontmatter } = readOkf(readFileSync(path.join(KNOWLEDGE, "index.md"), "utf8"));
    expect(frontmatter["okf_version"]).toBe("0.2");
    expect(Object.keys(frontmatter)).toEqual(["okf_version"]);
  });

  it("a non-root index carries no frontmatter at all", () => {
    for (const rel of files.filter((f) => f.endsWith("/index.md"))) {
      const { frontmatter } = readOkf(readFileSync(path.join(KNOWLEDGE, rel), "utf8"));
      expect(Object.keys(frontmatter), `${rel} declares frontmatter`).toEqual([]);
    }
  });
});
