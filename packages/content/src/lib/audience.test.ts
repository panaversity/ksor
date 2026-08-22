import { describe, expect, it } from "vitest";

import {
  AUDIENCE_ALLOWED,
  AudienceError,
  audienceAllowed,
  audienceGucs,
  visibleTiers,
} from "./audience.js";

const model = { audiences: ["public", "internal", "restricted"], defaultVisibility: "public" };
const noModel = { audiences: [], defaultVisibility: null };

describe("visibleTiers", () => {
  it("returns null when the record declares no audience model and none was asked for", () => {
    expect(visibleTiers(noModel, null)).toBeNull();
  });

  it("REFUSES a tier asked for against a record that declares no model", () => {
    // Ignoring it served the WHOLE record to a caller who had explicitly
    // narrowed themselves; the site refuses this configuration by name.
    expect(() => visibleTiers(noModel, "public")).toThrow(AudienceError);
    expect(() => visibleTiers(noModel, "public")).toThrow(/declares no/i);
  });

  it("defaults to the LEAST-privileged tier when no viewer is named", () => {
    expect(visibleTiers(model, null)).toEqual(["public"]);
  });

  it("gives a viewer their tier and everything less restricted", () => {
    expect(visibleTiers(model, "internal")).toEqual(["public", "internal"]);
    expect(visibleTiers(model, "restricted")).toEqual(["public", "internal", "restricted"]);
  });

  it("never lets a lower tier see a higher one", () => {
    expect(visibleTiers(model, "public")).not.toContain("internal");
    expect(visibleTiers(model, "internal")).not.toContain("restricted");
  });

  it("REFUSES an unknown viewer tier rather than widening silently", () => {
    expect(() => visibleTiers(model, "board")).toThrow(AudienceError);
    expect(() => visibleTiers(model, "board")).toThrow(/unknown audience/i);
  });
});

describe("audienceGucs + AUDIENCE_ALLOWED", () => {
  const SEP = "\u001f";

  it("binds the no-model SENTINEL, never nothing — an unbound scope must not read as unrestricted", () => {
    expect(audienceGucs(noModel, null)).toEqual({ "app.audience_tiers": "*" });
  });

  it("the predicate DENIES when the scope was never bound (fail closed)", () => {
    // The seam's whole job is to withhold; the previous shape evaluated TRUE
    // for an unbound GUC, so a path that forgot to bind served every tier.
    expect(AUDIENCE_ALLOWED).toContain("'*'");
  });

  it("is parameterised by alias, so the seam has exactly ONE definition", () => {
    // Hand-copying it for the outline's second alias produced a copy that
    // drifted and returned child_count 0 for every node.
    expect(audienceAllowed("ch")).toContain("ch.visibility");
    expect(audienceAllowed("n")).toBe(AUDIENCE_ALLOWED);
    // same shape, only the alias differs
    expect(audienceAllowed("ch").replace(/ch\./g, "n.")).toBe(AUDIENCE_ALLOWED);
  });

  it("binds the allowed tiers and the default, unit-separated", () => {
    expect(audienceGucs(model, "internal")).toEqual({
      "app.audience_tiers": ["public", "internal"].join(SEP),
      "app.default_visibility": "public",
    });
  });

  it("binds the least-privileged tier when no viewer is named", () => {
    expect(audienceGucs(model, null)["app.audience_tiers"]).toBe("public");
  });

  it("binds an empty default when the record names none — an undeclared doc fails closed", () => {
    const g = audienceGucs(
      { audiences: ["public", "internal"], defaultVisibility: null },
      "public",
    );
    expect(g["app.default_visibility"]).toBe("");
  });

  it("propagates the refusal for an unknown viewer", () => {
    expect(() => audienceGucs(model, "board")).toThrow(AudienceError);
  });

  it("the predicate reads only GUCs, so it needs no positional parameter", () => {
    expect(AUDIENCE_ALLOWED).not.toMatch(/\$\d/);
    expect(AUDIENCE_ALLOWED).toContain("app.audience_tiers");
    expect(AUDIENCE_ALLOWED).toContain("app.default_visibility");
  });
});
