/**
 * What a phone book file declares — the rule the SITE publishes names from.
 *
 * This exists because the rule shipped with its central guarantee asserted only
 * by a sentence in a comment: "duplicate keys are refused by the parser rather
 * than resolved by whichever came last". They are not. `uniqueKeys: true` makes
 * the parser RECORD a duplicate; `toJS()` still resolves last-wins, and nothing
 * read the errors. Two entries for one actor therefore published the second
 * person's name on the first person's approval — the precise failure the map
 * was introduced to prevent, restated as prose and never checked.
 *
 * The rule is a leaf so this test can reach the SHIPPED function rather than a
 * copy of it (decision 18): the loader beside it roots at `projectRoot`, whose
 * module reads `instance.md` on import.
 */

import { describe, expect, it } from "vitest";

import { parsePeople } from "../templates/scaffold/system/site/lib/people-rule.js";

describe("a well-formed phone book", () => {
  it("maps whole identifiers to names", () => {
    const book = parsePeople(
      'version: "0.1"\npeople:\n  "human:ciso": Ayesha Khan\n  "team:legal-ops": Legal Operations\n',
    );
    expect(book.get("human:ciso")).toBe("Ayesha Khan");
    expect(book.get("team:legal-ops")).toBe("Legal Operations");
  });

  it("drops an entry someone started and left blank, rather than erasing the identifier", () => {
    expect(parsePeople('people:\n  "human:ciso": ""\n').has("human:ciso")).toBe(false);
    expect(parsePeople('people:\n  "human:ciso": "   "\n').has("human:ciso")).toBe(false);
  });
});

describe("a duplicate key drops the whole book", () => {
  // Last-wins here is not a formatting preference: it prints one person's name
  // on another person's governance act, which is the collision the map replaced
  // a derivation to avoid.
  it("does not resolve to whichever came last", () => {
    const book = parsePeople(
      'people:\n  "human:you": First Person\n  "human:you": Second Person\n',
    );
    expect(book.get("human:you"), "last-wins is exactly the defect").toBeUndefined();
    expect(book.size, "an ambiguous book names nobody").toBe(0);
  });

  it("takes the unambiguous entries down with it, rather than publishing half a book", () => {
    // Deliberate: a file with a duplicate has been edited by two people or by a
    // careless merge, and the entries around it are no more trustworthy than
    // the one that collided. Identifiers are the honest fallback.
    const book = parsePeople(
      'people:\n  "human:a": A\n  "human:you": First\n  "human:you": Second\n',
    );
    expect(book.size).toBe(0);
  });
});

describe("a phone book that is not one", () => {
  it.each([
    ["empty text", ""],
    ["no people key", 'version: "0.1"\n'],
    ["a list, not a map", "people:\n  - human:you\n"],
    ["a scalar", "people: nobody\n"],
    ["broken yaml", "people:\n  - : :\n  ]["],
  ])("names nobody, and does not throw (%s)", (_what, text) => {
    expect(parsePeople(text).size).toBe(0);
  });

  it("ignores a non-string name rather than printing its shape", () => {
    expect(parsePeople('people:\n  "human:you": [a, b]\n').size).toBe(0);
  });
});
