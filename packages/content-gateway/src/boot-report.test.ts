import { describe, expect, it, vi } from "vitest";

import {
  abstainPosture,
  authPosture,
  bootHeader,
  bootLine,
  SDK_RESPONSE_MODE_WARNING,
  UNDESCRIBED_RECORD,
  withoutSdkResponseModeWarning,
} from "./boot-report.js";

describe("the boot report reads as one aligned block", () => {
  it("starts every value at the same column, whatever the label's length", () => {
    const cases: readonly [string, string][] = [
      ["db", "direct endpoint · TLS verified"],
      ["db pool", "prewarmed 2 connection(s)"],
      ["auth", "DISABLED"],
      ["abstain", "OFF"],
      ["serving", "http://127.0.0.1:8080/mcp"],
    ];
    const columns = new Set(cases.map(([label, value]) => bootLine(label, value).indexOf(value)));
    expect([...columns]).toHaveLength(1);
    for (const [label, value] of cases) {
      const line = bootLine(label, value);
      expect(line.startsWith(`  ${label}`), line).toBe(true);
      // The label must never run INTO the value — the longest label still
      // leaves a gap, or the block stops being scannable.
      expect(line.indexOf(value), line).toBeGreaterThan(2 + label.length);
    }
  });

  it("names the record in the header, so a multi-instance host is legible", () => {
    expect(bootHeader("my-ksor")).toContain("my-ksor");
  });
});

describe("authPosture", () => {
  it("shouts DISABLED and names the bind it is survivable on", () => {
    const out = authPosture("disabled", "127.0.0.1");
    expect(out).toContain("DISABLED");
    expect(out).toContain("127.0.0.1");
    // The mitigation must travel with the scary word, or an operator reading
    // "DISABLED" cannot tell whether the door is open to the internet.
    expect(out).toContain("refuse to boot");
  });

  it("says what verification actually happens in public mode", () => {
    expect(authPosture("public", "0.0.0.0")).toContain("verified");
  });
});

describe("abstainPosture — the line that decides whether answers can be trusted", () => {
  it("spells out the CONSEQUENCE of no floor, not just the state", () => {
    const out = abstainPosture(null);
    expect(out).toContain("OFF");
    // "OFF (no floor)" told the operator a status. What they need to know is
    // that an out-of-corpus question comes back answered and cited.
    expect(out).toMatch(/answered, not refused/);
  });

  it("distinguishes a declared-but-uncalibrated floor from an absent one", () => {
    expect(abstainPosture("uncalibrated")).toContain("REFUSING");
    expect(abstainPosture("uncalibrated")).not.toBe(abstainPosture(null));
  });

  it("states the number and what it means", () => {
    expect(abstainPosture(0.631)).toContain("0.631");
    expect(abstainPosture(0.631)).toContain("abstains");
  });
});

describe("withoutSdkResponseModeWarning — narrow, and only for the call", () => {
  it("swallows exactly the SDK's responseMode note", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      withoutSdkResponseModeWarning(() => console.warn(SDK_RESPONSE_MODE_WARNING));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("lets every OTHER warning through — including a reworded upstream one", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      withoutSdkResponseModeWarning(() => {
        console.warn("something else entirely");
        console.warn(`${SDK_RESPONSE_MODE_WARNING} and more`);
        console.warn(SDK_RESPONSE_MODE_WARNING, "with an extra argument");
      });
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      spy.mockRestore();
    }
  });

  it("restores console.warn even when the body throws", () => {
    const before = console.warn;
    expect(() =>
      withoutSdkResponseModeWarning(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(console.warn).toBe(before);
  });

  it("returns the body's value", () => {
    expect(withoutSdkResponseModeWarning(() => 42)).toBe(42);
  });
});

describe("UNDESCRIBED_RECORD", () => {
  it("states the runtime consequence, not just the omission", () => {
    // A level-0 record is ALLOWED to be undescribed. What the operator needs to
    // know is that the omission reaches every agent, not that a file is unedited.
    expect(UNDESCRIBED_RECORD).toContain("scope is unstated");
    expect(UNDESCRIBED_RECORD).toContain("intake interview");
    expect(UNDESCRIBED_RECORD).not.toMatch(/error|must|failed/i);
  });
});
