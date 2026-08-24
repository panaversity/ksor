import { describe, expect, it } from "vitest";

import {
  AUDIENCE_ALLOWED,
  AudienceError,
  audienceAllowed,
  audienceGucs,
  parseViewer,
  validateViewer,
  WHOLE_RECORD_SCOPE,
} from "./audience.js";

describe("parseViewer — KSOR_AUDIENCE as a comma list", () => {
  it("unset or empty is [public]", () => {
    expect(parseViewer(undefined)).toEqual(["public"]);
    expect(parseViewer("")).toEqual(["public"]);
    expect(parseViewer("  ")).toEqual(["public"]);
  });
  it("trims, splits on commas and drops duplicates", () => {
    expect(parseViewer(" public , internal,internal\n")).toEqual(["public", "internal"]);
  });
});

describe("validateViewer — refused at boot, never narrowed silently", () => {
  const registry = ["board", "internal"];
  it("accepts a list of registered identifiers that includes public", () => {
    expect(validateViewer(registry, ["public", "internal"])).toEqual(["public", "internal"]);
    expect(validateViewer([], ["public"])).toEqual(["public"]);
  });
  it("REFUSES a list that omits public, by slug", () => {
    expect(() => validateViewer(registry, ["internal"])).toThrow(AudienceError);
    try {
      validateViewer(registry, ["internal"]);
    } catch (e) {
      expect((e as AudienceError).slug).toBe("ksor-viewer-omits-public");
      expect((e as Error).message).toMatch(/fix:/);
    }
  });
  it("REFUSES an identifier the registry does not declare, naming it and the registry", () => {
    try {
      validateViewer(registry, ["public", "finance"]);
      expect.unreachable();
    } catch (e) {
      expect((e as AudienceError).slug).toBe("ksor-viewer-unregistered");
      expect((e as Error).message).toMatch(/`finance`/);
      expect((e as Error).message).toMatch(/board, internal/);
    }
  });
});

describe("the predicate and its GUC", () => {
  it("binds the viewer list unit-separated, and the predicate reads only that GUC", () => {
    expect(audienceGucs(["public", "internal"])).toEqual({
      "app.viewer": "publicinternal",
    });
    expect(AUDIENCE_ALLOWED).toContain("app.viewer");
    expect(AUDIENCE_ALLOWED).not.toMatch(/\$\d/);
  });
  it("is an overlap on the audience list, parameterised by alias (ONE definition)", () => {
    expect(audienceAllowed("now")).toContain("now.audience &&");
    expect(audienceAllowed("n")).toBe(AUDIENCE_ALLOWED);
  });
  it("the whole-record scope is a stated VALUE, not an unbound GUC", () => {
    expect(WHOLE_RECORD_SCOPE).toEqual({ "app.viewer": "*" });
  });
});
