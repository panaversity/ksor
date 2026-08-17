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
      expect(resolveCommand([verb])).toEqual({ verb, implemented: false });
    }
  });

  it("returns null for unknown words and empty argv", () => {
    expect(resolveCommand(["frobnicate"]).verb).toBeNull();
    expect(resolveCommand([]).verb).toBeNull();
  });

  it("skips flags when looking for the verb", () => {
    expect(resolveCommand(["--verbose", "build"]).verb).toBe("build");
    expect(resolveCommand(["--help"]).verb).toBeNull();
  });

  it("never reports a verb as implemented in this build", () => {
    expect(resolveCommand(["init"]).implemented).toBe(false);
  });
});
