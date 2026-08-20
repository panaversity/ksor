/**
 * The drain policy without a provider (oracle tests/test_worker.py, carried):
 * resume-on-retryable, binary-split isolation of poison, plus the pure pieces
 * — the embed-input recipe, the split scheduling, the ≤500-code-point reason.
 */

import { describe, expect, it } from "vitest";

import {
  BATCH,
  binarySplit,
  drain,
  failureReason,
  rowsToInputs,
  type PendingRow,
} from "./worker.js";

const pendingOf = (n: number): PendingRow[] =>
  Array.from({ length: n }, (_, i): PendingRow => [`id-${i}`, `text ${i}`]);

describe("rowsToInputs", () => {
  it("uses the embed-input recipe (title > slug path, then the content)", () => {
    const rows: (readonly [string, string, string, string])[] = [
      ["c1", "body", "part-1/intro", "Course"],
    ];
    expect(rowsToInputs(rows)).toEqual([["c1", "Course > part 1 > intro\n\nbody"]]);
  });

  it("COALESCE'd empty heading path degrades to the bare title header", () => {
    expect(rowsToInputs([["c2", "body", "", "Course"]])).toEqual([["c2", "Course\n\nbody"]]);
  });
});

describe("binarySplit", () => {
  it("front half first, order preserved, mid = floor(n/2)", () => {
    const [front, back] = binarySplit([1, 2, 3, 4, 5]);
    expect(front).toEqual([1, 2]);
    expect(back).toEqual([3, 4, 5]);
  });

  it("a pair splits into singletons — the isolation terminus", () => {
    expect(binarySplit(["a", "b"])).toEqual([["a"], ["b"]]);
  });
});

describe("failureReason", () => {
  it("truncates to 500 CODE POINTS (Python str(exc)[:500] parity on astral text)", () => {
    const reason = failureReason(new Error("💥".repeat(600)));
    expect([...reason].length, `got ${[...reason].length} code points`).toBe(500);
    expect(reason.endsWith("💥"), "must not split a surrogate pair").toBe(true);
  });

  it("uses the message for Errors and String() for the rest", () => {
    expect(failureReason(new Error("boom"))).toBe("boom");
    expect(failureReason("raw")).toBe("raw");
  });
});

describe("drain", () => {
  it("isolates the poison chunk by binary split; every innocent chunk still embeds", async () => {
    const failedIds: string[] = [];
    const written: string[] = [];
    const result = await drain(pendingOf(64), {
      embedBatch: async (texts) => {
        if (texts.some((t) => t.includes("text 37"))) throw new Error("degenerate embedding");
        return texts.map(() => "[0.1]");
      },
      writeBatch: async (rows) => {
        written.push(...rows.map(([, chunkId]) => chunkId));
      },
      markFailed: async (_reason, chunkId) => {
        failedIds.push(chunkId);
      },
      isRetryable: () => false,
    });
    expect(result.failed, JSON.stringify(failedIds)).toBe(1);
    expect(failedIds).toEqual(["id-37"]);
    expect(result.embedded, "every innocent chunk in the poisoned batch still embeds").toBe(63);
    expect(written).not.toContain("id-37");
    expect(new Set(written).size).toBe(63);
  });

  it("a retryable error aborts the RUN loudly — nothing quarantined, nothing written", async () => {
    const never = async (): Promise<never> => {
      throw new Error("must not be called");
    };
    await expect(
      drain(pendingOf(8), {
        embedBatch: async () => {
          throw new Error("429");
        },
        writeBatch: never,
        markFailed: never,
        isRetryable: () => true,
      }),
    ).rejects.toThrow("429");
  });

  it("batches sequentially at BATCH=32 and commits per batch", async () => {
    expect(BATCH).toBe(32);
    const batchSizes: number[] = [];
    let inFlight = 0;
    const result = await drain(pendingOf(70), {
      embedBatch: async (texts) => {
        inFlight += 1;
        expect(inFlight, "one batch in flight at a time").toBe(1);
        batchSizes.push(texts.length);
        inFlight -= 1;
        return texts.map(() => "[0.1]");
      },
      writeBatch: async () => undefined,
      markFailed: async () => undefined,
      isRetryable: () => false,
    });
    expect(batchSizes).toEqual([32, 32, 6]);
    expect(result).toEqual({ embedded: 70, failed: 0 });
  });

  it("refuses a miscounting embed door (zip strict parity)", async () => {
    await expect(
      drain(pendingOf(2), {
        embedBatch: async () => ["[0.1]"], // one literal for two chunks
        writeBatch: async () => undefined,
        markFailed: async () => undefined,
        isRetryable: () => false,
      }),
    ).rejects.toThrow(/refusing to zip/);
  });

  it("the poison reason lands truncated on the single failing chunk", async () => {
    const reasons: string[] = [];
    const result = await drain(pendingOf(1), {
      embedBatch: async () => {
        throw new Error("x".repeat(600));
      },
      writeBatch: async () => undefined,
      markFailed: async (reason) => {
        reasons.push(reason);
      },
      isRetryable: () => false,
    });
    expect(result).toEqual({ embedded: 0, failed: 1 });
    expect(reasons[0]?.length, `got length ${reasons[0]?.length}`).toBe(500);
  });
});
