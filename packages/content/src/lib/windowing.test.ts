/**
 * The packer's carried invariants, proven offline: contiguity (windows
 * concatenate byte-exact), whole-section greed, single-level descent,
 * whole-chunk fallback, ≥1 chunk always — plus GOLDEN fixtures extracted
 * from the oracle so the port's packing decisions match the Python
 * byte-for-byte, code-point counting included.
 */

import { describe, expect, it } from "vitest";

import {
  cleanCut,
  codePointLength,
  estTokens,
  windowDocument,
  type DocumentChunk,
} from "./windowing.js";

const mk = (ordinal: number, headingPath: string, content: string): DocumentChunk => ({
  ordinal,
  headingPath,
  content,
});

function lesson(): DocumentChunk[] {
  return [
    mk(0, "", "intro ".repeat(10)), // 60 chars preamble
    mk(1, "part-1", "a".repeat(100)),
    mk(2, "part-1/deep", "b".repeat(100)),
    mk(3, "part-2", "c".repeat(150)),
    mk(4, "part-3", "d".repeat(120)),
  ];
}

interface GoldenWindow {
  readonly fromHeading: string | null;
  readonly ordinals: readonly number[];
  readonly windowFrom: string | null;
  readonly windowTo: string | null;
  readonly nextHeading: string | null;
  readonly remainingSections: readonly string[];
}

interface GoldenCase {
  readonly budget: number;
  readonly chunks: readonly DocumentChunk[];
  readonly windows: readonly GoldenWindow[];
}

// GOLDEN fixtures extracted from the oracle's window_lesson
// (sor-agentfactory @ b554f91, lib/windowing.py) — each case walked to
// exhaustion via next_heading cursors with `uv run --no-sync python`
// (scratchpad/extract_windowing_goldens.py). Do not hand-edit; regenerate
// against the oracle. The "unicode" case is load-bearing: its contents are
// astral (surrogate-pair) characters, so a UTF-16 code-unit counter packs
// them differently and fails here.
const GOLDENS: Record<string, GoldenCase> = {
  mixed: {
    budget: 300,
    chunks: [
      mk(0, "", "intro ".repeat(10)),
      mk(1, "part-1", "a".repeat(100)),
      mk(2, "part-1/deep", "b".repeat(100)),
      mk(3, "part-2", "c".repeat(150)),
      mk(4, "part-3", "d".repeat(120)),
    ],
    windows: [
      {
        fromHeading: null,
        ordinals: [0, 1, 2],
        windowFrom: null,
        windowTo: "part-1/deep",
        nextHeading: "part-2",
        remainingSections: ["part-2", "part-3"],
      },
      {
        fromHeading: "part-2",
        ordinals: [3, 4],
        windowFrom: "part-2",
        windowTo: "part-3",
        nextHeading: null,
        remainingSections: [],
      },
    ],
  },
  descend: {
    budget: 500,
    chunks: [
      mk(0, "big/sub-a", "x".repeat(400)),
      mk(1, "big/sub-b", "y".repeat(400)),
      mk(2, "after", "z".repeat(50)),
    ],
    windows: [
      {
        fromHeading: null,
        ordinals: [0],
        windowFrom: "big/sub-a",
        windowTo: "big/sub-a",
        nextHeading: "big/sub-b",
        remainingSections: ["big", "after"],
      },
      {
        fromHeading: "big/sub-b",
        ordinals: [1, 2],
        windowFrom: "big/sub-b",
        windowTo: "after",
        nextHeading: null,
        remainingSections: [],
      },
    ],
  },
  fallback: {
    budget: 120,
    chunks: [
      mk(0, "sec", "a".repeat(100)),
      mk(1, "sec", "b".repeat(100)),
      mk(2, "sec", "c".repeat(100)),
    ],
    windows: [
      {
        fromHeading: null,
        ordinals: [0],
        windowFrom: "sec",
        windowTo: "sec",
        nextHeading: "sec#1",
        remainingSections: ["sec"],
      },
      {
        fromHeading: "sec#1",
        ordinals: [1],
        windowFrom: "sec",
        windowTo: "sec",
        nextHeading: "sec#2",
        remainingSections: ["sec"],
      },
      {
        fromHeading: "sec#2",
        ordinals: [2],
        windowFrom: "sec",
        windowTo: "sec",
        nextHeading: null,
        remainingSections: [],
      },
    ],
  },
  "later-oversized": {
    budget: 200,
    chunks: [
      mk(0, "s1", "a".repeat(50)),
      mk(1, "s2", "b".repeat(500)),
      mk(2, "s3", "c".repeat(50)),
    ],
    windows: [
      {
        fromHeading: null,
        ordinals: [0],
        windowFrom: "s1",
        windowTo: "s1",
        nextHeading: "s2",
        remainingSections: ["s2", "s3"],
      },
      {
        fromHeading: "s2",
        ordinals: [1],
        windowFrom: "s2",
        windowTo: "s2",
        nextHeading: "s3",
        remainingSections: ["s3"],
      },
      {
        fromHeading: "s3",
        ordinals: [2],
        windowFrom: "s3",
        windowTo: "s3",
        nextHeading: null,
        remainingSections: [],
      },
    ],
  },
  unicode: {
    budget: 10,
    chunks: [
      mk(0, "sec-a", "\u{1f3af}".repeat(8)), // 8 code points, 16 UTF-16 units
      mk(1, "sec-b", "\u{1f680}".repeat(4) + "bb"), // 6 code points
      mk(2, "sec-c", "cccc"),
    ],
    windows: [
      {
        fromHeading: null,
        ordinals: [0],
        windowFrom: "sec-a",
        windowTo: "sec-a",
        nextHeading: "sec-b",
        remainingSections: ["sec-b", "sec-c"],
      },
      {
        fromHeading: "sec-b",
        ordinals: [1, 2],
        windowFrom: "sec-b",
        windowTo: "sec-c",
        nextHeading: null,
        remainingSections: [],
      },
    ],
  },
  "preamble-heavy": {
    budget: 100,
    chunks: [mk(0, "", "p".repeat(40)), mk(1, "", "q".repeat(40)), mk(2, "", "r".repeat(40))],
    windows: [
      {
        fromHeading: null,
        ordinals: [0, 1],
        windowFrom: null,
        windowTo: null,
        nextHeading: "#2",
        remainingSections: [],
      },
      {
        fromHeading: "#2",
        ordinals: [2],
        windowFrom: null,
        windowTo: null,
        nextHeading: null,
        remainingSections: [],
      },
    ],
  },
};

