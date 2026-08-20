// Oracle parity for the body split and the skip-gate hash (fixtures captured
// from sor_content/ingest/markdown.py @ b554f91). The body is what hashing and
// chunking read, so it must be byte-exact.

import { describe, expect, it } from "vitest";

import { chunkingFixtures } from "./fixtures/chunking.fixture.js";
import { contentHash, splitFrontmatter } from "./markdown.js";

describe("splitFrontmatter", () => {
  for (const c of chunkingFixtures.markdownCases) {
    it(c.name, () => {
      const got = splitFrontmatter(c.text);
      expect(got.frontmatter, `${c.name}: frontmatter; got ${JSON.stringify(got)}`).toBe(
        c.frontmatter,
      );
      expect(got.body, `${c.name}: body must be byte-exact`).toBe(c.body);
      expect(contentHash(got.body), `${c.name}: body hash`).toBe(c.bodyHash);
    });
  }
});

describe("contentHash", () => {
  it("normalizes CRLF so a CRLF checkout cannot force a phantom re-ingest", () => {
    expect(contentHash("a\r\nb")).toBe(contentHash("a\nb"));
  });

  it("leaves a bare \\r alone — only \\r\\n is normalized, as in the oracle", () => {
    expect(contentHash("a\rb")).not.toBe(contentHash("a\nb"));
  });
});
