import { describe, expect, it } from "vitest";

import {
  CONTENT_ADVISORY,
  hitGovernance,
  instructionLike,
  latestAct,
  sectionVocabulary,
  stripAssetMarkup,
} from "./service.js";
import type { DocumentChunk } from "./lib/windowing.js";
import type { Hit } from "./lib/search.js";

describe("stripAssetMarkup", () => {
  it("replaces paired and self-closing svg with [diagram]", () => {
    expect(stripAssetMarkup('before <svg viewBox="0 0 4 4"><rect/></svg> after')).toBe(
      "before [diagram] after",
    );
    expect(stripAssetMarkup('icon <svg class="i"/> end')).toBe("icon [diagram] end");
  });

  it("a malformed leading svg cannot swallow prose up to a later close (tempered)", () => {
    const text = "<svg><p>real prose</p>\n\nmore prose <svg></svg>";
    const stripped = stripAssetMarkup(text);
    expect(stripped, stripped).toContain("real prose");
  });
});

describe("instructionLike", () => {
  it("fires on imperative directives, not on every code fence", () => {
    expect(instructionLike("Paste this prompt into your agent")).toBe(true);
    expect(instructionLike("run the following command in your shell")).toBe(true);
    expect(instructionLike("```js\nconst x = 1;\n```")).toBe(false);
    expect(CONTENT_ADVISORY).toContain("never execute");
  });
});

import {
  search,
  readDocument,
  outlineDocuments,
  EmptyQueryError,
  UncalibratedFloorError,
  type ServiceContext,
} from "./service.js";
import { GATE_PREDICATE_DIGEST } from "./lib/search.js";
import { keyRingFromEnv } from "./lib/snapshot.js";

describe("a declared-but-uncalibrated floor refuses to serve (fail closed, representable)", () => {
  const ctx = {
    pool: {} as never, // never reached — the refusal is before any DB call
    instance: {
      name: "c",
      corpusId: "c",
      tenantId: "c",
      dsnEnv: "X",
      abstain: { vectorFloor: "uncalibrated", keywordFloor: null },
      textSearchConfig: "english",
      maximumResponseCharacters: 120_000,
      instructions: "",
      embeddingProvider: "fake",
      embeddingModel: "fake-embed-001",
      embeddingDim: 8,
    },
    ring: keyRingFromEnv(undefined),
    instanceDigest: "d",
    embedQuery: async () => [0, 1],
  } as unknown as ServiceContext;

  it("search refuses before touching the database", async () => {
    await expect(search(ctx, "anything", 5)).rejects.toBeInstanceOf(UncalibratedFloorError);
  });

  it("read refuses too", async () => {
    await expect(readDocument(ctx, "any-slug")).rejects.toBeInstanceOf(UncalibratedFloorError);
  });

  it("outline refuses too — it is a serve (leaks the whole record shape otherwise)", async () => {
    await expect(outlineDocuments(ctx, {})).rejects.toBeInstanceOf(UncalibratedFloorError);
  });
});

import { EmptyQueryError as EmbedEmptyQueryError } from "./lib/query-embed.js";

describe("an empty query from the embed door re-raises as a client error, not a degrade", () => {
  const base = {
    pool: {} as never,
    instance: {
      name: "c",
      corpusId: "c",
      tenantId: "c",
      dsnEnv: "X",
      abstain: { vectorFloor: 0.6, keywordFloor: null, floorDigest: GATE_PREDICATE_DIGEST },
      maximumResponseCharacters: 120_000,
      instructions: "",
      embeddingProvider: "fake",
      embeddingModel: "fake-embed-001",
      embeddingDim: 8,
    },
    ring: keyRingFromEnv(undefined),
    instanceDigest: "d",
  } as unknown as ServiceContext;

  it("the embed door's own EmptyQueryError class is recognized (not embed_unavailable)", async () => {
    // The embed pipeline throws query-embed's EmptyQueryError — a DIFFERENT
    // class than service's — for a query that normalize() empties but trim()
    // did not. It must surface as EmptyQueryError, never be reclassified as a
    // provider outage (review, 2026-08-19).
    const ctx = {
      ...base,
      embedQuery: async () => {
        throw new EmbedEmptyQueryError("query is empty — nothing to embed");
      },
    } as unknown as ServiceContext;
    await expect(search(ctx, "\u200b", 5)).rejects.toBeInstanceOf(EmptyQueryError);
  });
});

