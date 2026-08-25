import { describe, expect, it, vi } from "vitest";

import {
  abstainPosture,
  authPosture,
  bootHeader,
  bootLine,
  SDK_RESPONSE_MODE_WARNING,
  UNDESCRIBED_RECORD,
  snapshotPosture,
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
      ["trust", "unverified"],
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

  it("aligns a label that exactly FILLS the field, like every shorter one", () => {
    // `padEnd` returns a label of exactly the field width unchanged, so the
    // over-long branch fired and added a space — starting the value one column
    // right of every shorter label. Inert while the longest live label was 8;
    // a surprise waiting for the first 9 (review finding 63).
    const short = bootLine("db", "value");
    const exact = bootLine("123456789", "value");
    expect(exact.indexOf("value"), `${exact}\n${short}`).toBe(short.indexOf("value"));
    // …and it must still not run INTO the value.
    expect(exact.indexOf("value")).toBeGreaterThan(2 + "123456789".length);
  });

  it("still separates a label longer than the column from its value", () => {
    // `padEnd` returns an over-long label unchanged, which printed
    // `trust floorunverified` — one unreadable word — and every alignment
    // assertion above stayed green, because none of them used a long label.
    expect(bootLine("trust floor", "unverified")).toBe("  trust floor unverified");
  });

  it("names the record in the header, so a multi-instance host is legible", () => {
    expect(bootHeader("my-ksor")).toContain("my-ksor");
  });
});

describe("authPosture", () => {
  it("shouts DISABLED and names the bind it is survivable on", () => {
    const out = authPosture("disabled", "127.0.0.1", false, ["public"]);
    expect(out).toContain("DISABLED");
    expect(out).toContain("127.0.0.1");
    // The mitigation must travel with the scary word, or an operator reading
    // "DISABLED" cannot tell whether the door is open to the internet.
    expect(out).toContain("refuse to boot");
  });

  it("says what verification actually happens in public mode", () => {
    expect(authPosture("public", "0.0.0.0", false, ["public"])).toContain("verified");
  });
  it("names the RESTRICTED tiers an unauthenticated public bind is handing out", () => {
    // Two green-looking lines, and never their product: `KSOR_AUTH=
    // disabled-public` printed the same sentence whatever KSOR_AUDIENCE said,
    // so a door serving the internal half to anonymous callers read exactly
    // like one serving only the public half (review finding 61).
    const out = authPosture("disabled", "0.0.0.0", true, ["public", "internal"]);
    expect(out).toContain("UNAUTHENTICATED");
    expect(out, "the tier by name, not a count").toContain("internal");
    expect(out).toContain("RESTRICTED");
    expect(out).toContain("anyone who can reach");
  });

  it("does not cry RESTRICTED over a door that only serves `public`", () => {
    // The overstatement in the other direction: the line said "the whole
    // record" whatever the viewer was, so the word meant nothing by the time
    // it was true.
    const out = authPosture("disabled", "0.0.0.0", true, ["public"]);
    expect(out).toContain("UNAUTHENTICATED");
    expect(out).not.toContain("RESTRICTED");
  });

  it("does NOT reassure when the escape hatch is serving the record to anyone", () => {
    // The one configuration that needs a loud line printed the reassurance
    // meant for a loopback dev run: "DISABLED — 0.0.0.0 only, and a public bind
    // will refuse to boot", which is false on both counts once
    // KSOR_AUTH=disabled-public permits exactly that bind.
    const out = authPosture("disabled", "0.0.0.0", true, ["public"]);
    expect(out, "must not claim a public bind would refuse").not.toContain("refuse to boot");
    expect(out).toContain("UNAUTHENTICATED");
    expect(out).toContain("KSOR_AUTH=disabled-public");
    expect(out, "says what it actually means for the record").toContain("anyone who can reach");
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

describe("snapshotPosture", () => {
  // Written because the door said NOTHING about this and a real deployment
  // found it by observing one read in three come back unpinned.
  it("warns on a public bind with an ephemeral key", () => {
    expect(snapshotPosture("ephemeral", false)).toContain("EPHEMERAL");
    expect(snapshotPosture("ephemeral", false)).toContain("KSOR_SNAPSHOT_KEYS");
  });

  it("says nothing once a shared key is configured", () => {
    expect(snapshotPosture("k1", false)).toBeNull();
  });

  // Not a scold: a loopback dev run is one process, which is the exact case the
  // ephemeral default was designed for.
  it("says nothing on loopback, where the default is honest", () => {
    expect(snapshotPosture("ephemeral", true)).toBeNull();
  });
});
