/**
 * How an actor identifier reaches the page.
 *
 * The rule that matters is the REFUSAL to guess. A display name is the one
 * thing in a governance line that no algorithm can derive — `bashiraziz` splits
 * as "Bashir Aziz" or "Bashira Ziz" and nothing in the string says which — so
 * an actor the record has not named must render exactly as stored. A page that
 * guessed would print one person's name on another's approval.
 *
 * The phone book is injected rather than read from disk, so this exercises the
 * SHIPPED function rather than a copy of it — a duplicated rule tests the
 * duplicate (decision 18).
 */

import { describe, expect, it } from "vitest";

import { displayActor } from "../templates/scaffold/system/site/lib/actor-display.js";

const book = new Map([
  ["human:bashiraziz", "Bashir Aziz"],
  ["team:legal-ops", "Legal Operations"],
  ["human:ciso", "Ayesha Khan"],
]);

describe("an actor the record has named", () => {
  it("prints the name under its kind", () => {
    expect(displayActor("human:bashiraziz", book)).toBe("Human: Bashir Aziz");
    expect(displayActor("team:legal-ops", book)).toBe("Team: Legal Operations");
  });

  it("works for a handle no derivation could ever have produced", () => {
    // The point of a map. `ciso` is a role, not a squashed name, and the
    // list-plus-derivation shape this replaced could not express it at all —
    // nor `human:mjs`, `human:audit-lead`, or most handles in a real record.
    expect(displayActor("human:ciso", book)).toBe("Human: Ayesha Khan");
  });
});

describe("an actor the record has NOT named", () => {
  it("renders exactly as stored, and is never guessed at", () => {
    for (const actor of ["human:mjs", "human:audit-lead", "process:nightly", "team:ops"]) {
      expect(displayActor(actor, book), actor).toBe(actor);
    }
  });

  it("passes a producer through untouched — a tool is named plainly, not humanised", () => {
    expect(displayActor("ksor-starter/0.0.51", book)).toBe("ksor-starter/0.0.51");
  });

  it("does not answer for a bare handle: the key is the whole identifier", () => {
    // `human:ops` and `team:ops` are different actors. A phone book keyed on
    // `ops` would print one of them under the other's name.
    expect(displayActor("team:bashiraziz", book)).toBe("team:bashiraziz");
  });
});

describe("an unknown kind", () => {
  it("is titled rather than dropped, because the record may grow one", () => {
    expect(displayActor("service:indexer", new Map([["service:indexer", "Indexer"]]))).toBe(
      "Service: Indexer",
    );
  });
});