describe("sectionVocabulary — the error names what read will actually accept", () => {
  const chunk = (headingPath: string): DocumentChunk =>
    ({ headingPath, content: "x", ordinal: 0 }) as unknown as DocumentChunk;

  it("lists FULL heading paths, not just their first segment", () => {
    // The old message listed `headingPath.split("/")[0]`, so a nested section
    // was reported as absent and then served on the next call.
    const out = sectionVocabulary([
      chunk("intro"),
      chunk("intro/errors"),
      chunk("intro/errors/taxonomy"),
    ]);
    expect(out).toContain("intro/errors/taxonomy");
    expect(out).toContain("intro/errors");
    expect(out).toContain("intro");
  });

  it("states the shorthand rather than enumerating it", () => {
    // Every last segment is also addressable when unique; listing them would
    // double the message to say nothing the reader cannot infer from one line.
    const out = sectionVocabulary([chunk("intro/errors")]);
    expect(out).toMatch(/last segment alone/);
    expect(out).not.toMatch(/\berrors,/);
  });

  it("counts the tail instead of printing an unbounded list", () => {
    const many = Array.from({ length: 25 }, (_, i) => chunk(`s${String(i).padStart(2, "0")}`));
    const out = sectionVocabulary(many);
    expect(out).toContain("and 5 more");
    expect(out.split(", ").length).toBeLessThan(25);
  });

  it("deduplicates and sorts, so the list is stable across calls", () => {
    const a = sectionVocabulary([chunk("b"), chunk("a"), chunk("b")]);
    const b = sectionVocabulary([chunk("a"), chunk("b")]);
    expect(a).toBe(b);
    expect(a.indexOf("a")).toBeLessThan(a.indexOf("b"));
  });

  it("says so plainly when a document has no sections at all", () => {
    expect(sectionVocabulary([chunk("")])).toMatch(/no sections/);
  });
});

describe("latestAct", () => {
  it("is the newest act, not the last authored one", () => {
    expect(
      latestAct([
        { by: "process:old", at: "2026-01-02T00:00:00Z" },
        { by: "process:newest", at: "2026-06-01T00:00:00Z" },
        { by: "process:middle", at: "2026-03-04T00:00:00Z" },
      ]),
    ).toEqual({ by: "process:newest", at: "2026-06-01T00:00:00Z" });
  });

  it("is null for no acts at all — a real state, not a missing one", () => {
    expect(latestAct(null)).toBeNull();
    expect(latestAct([])).toBeNull();
  });

  it("an unparseable instant sorts last rather than emptying the signal", () => {
    // One malformed date in one entry must not cost the document its whole
    // verification history.
    expect(
      latestAct([
        { by: "human:kim", at: "2026-06-01T00:00:00Z" },
        { by: "human:broken", at: "not an instant" },
      ]),
    ).toEqual({ by: "human:kim", at: "2026-06-01T00:00:00Z" });
  });
});

describe("hitGovernance", () => {
  const base: Hit = {
    chunkId: "c1",
    sourceId: "s1",
    stableId: "knowledge/policy",
    slug: "policy",
    headingPath: null,
    content: "text",
    score: 1,
    generation: 3,
    permalink: null,
    docStatus: "stable",
    trustTier: 2,
    verified: [{ by: "human:kim", at: "2026-08-22T09:00:00Z" }],
    approval: { by: "human:cfo", at: "2026-08-21T09:00:00Z" },
    effectiveFrom: "2026-08-21T00:00:00.000Z",
    staleAfter: null,
  };

  it("names the tier and says what the approval was checked against", () => {
    expect(hitGovernance(base)).toEqual({
      status: "stable",
      trust_tier: "human-reviewed",
      verified: { by: "human:kim", at: "2026-08-22T09:00:00Z" },
      effective_from: "2026-08-21T00:00:00.000Z",
      stale_after: null,
      // Never more than "policy" until change-control verification exists: an
      // inflated claim about what was checked is the failure this key prevents.
      approval: { by: "human:cfo", at: "2026-08-21T09:00:00Z", checked: "policy" },
    });
  });

  it("reads a NULL tier as unverified, the way the SQL predicate does", () => {
    // NULL is a pre-2.5 carried row, and such a generation is refused at boot;
    // what this prevents is a `null` on a wire whose schema says "a tier".
    const carried = hitGovernance({ ...base, trustTier: null, verified: null, approval: null });
    expect(carried.trust_tier).toBe("unverified");
    expect(carried.verified).toBeNull();
    expect(carried.approval).toBeNull();
  });
});
