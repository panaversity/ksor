import type pg from "pg";
import { describe, expect, it } from "vitest";

import { splitHits, vectorLiteral, VECTOR_TXN_GUCS } from "./search.js";

const FIELD_NAMES = [
  "chunk_id",
  "source_id",
  "stable_id",
  "slug",
  "heading_path_text",
  "content",
  "score",
  "gen",
  "permalink",
  "top_vec_sim",
];

function fakeResult(rows: unknown[][], names: string[] = FIELD_NAMES): pg.QueryArrayResult {
  return {
    rows,
    fields: names.map((name) => ({ name })),
  } as unknown as pg.QueryArrayResult;
}

const row = (score: unknown, topSim: unknown): unknown[] => [
  "c1",
  "s1",
  "doc/a",
  "a",
  "Heading",
  "body",
  score,
  "3",
  null,
  topSim,
];

describe("splitHits — the projection drift guard", () => {
  it("coerces NUMERIC strings to numbers at the boundary (pg returns strings)", () => {
    const { hits, topCosine } = splitHits(fakeResult([row("0.0325", "0.71")]));
    expect(hits[0]?.score).toBe(0.0325);
    expect(hits[0]?.generation).toBe(3);
    expect(topCosine).toBe(0.71);
  });

  it("a NULL top_vec_sim is a legitimate abstain signal, not an error", () => {
    const { topCosine } = splitHits(fakeResult([row("0.01", null)]));
    expect(topCosine).toBeNull();
  });

  it("zero rows yields no signal", () => {
    const { hits, topCosine } = splitHits(fakeResult([]));
    expect(hits).toEqual([]);
    expect(topCosine).toBeNull();
  });

  it("a non-number top_vec_sim RAISES rather than degrading into a silent abstention", () => {
    expect(() => splitHits(fakeResult([row("0.01", "not-a-number")]))).toThrowError(TypeError);
  });

  it("refuses a drifted projection, naming what it saw", () => {
    expect(() => splitHits(fakeResult([], FIELD_NAMES.slice(0, 9)))).toThrowError(
      /projection drift/,
    );
    expect(() => splitHits(fakeResult([], [...FIELD_NAMES.slice(0, 9), "renamed"]))).toThrowError(
      /renamed/,
    );
  });
});

describe("vector plumbing", () => {
  it("serializes a pgvector literal", () => {
    expect(vectorLiteral([0.1, -0.2, 1])).toBe("[0.1,-0.2,1]");
  });

  it("pins the HNSW GUCs the read transaction must bind", () => {
    expect(VECTOR_TXN_GUCS).toEqual({
      "hnsw.iterative_scan": "relaxed_order",
      "hnsw.ef_search": "100",
    });
  });
});
