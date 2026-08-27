// Oracle parity for the body split and the skip-gate hash (fixtures captured
// from sor_content/ingest/markdown.py @ b554f91). The body is what hashing and
// chunking read, so it must be byte-exact.

import { describe, expect, it } from "vitest";

import { chunkingFixtures } from "./fixtures/chunking.fixture.js";
import { contentHash } from "./markdown.js";

// The rest of this fixture's oracle parity moved to `record/frontmatter.test.ts`
// with the reader itself (decision 26). What stays here is the half this module
// still owns: the body a split produced must hash to what the oracle recorded.
describe("contentHash — oracle parity over the fixture bodies", () => {
  for (const c of chunkingFixtures.markdownCases) {
    it(c.name, () => {
      expect(contentHash(c.body), `${c.name}: body hash`).toBe(c.bodyHash);
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
