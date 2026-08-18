import { describe, expect, it } from "vitest";

import { exitCodes, resolveCommand, verbs } from "./index.js";

describe("exitCodes", () => {
  it("keeps the documented contract: 1 refused, 2 not implemented, 3 environment", () => {
    // Scripts and agents branch on these numbers; changing one is a breaking
    // change to the CLI contract, not an implementation detail.
    expect(exitCodes).toEqual({
      refused: 1,
      notImplemented: 2,
      environment: 3,
    });
  });
});

describe("resolveCommand", () => {
  it("recognizes every designed verb", () => {
    for (const verb of verbs) {
      expect(resolveCommand([verb])).toEqual({ word: verb, verb });
    }
  });

  it("returns the raw word for unknown commands, so the CLI can refuse by name", () => {
    expect(resolveCommand(["frobnicate"])).toEqual({ word: "frobnicate", verb: null });
  });

  it("returns nulls for empty argv and flags-only argv", () => {
    expect(resolveCommand([])).toEqual({ word: null, verb: null });
    expect(resolveCommand(["--help"])).toEqual({ word: null, verb: null });
  });

  it("skips flags when looking for the command word", () => {
    expect(resolveCommand(["--verbose", "build"]).verb).toBe("build");
  });
});
