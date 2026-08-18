// Fixture-driven equality against the oracle chunker (sor-agentfactory @
// b554f91): every case in fixtures/chunking.fixture.ts was produced by the
// Python chunker, so equality here IS the fidelity claim — the v5 policy
// string must hold without a bump.

import { describe, expect, it } from "vitest";

import {
  CHUNK_POLICY,
  HARD_MAX_CHARS,
  chunkText,
  headingPathText,
  stripPresentationJsx,
  stripStyleBlocks,
} from "./chunking.js";
import { chunkingFixtures } from "./fixtures/chunking.fixture.js";
import { contentHash } from "./markdown.js";

const cpLen = (s: string): number => [...s].length;
// build.py's exact composition: strip, then hash + chunk the CLEANED body.
const clean = (raw: string): string => stripPresentationJsx(stripStyleBlocks(raw));
const chunksFor = (cleaned: string, maxChars: number | null) =>
  maxChars === null ? chunkText(cleaned) : chunkText(cleaned, maxChars);

describe("chunk policy", () => {
  it("matches the oracle's policy string — the port must never need a bump", () => {
    expect(CHUNK_POLICY).toBe(chunkingFixtures.policy);
  });
});

describe("oracle fixture equality", () => {
  for (const c of chunkingFixtures.cases) {
    it(`${c.name} — ${c.note}`, () => {
      const cleaned = clean(c.raw);
      expect(cleaned, `${c.name}: cleaned body diverged; got ${JSON.stringify(cleaned)}`).toBe(
        c.cleaned,
      );

      const got = chunksFor(cleaned, c.maxChars);
      expect(
        got.length,
        `${c.name}: chunk count; got contents ${JSON.stringify(got.map((x) => x.content))}`,
      ).toBe(c.chunks.length);

      got.forEach((chunk, i) => {
        const want = c.chunks[i]!;
        expect(chunk, `${c.name} chunk ${i}; got ${JSON.stringify(chunk)}`).toEqual({
          ordinal: want.ordinal,
          content: want.content,
          chunkHash: want.chunkHash,
          headingPath: want.headingPath,
          anchor: want.anchor,
          sourceType: want.sourceType,
        });
        expect(
          headingPathText(chunk.headingPath),
          `${c.name} chunk ${i}: headingPathText(${JSON.stringify(chunk.headingPath)})`,
        ).toBe(want.headingPathText);
      });
    });
  }
});

describe("zero chunk overlap — the product invariant", () => {
  for (const c of chunkingFixtures.cases) {
    it(`${c.name}: concatenating the port's chunks reproduces the cleaned body byte-exact`, () => {
      const reassembled = chunksFor(c.cleaned, c.maxChars)
        .map((x) => x.content)
        .join("");
      expect(reassembled, `${c.name}: reassembly diverged`).toBe(c.cleaned);
    });
  }

  it("every fixture chunk respects the hard ceiling in CODE POINTS", () => {
    for (const c of chunkingFixtures.cases) {
      for (const chunk of c.chunks) {
        expect(
          cpLen(chunk.content),
          `${c.name}#${chunk.ordinal}: ${cpLen(chunk.content)} code points`,
        ).toBeLessThanOrEqual(HARD_MAX_CHARS);
      }
    }
  });

  it("ordinals are dense 0..n-1 in emission order", () => {
    for (const c of chunkingFixtures.cases) {
      const got = chunksFor(c.cleaned, c.maxChars).map((x) => x.ordinal);
      expect(got, c.name).toEqual([...got.keys()]);
    }
  });
});

describe("contentHash over cleaned bodies", () => {
  it("matches the oracle's CRLF-normalized sha256 for every case", () => {
    for (const c of chunkingFixtures.cases) {
      expect(contentHash(c.cleaned), c.name).toBe(c.contentHash);
    }
  });
});
