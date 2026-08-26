/**
 * What a refused boot writes to stderr.
 *
 * The exit codes are a contract, and so is the line above them: `1` refused,
 * with a stable machine-readable slug FIRST — `packages/ksor/docs/index.md`
 * states it, and `ksor build` has always kept it. `ksor serve` did not: it
 * printed whatever the exception's message happened to be, so the slug was
 * buried mid-line for one kind of error and absent for another. And the
 * instance reader's message carried its own reason twice, inline and again
 * under `why:` (first-hour walkthrough, 2026-08-26).
 */
import { describe, expect, it } from "vitest";

import { bootErrorLines } from "./main.js";
import { GatewayConfigError } from "./gateway-load.js";
import { BindError } from "./bind.js";

describe("bootErrorLines", () => {
  it("prints the slug alone on the first line when the error carries one beside its message", () => {
    const error = Object.assign(new Error("the record refused\n  fix: fix it"), {
      slug: "ksor-instance-format",
    });
    expect(bootErrorLines(error)).toBe(
      "error: ksor-instance-format\nthe record refused\n  fix: fix it",
    );
  });

  it("prints it ONCE when the thrower already put it at the head of the message", () => {
    // The gateway loader's convention. Both conventions exist here, and a
    // reader must never have to check whether the second line said something
    // new — it never does.
    const error = new GatewayConfigError("ksor-gateway-unloadable", "content.ts is not importable");
    const lines = bootErrorLines(error);
    expect(lines).toBe("error: ksor-gateway-unloadable\ncontent.ts is not importable");
    expect(lines.split("ksor-gateway-unloadable").length - 1, lines).toBe(1);
  });

  it("leaves an error with no slug exactly as it was", () => {
    expect(bootErrorLines(new Error("the store is unreachable"))).toBe(
      "error: the store is unreachable",
    );
  });

  it("a bind failure carries its remedy, and no slug to strip", () => {
    const error = new BindError("cannot bind 127.0.0.1:8080\n  fix: …", "EADDRINUSE");
    expect(bootErrorLines(error)).toBe("error: cannot bind 127.0.0.1:8080\n  fix: …");
  });

  it("a non-Error is still reported rather than swallowed", () => {
    expect(bootErrorLines("something threw a string")).toBe("error: something threw a string");
  });
});