// clean_cut goldens from the same extraction — outputs are the oracle's,
// with CODE-POINT indices (the unicode rows shift under code-unit slicing).
const CLEAN_CUT_GOLDENS: readonly { text: string; limit: number; out: string }[] = [
  { text: "para one\n\npara two\n\npara three is long", limit: 25, out: "para one\n\npara two" },
  { text: "short", limit: 100, out: "short" },
  {
    text: "\u{1f389}\u{1f389}\u{1f389} alpha\n\nbeta gamma delta\n\nepsilon zeta",
    limit: 30,
    out: "\u{1f389}\u{1f389}\u{1f389} alpha\n\nbeta gamma delta",
  },
  { text: "x".repeat(50), limit: 30, out: "x".repeat(30) },
  { text: "ab\n\n" + "c".repeat(40), limit: 30, out: "ab\n\n" + "c".repeat(26) },
  {
    text: "\u{1f409}".repeat(20) + "\n\n" + "\u{1f409}".repeat(20),
    limit: 25,
    out: "\u{1f409}".repeat(20),
  },
];

/** Walk a document to exhaustion via next cursors, mirroring the extraction script. */
function walk(
  chunks: readonly DocumentChunk[],
  budget: number,
): { windows: ReturnType<typeof windowDocument>[]; cursors: (string | null)[] } {
  const windows: ReturnType<typeof windowDocument>[] = [];
  const cursors: (string | null)[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 200; i += 1) {
    const w = windowDocument(chunks, budget, cursor);
    cursors.push(cursor);
    windows.push(w);
    if (w.nextHeading === null) return { windows, cursors };
    cursor = w.nextHeading;
  }
  throw new Error("pagination did not terminate within 200 windows");
}

describe("golden fixtures (oracle byte-parity)", () => {
  for (const [name, golden] of Object.entries(GOLDENS)) {
    it(`replays the oracle windows for ${JSON.stringify(name)}`, () => {
      const { windows, cursors } = walk(golden.chunks, golden.budget);
      const got = windows.map((w, i) => ({
        fromHeading: cursors[i] ?? null,
        ordinals: w.chunks.map((c) => c.ordinal),
        windowFrom: w.windowFrom,
        windowTo: w.windowTo,
        nextHeading: w.nextHeading,
        remainingSections: [...w.remainingSections],
      }));
      expect(got, `case ${name}: ${JSON.stringify(got)}`).toEqual(golden.windows);
      // Consecutive windows concatenate byte-exact to the whole document.
      const concat = windows.flatMap((w) => w.chunks.map((c) => c.content)).join("");
      expect(concat).toBe(golden.chunks.map((c) => c.content).join(""));
    });
  }

  it("replays the oracle clean_cut outputs, code-point indexed", () => {
    for (const { text, limit, out } of CLEAN_CUT_GOLDENS) {
      expect(cleanCut(text, limit), `limit=${limit} text=${JSON.stringify(text)}`).toBe(out);
    }
  });
});

