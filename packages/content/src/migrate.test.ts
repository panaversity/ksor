import { describe, expect, it } from "vitest";

import {
  compatibleFromOf,
  migrationFilename,
  parseMigrationName,
  planMigrations,
} from "./migrate.js";

// A migration names BOTH ends of the step it performs — `<from>-<to>__<slug>.sql`.
// Encoding only the target would make "2.2 never existed" and "the 2.2 migration
// is missing" indistinguishable, and the second silently skips a schema change.

describe("migration filenames", () => {
  it("parses <from>-<to>__<slug>.sql into both ends of the step", () => {
    expect(parseMigrationName("2.1-2.2__governance-on-the-node-row.sql")).toEqual({
      from: "2.1",
      to: "2.2",
      slug: "governance-on-the-node-row",
    });
  });

  it("refuses a name that does not carry both versions and a slug", () => {
    for (const bad of [
      "governance.sql",
      "2.2__governance.sql",
      "2.1-2.2-governance.sql",
      "__slug.sql",
      "2.1-2.2__.sql",
      "2.1-2.2__slug.txt",
    ]) {
      expect(() => parseMigrationName(bad), `expected ${bad} to be refused`).toThrow(/migration/i);
    }
  });

  it("refuses a step that does not move forward", () => {
    expect(() => parseMigrationName("2.2-2.2__noop.sql")).toThrow(/forward/i);
    expect(() => parseMigrationName("2.3-2.2__backward.sql")).toThrow(/forward/i);
  });

  it("round-trips through migrationFilename", () => {
    const name = migrationFilename("2.2", "2.3", "add-owner");
    expect(parseMigrationName(name)).toEqual({ from: "2.2", to: "2.3", slug: "add-owner" });
  });
});

describe("planMigrations", () => {
  const chain = ["2.2-2.3__c.sql", "2.1-2.2__b.sql", "2.3-10.0__later.sql"];

  it("walks the chain from the database's version up to the one this build requires", () => {
    expect(planMigrations("2.1", chain, "10.0").map((m) => m.to)).toEqual(["2.2", "2.3", "10.0"]);
  });

  it("stops at the required version — never applies a future migration", () => {
    expect(planMigrations("2.1", chain, "2.2").map((m) => m.to)).toEqual(["2.2"]);
  });

  it("is empty when the database is already at the required version", () => {
    expect(planMigrations("2.2", chain, "2.2")).toEqual([]);
  });

  it("is empty when the database is AHEAD of this build (a newer writer ran)", () => {
    expect(planMigrations("10.0", chain, "2.2")).toEqual([]);
  });

  it("orders by the chain, not lexicographically — 10.0 follows 2.3", () => {
    expect(planMigrations("2.2", chain, "10.0").map((m) => m.to)).toEqual(["2.3", "10.0"]);
  });

  it("refuses two migrations starting from the same version", () => {
    expect(() => planMigrations("2.1", ["2.1-2.2__a.sql", "2.1-2.3__b.sql"], "2.3")).toThrow(
      /duplicate migration/i,
    );
  });

  it("refuses when a step in the chain is MISSING rather than silently skipping it", () => {
    // Database at 2.1, build needs 2.3, but only the 2.2→2.3 step exists:
    // applying it would skip everything 2.1→2.2 did.
    expect(() => planMigrations("2.1", ["2.2-2.3__c.sql"], "2.3")).toThrow(/no migration from/i);
  });

  it("refuses a chain that overshoots the required version", () => {
    // 2.1→10.0 exists but this build only knows 2.2: applying it would put the
    // database ahead of the code that must read it.
    expect(() => planMigrations("2.1", ["2.1-10.0__jump.sql"], "2.2")).toThrow(/overshoot/i);
  });
});

describe("compatibleFromOf", () => {
  it("reads the floor a breaking step declares, and nothing from an additive one", () => {
    expect(compatibleFromOf("-- 2.4 -> 2.5\n--\n-- compatible_from: 2.5\nALTER TABLE x;")).toBe(
      "2.5",
    );
    expect(compatibleFromOf("ALTER TABLE x ADD COLUMN y TEXT;")).toBeNull();
  });
});
