import { describe, expect, it } from "vitest";

import { CONTENT_ADVISORY, instructionLike, stripAssetMarkup } from "./service.js";

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
  EmptyQueryError,
  UncalibratedFloorError,
  type ServiceContext,
} from "./service.js";
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
      abstain: { vectorFloor: 0.6, keywordFloor: null },
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
