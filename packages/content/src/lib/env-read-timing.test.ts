/**
 * The embed tuning knobs must take effect when set in `.env`, which the CLI
 * applies via `loadDotEnv()` inside `main()` — AFTER every static import has
 * evaluated. A module-scope `const = envFloat(…)` therefore froze the default
 * and silently ignored the adopter's value (kernel review finding A2). The
 * user-visible failure: an adopter sets `KSOR_EMBED_CACHE_MAX` to fit a small
 * runtime exactly as documented, the cap stays at the 250 MB default, and the
 * process OOMs in production with nothing pointing at why.
 *
 * These assert each knob is read at use. `env-read-timing.integration.test.ts`
 * guards the class — a fifth module-scope `env(Int|Float)` read fails there.
 */
import { afterEach, describe, expect, it } from "vitest";

import { EMBED_TIMEOUT_S, QUERY_EMBED_TIMEOUT_S } from "./embedding.js";
import type { EmbeddingProvider } from "./embedding.js";
import { _testing, EMBED_WALL_TIMEOUT_S, embedQueryVlit } from "./query-embed.js";

const KNOBS = [
  "KSOR_EMBED_TIMEOUT_S",
  "KSOR_QUERY_EMBED_TIMEOUT_S",
  "KSOR_EMBED_CACHE_MAX",
] as const;

afterEach(() => {
  for (const name of KNOBS) delete process.env[name];
  _testing.reset();
});

/** A dim-4 provider that counts transport calls; both retry predicates false. */
function countingProvider(): { provider: EmbeddingProvider; calls: () => number } {
  let calls = 0;
  const provider: EmbeddingProvider = {
    providerId: "stub",
    modelId: "stub-model",
    dim: 4,
    documentTaskLabel: "DOC",
    queryTaskLabel: "QRY",
    recipe: "stub-model/d4/DOC",
    embed(_texts, _opts) {
      calls += 1;
      return Promise.resolve([[3, 4, 0, 0]]);
    },
    isRetryable: () => false,
    isRetryableQuery: () => false,
    reset() {},
  };
  return { provider, calls: () => calls };
}

describe("embed tuning knobs are read at use, not frozen at import", () => {
  it("KSOR_EMBED_TIMEOUT_S set after import is honored", () => {
    expect(EMBED_TIMEOUT_S(), "the shipped default").toBe(60);
    process.env.KSOR_EMBED_TIMEOUT_S = "30";
    expect(EMBED_TIMEOUT_S(), "the value now set in the environment").toBe(30);
  });

  it("KSOR_QUERY_EMBED_TIMEOUT_S set after import is honored on both reads of it", () => {
    expect(QUERY_EMBED_TIMEOUT_S(), "embedding.ts default").toBe(10);
    expect(EMBED_WALL_TIMEOUT_S(), "query-embed.ts default for the same var").toBe(5);
    process.env.KSOR_QUERY_EMBED_TIMEOUT_S = "12";
    expect(QUERY_EMBED_TIMEOUT_S(), "the HTTP timeout read").toBe(12);
    expect(EMBED_WALL_TIMEOUT_S(), "the wall-clock read").toBe(12);
  });

  it("KSOR_EMBED_CACHE_MAX set after import caps the query cache", async () => {
    process.env.KSOR_EMBED_CACHE_MAX = "1";
    _testing.reset(); // clear the memo so the new value is read
    const { provider, calls } = countingProvider();
    await embedQueryVlit("q1", { provider }); // miss (1)
    await embedQueryVlit("q2", { provider }); // miss (2) — evicts q1 at cap 1
    await embedQueryVlit("q1", { provider }); // evicted → miss (3)
    expect(calls(), "provider calls: " + calls()).toBe(3);
  });

  it("without the env var the cache keeps its generous default", async () => {
    _testing.reset();
    const { provider, calls } = countingProvider();
    await embedQueryVlit("q1", { provider }); // miss (1)
    await embedQueryVlit("q2", { provider }); // miss (2)
    await embedQueryVlit("q1", { provider }); // still cached — default cap is 10k
    expect(calls(), "provider calls: " + calls()).toBe(2);
  });
});
