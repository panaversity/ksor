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
  "doc_status",
  "trust_tier",
  "verified",
  "approval",
  "effective_from",
  "stale_after",
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
  "stable",
  2,
  [{ by: "human:kim", at: "2026-08-22T09:00:00Z" }],
  { by: "human:cfo", at: "2026-08-21T09:00:00Z" },
  new Date("2026-08-21T00:00:00Z"),
  null,
  topSim,
];

describe("splitHits — the projection drift guard", () => {
  it("coerces NUMERIC strings to numbers at the boundary (pg returns strings)", () => {
    const { hits, topCosine } = splitHits(fakeResult([row("0.0325", "0.71")]));
    expect(hits[0]?.score).toBe(0.0325);
    expect(hits[0]?.generation).toBe(3);
    expect(topCosine).toBe(0.71);
    // A TIMESTAMPTZ arrives as a Date; `String(date)` would put a
    // local-timezone human string on an MCP response.
    expect(hits[0]?.effectiveFrom).toBe("2026-08-21T00:00:00.000Z");
    expect(hits[0]?.trustTier).toBe(2);
    expect(hits[0]?.approval).toEqual({ by: "human:cfo", at: "2026-08-21T09:00:00Z" });
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
    expect(() => splitHits(fakeResult([], FIELD_NAMES.slice(0, -1)))).toThrowError(
      /projection drift/,
    );
    expect(() => splitHits(fakeResult([], [...FIELD_NAMES.slice(0, -1), "renamed"]))).toThrowError(
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

describe("a governance column that arrives as something else", () => {
  it("drops the act rather than half-building one", () => {
    // A row holding a string where an act belongs is a state no ingest
    // produces — and a partially-built `{by: "undefined"}` on the wire would
    // be a governance claim the record never made.
    const bad = [...row("0.1", "0.5")];
    bad[12] = "not an object";
    bad[11] = "not an array";
    const { hits } = splitHits(fakeResult([bad]));
    expect(hits[0]?.approval).toBeNull();
    expect(hits[0]?.verified).toBeNull();
  });
});