describe("carried invariants (oracle test_windowing.py)", () => {
  it("within-heading pagination advances via ordinal cursors and terminates", () => {
    // review #3: when ONE heading's chunks exceed the budget, the fallback
    // serves a subset and `next` must be ordinal-precise — a bare heading
    // cursor would rewind to the heading's first chunk and loop forever.
    const big = [
      mk(0, "sec", "a".repeat(100)),
      mk(1, "sec", "b".repeat(100)),
      mk(2, "sec", "c".repeat(100)),
    ];
    const seen: number[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const w = windowDocument(big, 120, cursor);
      seen.push(...w.chunks.map((c) => c.ordinal));
      if (w.nextHeading === null) break;
      expect(w.nextHeading, "a mid-heading split must emit an ordinal-precise cursor").toContain(
        "#",
      );
      cursor = w.nextHeading;
    }
    expect(
      seen,
      `every chunk reached exactly once, in order — got ${JSON.stringify(seen)}`,
    ).toEqual([0, 1, 2]);
  });

  it("an ordinal cursor resolves to the exact chunk, not the heading's first", () => {
    const w = windowDocument(lesson(), 10_000, "part-1#2");
    expect(w.chunks[0]?.ordinal).toBe(2);
  });

  it("the whole document fits in one window", () => {
    const w = windowDocument(lesson(), 10_000);
    expect(w.chunks.length).toBe(5);
    expect(w.nextHeading).toBeNull();
    expect(w.remainingSections).toEqual([]);
  });

  it("packs greedy whole sections and stays contiguous", () => {
    const w = windowDocument(lesson(), 300); // preamble(60) + part-1(200) fit; part-2 won't
    expect(w.chunks.map((c) => c.ordinal)).toEqual([0, 1, 2]);
    expect(w.windowTo).toBe("part-1/deep");
    expect(w.nextHeading).toBe("part-2");
    expect(w.remainingSections).toEqual(["part-2", "part-3"]);
    const nxt = windowDocument(lesson(), 300, w.nextHeading);
    expect(nxt.chunks.map((c) => c.ordinal)).toEqual([3, 4]); // concatenation covers ordinals 0..4 exactly
  });

  it("a first oversized section descends exactly one level", () => {
    const chunks = [
      mk(0, "big/sub-a", "x".repeat(400)),
      mk(1, "big/sub-b", "y".repeat(400)),
      mk(2, "after", "z".repeat(50)),
    ];
    const w = windowDocument(chunks, 500); // 'big' (800) exceeds; sub-a fits alone
    expect(w.chunks.map((c) => c.ordinal)).toEqual([0]);
    expect(w.nextHeading).toBe("big/sub-b");
  });

  it("the whole-chunk fallback always yields at least one chunk", () => {
    const chunks = [mk(0, "giant/sub", "x".repeat(9_000)), mk(1, "giant/sub", "y".repeat(9_000))];
    const w = windowDocument(chunks, 100);
    expect(w.chunks.map((c) => c.ordinal)).toEqual([0]); // one chunk even over budget — never empty
  });

  it("from_heading selects the subtree by prefix; an unknown heading fails loud", () => {
    const w = windowDocument(lesson(), 10_000, "part-1");
    expect(w.chunks.map((c) => c.ordinal)).toEqual([1, 2, 3, 4]);
    expect(() => windowDocument(lesson(), 100, "nope")).toThrowError(/matches no section/);
  });

  it("an out-of-range position cursor fails loud naming the cursor", () => {
    // The '#N' cursor is a position INDEX into the scoped chunk list (not an
    // ordinal — unique per source, review findings #4/#11); 99 is past the
    // end, so it throws naming the cursor.
    const err = (() => {
      try {
        windowDocument(lesson(), 100, "part-1#99");
        return "";
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    })();
    expect(err).toMatch(/outside this document's chunk range/);
    expect(err).toContain("part-1#99");
  });

  it("a repeated heading does not ping-pong: the index cursor resumes past it", () => {
    // chunks 0:"" 1:example 2:usage 3:example — a bare 'example' cursor would
    // rewind to index 1 forever (review finding #11); the index cursor lands
    // on the later occurrence.
    const doc: DocumentChunk[] = [
      mk(0, "", "p ".repeat(20)),
      mk(1, "example", "a".repeat(60)),
      mk(2, "usage", "b".repeat(60)),
      mk(3, "example", "c".repeat(60)),
    ];
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i += 1) {
      const w = windowDocument(doc, 80, cursor);
      seen.push(...w.chunks.map((c) => c.content));
      if (w.nextHeading === null) break;
      cursor = w.nextHeading;
    }
    expect(seen.join(""), "every chunk served exactly once, in order").toBe(
      doc.map((c) => c.content).join(""),
    );
  });

  it("a multi-source node windows every source's chunks, none orphaned", () => {
    // Two sources under one node share the ordinal space (0..n each); an
    // ordinal-based `after` filter orphaned the lower-ordinal chunks of the
    // second source (review finding #4). Position-based paging serves all.
    const doc: DocumentChunk[] = [
      mk(0, "a", "a0".repeat(30)),
      mk(1, "a", "a1".repeat(30)),
      mk(0, "b", "b0".repeat(30)),
      mk(1, "b", "b1".repeat(30)),
    ];
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i += 1) {
      const w = windowDocument(doc, 70, cursor);
      seen.push(...w.chunks.map((c) => c.content));
      if (w.nextHeading === null) break;
      cursor = w.nextHeading;
    }
    expect(seen.join(""), "b's low-ordinal chunks must not be orphaned").toBe(
      doc.map((c) => c.content).join(""),
    );
  });

  it("an empty document is refused", () => {
    expect(() => windowDocument([], 100)).toThrowError(/cannot window an empty document/);
  });
});

