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
 *
 * The clock here is FAKE. This tier's contract is "<3s total", and the first
 * version of this file waited a real eight seconds for the deadline to fire —
 * which held the claim, and cost every unit run more than the rest of the
 * tier put together. What the fake clock buys beyond speed is a sharper
 * assertion: the deadline fires at the budget, not merely "within two seconds
 * of it". The real-clock case against a real socket lives in
 * `probe-deadline.db.test.ts`, the tier whose shape is time and sockets.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROBE_DEADLINE_MS, ProbeDeadlineError, withProbeDeadline } from "./db.js";

describe("the readiness budget bounds the whole chain", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects work that outlives the budget, whatever that work is", async () => {
    // A promise that never settles: the shape of a connect against a
    // black-holed endpoint, which is precisely what this must not wait for.
    let outcome: "pending" | "rejected" | "resolved" = "pending";
    const bounded = withProbeDeadline(new Promise<never>(() => undefined)).then(
      () => {
        outcome = "resolved";
      },
      (error: unknown) => {
        outcome = "rejected";
        expect(error).toBeInstanceOf(ProbeDeadlineError);
        expect((error as Error).message).toContain(`${PROBE_DEADLINE_MS}ms`);
      },
    );

    // One millisecond short of the budget, nothing has happened: the deadline
    // is the budget, not something earlier that happens to be under it.
    await vi.advanceTimersByTimeAsync(PROBE_DEADLINE_MS - 1);
    expect(outcome, `${PROBE_DEADLINE_MS - 1}ms in`).toBe("pending");

    await vi.advanceTimersByTimeAsync(1);
    await bounded;
    expect(outcome, `${PROBE_DEADLINE_MS}ms in`).toBe("rejected");
  });

  it("passes a fast answer straight through, adding nothing", async () => {
    await expect(withProbeDeadline(Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("passes a fast REJECTION through as itself, not as a deadline", async () => {
    const boom = new Error("the database said no");
    await expect(withProbeDeadline(Promise.reject(boom))).rejects.toBe(boom);
  });

  it("clears its timer once the work settles, so a probe never holds the loop", async () => {
    await withProbeDeadline(Promise.resolve("ok"));
    expect(vi.getTimerCount(), "timers still pending after a settled probe").toBe(0);
  });

  it("the budget stays under the connect timeout it exists to pre-empt", () => {
    // 10_000ms is createPool's default connectionTimeoutMillis. A budget at or
    // above it can never bound anything.
    expect(PROBE_DEADLINE_MS).toBeLessThan(10_000);
  });
});
