// Fixture-driven equality against the oracle chunker (sor-agentfactory @
// b554f91): every case in fixtures/chunking.fixture.ts was produced by the
// Python chunker, so equality here IS the fidelity claim — the v5 policy
// string must hold without a bump.

import { describe, expect, it } from "vitest";

import {
  CHUNK_POLICY,
  HARD_MAX_CHARS,
  chunkText,
  cleanBody,
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

describe("cleanBody — CRLF normalized BEFORE the strippers (review 2026-08-19)", () => {
  // A doc that takes the STRIPPER slow path (a className'd layout wrapper) AND
  // leaves a blank-line run once the bare <div>/<\/div> are dropped. The
  // blank-run collapse is /\n{3,}/, which never matches \r\n\r\n\r\n — so
  // normalizing AFTER the strip (the bug) left a CRLF checkout un-collapsed and
  // every chunk_hash diverged from an LF checkout. cleanBody normalizes first.
  const lf = [
    "# Title",
    "",
    '<div className="af-hero">',
    "",
    "The Third Era of AI Tools",
    "",
    "</div>",
    "",
    "Body paragraph after the wrapper, long enough to be its own chunk.",
    "",
  ].join("\n");
  const crlf = lf.replaceAll("\n", "\r\n");

  it("produces a byte-identical cleaned body for an LF doc and its CRLF twin", () => {
    const a = cleanBody(lf);
    const b = cleanBody(crlf);
    expect(b, `CRLF cleaned body: ${JSON.stringify(b)}`).toBe(a);
    // and it genuinely collapsed the blank run (guards against the test passing
    // because neither path stripped anything)
    expect(a, `cleaned: ${JSON.stringify(a)}`).not.toMatch(/\n{3,}/);
  });

  it("yields identical chunk hashes across the two line endings", () => {
    const hLf = chunkText(cleanBody(lf)).map((c) => c.chunkHash);
    const hCrlf = chunkText(cleanBody(crlf)).map((c) => c.chunkHash);
    expect(hCrlf, `LF hashes ${JSON.stringify(hLf)}`).toEqual(hLf);
  });

  it("leaves a bare \\r (no following \\n) as content", () => {
    expect(cleanBody("line1\rline2")).toBe("line1\rline2");
  });
});
