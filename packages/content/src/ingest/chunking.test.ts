// Fixture-driven equality against the oracle chunker (sor-agentfactory @
// b554f91): every case in fixtures/chunking.fixture.ts was produced by the
// Python chunker, so equality here IS the fidelity claim — the v5 policy
// string must hold without a bump.

import { describe, expect, it } from "vitest";

import {
  classify,
  CHUNK_POLICY,
  HARD_MAX_CHARS,
  chunkText,
  cleanBody,
  headingPathText,
  stripPresentationJsx,
  stripStyleBlocks,
  isNavShaped,
} from "./chunking.js";
import { chunkingFixtures } from "./fixtures/chunking.fixture.js";
import { contentHash } from "./markdown.js";

const cpLen = (s: string): number => [...s].length;
// build.py's exact composition: strip, then hash + chunk the CLEANED body.
const clean = (raw: string): string => stripPresentationJsx(stripStyleBlocks(raw));
const chunksFor = (cleaned: string, maxChars: number | null) =>
  maxChars === null ? chunkText(cleaned) : chunkText(cleaned, maxChars);

describe("chunk policy", () => {
  it("has moved ONE version past the oracle, deliberately", () => {
    // The port needed no bump for three releases, which is what the previous
    // wording recorded. Issue #55 is the first DELIBERATE divergence: the
    // oracle decides `nav` by length and we decide it by shape. The policy
    // string is persisted per source row and gates carry-forward, so this bump
    // is what makes an existing corpus RE-CHUNK instead of serving chunks
    // labelled by a rule that no longer exists.
    expect(chunkingFixtures.policy).toBe("heading-aware-1500-content-only-v5");
    expect(CHUNK_POLICY).toBe("heading-aware-1500-content-only-v6");
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
        // Everything the oracle decided about SHAPE stays byte-identical. Only
        // `sourceType` may differ, and only in the one direction issue #55
        // allows — see the divergence assertions below.
        expect(chunk, `${c.name} chunk ${i}; got ${JSON.stringify(chunk)}`).toEqual({
          ordinal: want.ordinal,
          content: want.content,
          chunkHash: want.chunkHash,
          headingPath: want.headingPath,
          anchor: want.anchor,
          sourceType: chunk.sourceType,
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

/**
 * Issue #55 — navigation is a SHAPE, not a length.
 *
 * The converted rule classified any segment under NAV_MAX_CHARS (250 code
 * points) as `nav`, and the serving predicate admits only `prose`. On the
 * curriculum corpus the oracle was tuned against, that proxy holds: a short
 * segment there really is a link list. On a handbook it inverts — the highest
 * value content is short and declarative, so the rule silently deleted it from
 * search. Walked live on 0.0.14: three ordinary policy statements, three of
 * four chunks unsearchable, and "how long does a buyer have to send something
 * back" answered with the scaffold's placeholder against a record that states
 * thirty days.
 *
 * The bodies below are the fixture corpus in `evals/fixtures/handbook`, which
 * exists to make this decision measurable rather than arguable.
 */
describe("nav is decided by shape, not by length (#55)", () => {
  const SHORT_FACT = "\nSix months, with a written review at three and six.\n";
  const LINK_LIST =
    "\n- [Probation](probation.md)\n- [Notice periods](notice-periods.md)\n" +
    "- [Expense limits](expense-limits.md)\n- [Travel](travel.md)\n" +
    "- [Incidents](incidents.md)\n\nSee also the finance intranet.\n";

  it("a complete short fact is prose — 51 characters, and the whole answer", () => {
    expect(classify(SHORT_FACT, ["Probation"])).toBe("prose");
  });

  it("a link list is nav even though it is LONGER than the fact", () => {
    // 180-odd characters against the fact's 51: length ranks these the wrong
    // way round, which is exactly why length cannot be the rule.
    expect(LINK_LIST.length).toBeGreaterThan(SHORT_FACT.length);
    expect(classify(LINK_LIST, ["Handbook"])).toBe("nav");
  });

  it("a heading with nothing under it is still nav", () => {
    expect(classify("\n\n", ["Empty"])).toBe("nav");
  });

  it("a stub too short to answer anything is still nav", () => {
    expect(classify("\nTODO\n", ["Stub"])).toBe("nav");
  });

  it("prose that happens to CONTAIN a link is prose", () => {
    expect(
      classify("\nClaim within thirty days; see the [expenses page](x.md) to file.\n", [
        "Expenses",
      ]),
    ).toBe("prose");
  });

  it("a one-line 'see also' pointer is nav", () => {
    expect(classify("\n- [Finance intranet](https://example.com)\n", ["See also"])).toBe("nav");
  });
});

/**
 * We diverge from the oracle on exactly one field, and the divergence is a
 * property rather than a list — so it stays true as fixtures change, and a
 * change of direction fails loudly.
 *
 * The oracle's corpus cannot settle the nav question either way: it contains
 * NO markdown links at all (asserted below). Its 61 `nav` labels are artifacts
 * of short synthetic bodies, not of navigation. That is why the handbook
 * fixture in `evals/fixtures/handbook` exists.
 */
describe("how we differ from the oracle, and only how", () => {
  const diffs = chunkingFixtures.cases.flatMap((c) => {
    const got = chunksFor(clean(c.raw), c.maxChars);
    return got.flatMap((chunk, i) => {
      const want = c.chunks[i];
      return want !== undefined && chunk.sourceType !== want.sourceType
        ? [
            {
              case: c.name,
              was: want.sourceType,
              now: chunk.sourceType,
              body: chunk.content,
              headingPathText: headingPathText(chunk.headingPath),
            },
          ]
        : [];
    });
  });

  it("differs ONLY on sourceType, and only nav -> prose", () => {
    // The dangerous direction is prose -> nav: that DELETES something from
    // search. Nothing may take it without a decision of its own.
    const wrongWay = diffs.filter((d) => !(d.was === "nav" && d.now === "prose"));
    expect(
      wrongWay.map((d) => `${d.case}: ${d.was} -> ${d.now} ${JSON.stringify(d.body.slice(0, 60))}`),
      "a chunk changed classification in a direction #55 does not license",
    ).toEqual([]);
  });

  it("promotes only chunks whose SECTION carries real prose", () => {
    // The unit of classification is the heading-segment, not the chunk: the
    // oracle's own invariant is that a split section never orphans a heading
    // piece as nav, so a two-word fragment of a substantial section is
    // correctly prose. Asserting per chunk measures the wrong thing — it flags
    // "After the fence." while its section is a page of text. So the section is
    // reassembled and asked the question the implementation asks.
    const bySection = new Map<string, string>();
    for (const c of chunkingFixtures.cases) {
      for (const chunk of chunksFor(clean(c.raw), c.maxChars)) {
        const key = `${c.name}\u0000${headingPathText(chunk.headingPath)}`;
        bySection.set(key, (bySection.get(key) ?? "") + chunk.content);
      }
    }
    const unjustified = diffs.filter((d) => {
      const section = bySection.get(`${d.case}\u0000${d.headingPathText}`) ?? d.body;
      return isNavShaped(section);
    });
    expect(
      unjustified.map((d) => `${d.case}: ${JSON.stringify(d.body.slice(0, 60))}`),
      "a chunk was promoted to prose although its whole section is navigation",
    ).toEqual([]);
  });

  it("the oracle corpus cannot settle the nav question — it has no links", () => {
    // Recorded because it is the reason the handbook fixture had to be written:
    // measuring a navigation rule against a corpus with no navigation in it
    // would have confirmed whatever rule was already there.
    const withLinks = chunkingFixtures.cases.filter((c) => /\[[^\]]+\]\([^)]+\)/.test(c.cleaned));
    expect(withLinks.map((c) => c.name)).toEqual([]);
  });
});
