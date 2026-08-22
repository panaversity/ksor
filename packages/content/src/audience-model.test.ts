/**
 * The kernel and the site must read `audiences:` the SAME way.
 *
 * They did not. The site accepts flow style (`audiences: [public, internal]`)
 * and the kernel stored it as a scalar, so the model came out EMPTY — and an
 * empty model filters nothing. The site hid a restricted document while the
 * MCP door served it in full: the exact failure decision 15 exists to end,
 * reintroduced through a parser mismatch (review of PR #43).
 *
 * The governing rule, taken from the site's own comment: a declared-but-
 * unreadable model must never read as "no model", because no model serves
 * everything to everyone.
 */

import { describe, expect, it } from "vitest";

import { InstanceParseError, parseInstanceText } from "./instance.js";

const doc = (frontmatter: string): string =>
  `---\nformat: 1\nname: acme\ndatabase:\n  dsn_env: KSOR_DB_URL\n${frontmatter}\n---\n\nThe record.\n`;

describe("the audience model the kernel reads", () => {
  it("reads BLOCK style", () => {
    const i = parseInstanceText(
      doc("audiences:\n  - public\n  - internal\ndefault_visibility: public"),
    );
    expect(i.audiences).toEqual(["public", "internal"]);
    expect(i.defaultVisibility).toBe("public");
  });

  it("reads FLOW style — the shape the site accepted and the kernel dropped", () => {
    const i = parseInstanceText(doc("audiences: [public, internal]\ndefault_visibility: public"));
    expect(i.audiences).toEqual(["public", "internal"]);
    expect(i.defaultVisibility).toBe("public");
  });

  it("reads flow style with quotes and spacing", () => {
    const i = parseInstanceText(
      doc(`audiences: [ "public" , 'internal' ]\ndefault_visibility: public`),
    );
    expect(i.audiences).toEqual(["public", "internal"]);
  });

  it("is EMPTY only when the record declares no model at all", () => {
    const i = parseInstanceText(doc("site:\n  title: Acme"));
    expect(i.audiences).toEqual([]);
    expect(i.defaultVisibility).toBeNull();
  });

  it("REFUSES a declared model it cannot read, rather than reading it as none", () => {
    // The one parse failure that leaks: an empty model filters nothing.
    expect(() => parseInstanceText(doc("audiences: \ndefault_visibility: public"))).toThrow(
      /no audience could be read/i,
    );
    expect(() => parseInstanceText(doc("audiences: []\ndefault_visibility: public"))).toThrow(
      InstanceParseError,
    );
  });

  it("REFUSES a model that does not start with public", () => {
    // An unidentified caller gets the FIRST tier. Most-restricted-first makes
    // that either a blackout or a leak, depending on which way it is read.
    expect(() =>
      parseInstanceText(doc("audiences:\n  - internal\n  - public\ndefault_visibility: public")),
    ).toThrow(/must start with public/i);
    expect(() =>
      parseInstanceText(doc("audiences: [internal, public]\ndefault_visibility: public")),
    ).toThrow(/must start with public/i);
  });

  it("REFUSES a duplicated tier", () => {
    expect(() =>
      parseInstanceText(
        doc("audiences:\n  - public\n  - internal\n  - public\ndefault_visibility: public"),
      ),
    ).toThrow(/twice/i);
  });

  it("REFUSES audiences without default_visibility", () => {
    // Binding an empty default matches no tier, so every document that
    // declares no visibility: is served to nobody — a silent blackout.
    expect(() => parseInstanceText(doc("audiences:\n  - public\n  - internal"))).toThrow(
      /without `default_visibility:`/i,
    );
  });

  it("REFUSES a default_visibility outside the declared model", () => {
    expect(() =>
      parseInstanceText(doc("audiences:\n  - public\n  - internal\ndefault_visibility: board")),
    ).toThrow(/not one of the declared audiences/i);
  });

  it("every refusal names the fix, not just the fault", () => {
    for (const bad of [
      "audiences: \ndefault_visibility: public",
      "audiences:\n  - internal\n  - public\ndefault_visibility: public",
      "audiences:\n  - public\n  - internal",
    ]) {
      try {
        parseInstanceText(doc(bad));
        throw new Error(`expected a refusal for: ${bad}`);
      } catch (error) {
        expect(error).toBeInstanceOf(InstanceParseError);
        expect(String((error as Error).message).length, bad).toBeGreaterThan(20);
      }
    }
  });
});
