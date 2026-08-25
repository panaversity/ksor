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

/**
 * The separator's invariant, ENFORCED rather than merely documented (review
 * 2026-08-25). `audienceGucs` joins the viewer list with U+001F and the SQL
 * splits on it, so an identifier containing that byte does not travel as one
 * identifier — it arrives as two, and the viewer silently holds an audience
 * nobody granted. `*` is the same class: it is the whole-record sentinel the
 * predicate compares against, so an identifier spelled `*` is a value that
 * means "everything" to the reader of the GUC.
 *
 * Enforced where the identifiers ENTER the encoding, not only at the door's
 * validateViewer, because a later caller that builds GUCs another way must not
 * be able to route around it.
 */
describe("an audience identifier may not carry the separator, or be the sentinel", () => {
  const SEP = "\u001f";
  it("audienceGucs REFUSES an identifier containing the separator", () => {
    try {
      audienceGucs(["public", `intern${SEP}board`]);
      expect.unreachable();
    } catch (e) {
      expect((e as AudienceError).slug).toBe("ksor-audience-identifier-invalid");
      expect((e as Error).message, "names the byte in a form a human can search for").toMatch(
        /U\+001F/,
      );
    }
  });
  it("audienceGucs REFUSES the whole-record sentinel as an identifier", () => {
    try {
      audienceGucs(["public", "*"]);
      expect.unreachable();
    } catch (e) {
      expect((e as AudienceError).slug).toBe("ksor-audience-identifier-invalid");
    }
  });
  it("validateViewer refuses the same values at BOOT, by THIS slug", () => {
    // Not `ksor-viewer-unregistered`, which these would also trip: the registry
    // is the wrong thing to blame, and registering the identifier would not
    // make it work. The encoding is what refuses.
    for (const bad of [`a${SEP}b`, "*"]) {
      try {
        validateViewer(["internal", bad], ["public", bad]);
        expect.unreachable();
      } catch (e) {
        expect((e as AudienceError).slug, `for ${JSON.stringify(bad)}`).toBe(
          "ksor-audience-identifier-invalid",
        );
      }
    }
  });
  it("leaves ordinary identifiers alone", () => {
    expect(audienceGucs(["public", "internal"])["app.viewer"]).toBe(`public${SEP}internal`);
  });
});
