import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { renderSchema, renderSchemaText, schemaSqlPath, schemaVersion } from "./schema.js";

describe("schemaVersion parses the DDL's declared version (one source, no drift)", () => {
  it("returns a semver-ish version that the schema.sql INSERT actually declares", () => {
    const v = schemaVersion();
    expect(v, "schema version shape").toMatch(/^\d+\.\d+$/);
    // the parsed version is exactly what the applied DDL writes into schema_meta
    expect(readFileSync(schemaSqlPath(), "utf8")).toContain(`VALUES ('${v}', `);
  });
});

describe("renderSchema against the shipped DDL", () => {
  it("returns the shipped file byte-for-byte at the shipped dimension", () => {
    expect(renderSchema(1536)).toBe(readFileSync(schemaSqlPath(), "utf8"));
  });

  it("substitutes exactly the two embedding columns for another dimension", () => {
    const rendered = renderSchema(768);
    expect(rendered.match(/vector\(768\)/gi)?.length, rendered.slice(0, 200)).toBe(2);
    expect(/vector\(1536\)/i.test(rendered)).toBe(false);
  });

  it("refuses out-of-range dimensions, and scopes the ceiling to the shape we index", () => {
    expect(() => renderSchema(0)).toThrowError(/1\.\.2000/);
    expect(() => renderSchema(1.5)).toThrowError(/integer/);

    const message = (() => {
      try {
        renderSchema(2001);
        return "";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    })();
    expect(message).toMatch(/1\.\.2000/);
    // The refusal must say WHICH shape 2000 applies to. It used to read
    // "(pgvector vector + HNSW ceiling)", which reads as pgvector's own limit —
    // and pgvector indexes a `halfvec` to 4000 via an expression index on the
    // cast, verified live against a real database (2026-08-21, issue #49). An
    // adopter reading the old wording could conclude their model was
    // unusable over a wall that is not one.
    expect(message, `the ceiling must be scoped to the vector column: ${message}`).toMatch(
      /vector column/i,
    );
    expect(message, "and must not present 2000 as pgvector's own ceiling").not.toMatch(
      /pgvector vector \+ HNSW ceiling/,
    );
  });

  it("refuses a drifted template, naming the counts it saw", () => {
    const drifted = readFileSync(schemaSqlPath(), "utf8") + "\nembedding vector(1536)";
    expect(() => renderSchemaText(drifted, 768)).toThrowError(/expected the vector\(1536\)/);
  });
});