describe("code-point counting (Python len parity)", () => {
  it("counts astral characters as one", () => {
    expect(codePointLength("\u{1f3af}")).toBe(1);
    expect("\u{1f3af}".length, "UTF-16 sees two units — the trap").toBe(2);
    expect(codePointLength("abc")).toBe(3);
    expect(codePointLength("")).toBe(0);
  });

  it("estTokens is ceil(chars / 4)", () => {
    expect(estTokens(0)).toBe(0);
    expect(estTokens(1)).toBe(1);
    expect(estTokens(4)).toBe(1);
    expect(estTokens(5)).toBe(2);
    expect(estTokens(70000 * 4)).toBe(70000);
  });
});

/** Deterministic PRNG (mulberry32) — reproducible property cases. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a realistic document: heading paths appear as CONTIGUOUS runs
 * (the shape LESSON/DOCUMENT chunk queries emit — a heading never recurs
 * after a different one), optional leading preamble, mixed ASCII/astral
 * content so code-unit counting cannot pass by luck.
 */
function randomDocument(random: () => number): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let ordinal = 0;
  const content = (): string => {
    const n = Math.floor(random() * 120);
    const glyph = random() < 0.3 ? "\u{1f409}" : "x";
    return glyph.repeat(n);
  };
  if (random() < 0.4) chunks.push(mk(ordinal++, "", content()));
  const sections = 1 + Math.floor(random() * 5);
  for (let s = 0; s < sections; s += 1) {
    const subs = Math.floor(random() * 3); // 0 = chunks directly under the section
    if (subs === 0) {
      const n = 1 + Math.floor(random() * 3);
      for (let i = 0; i < n; i += 1) chunks.push(mk(ordinal++, `s${s}`, content()));
    } else {
      for (let sub = 0; sub < subs; sub += 1) {
        const n = 1 + Math.floor(random() * 3);
        for (let i = 0; i < n; i += 1) chunks.push(mk(ordinal++, `s${s}/sub-${sub}`, content()));
      }
    }
  }
  return chunks;
}

describe("property: pagination is a byte-exact partition", () => {
  it("random realistic documents concatenate byte-exact, in order, and terminate", () => {
    const random = rng(0x5eed);
    for (let round = 0; round < 150; round += 1) {
      const chunks = randomDocument(random);
      const budget = 1 + Math.floor(random() * 400);
      const { windows } = walk(chunks, budget);
      const served = windows.flatMap((w) => w.chunks.map((c) => c.ordinal));
      const context = `round=${round} budget=${budget} served=${JSON.stringify(served)}`;
      expect(served, context).toEqual(chunks.map((c) => c.ordinal));
      const concat = windows.flatMap((w) => w.chunks.map((c) => c.content)).join("");
      expect(concat === chunks.map((c) => c.content).join(""), context).toBe(true);
    }
  });
});
