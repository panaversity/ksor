/**
 * Readiness has ONE budget, and everything readiness does shares it.
 *
 * `PROBE_DEADLINE_MS` began as an option passed to the retry loop, which only
 * consults a deadline BETWEEN attempts — so the first attempt was bounded by
 * the pool's 10s connect timeout instead, and /ready answered late while
 * claiming otherwise. Bounding the probe fixed that; then readiness gained a
 * SECOND step (the deferred schema check) that ran ahead of the probe with no
 * deadline of its own, and the same 10s reappeared. Measured live at 10.25s
 * against an unreachable endpoint, then 8.07s once the whole chain shared the
 * budget (2026-08-21).
 *
 * So the assertion is on the WRAPPER, not on any one step: whatever readiness
 * does, it answers inside the budget.
 */

import { describe, expect, it } from "vitest";

import { PROBE_DEADLINE_MS, ProbeDeadlineError, withProbeDeadline } from "./db.js";

describe("the readiness budget bounds the whole chain", () => {
  it("rejects work that outlives the budget, whatever that work is", async () => {
    const started = Date.now();
    // A promise that never settles: the shape of a connect against a
    // black-holed endpoint, which is precisely what this must not wait for.
    await expect(withProbeDeadline(new Promise(() => undefined))).rejects.toBeInstanceOf(
      ProbeDeadlineError,
    );
    const elapsed = Date.now() - started;
    expect(elapsed, `answered in ${elapsed}ms`).toBeLessThan(PROBE_DEADLINE_MS + 2_000);
  }, 30_000);

  it("passes a fast answer straight through, adding nothing", async () => {
    await expect(withProbeDeadline(Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("passes a fast REJECTION through as itself, not as a deadline", async () => {
    const boom = new Error("the database said no");
    await expect(withProbeDeadline(Promise.reject(boom))).rejects.toBe(boom);
  });

  it("the budget stays under the connect timeout it exists to pre-empt", () => {
    // 10_000ms is createPool's default connectionTimeoutMillis. A budget at or
    // above it can never bound anything.
    expect(PROBE_DEADLINE_MS).toBeLessThan(10_000);
  });
});
