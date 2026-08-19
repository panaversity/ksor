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

  it("refuses out-of-range dimensions with the ceiling in the message", () => {
    expect(() => renderSchema(0)).toThrowError(/1\.\.2000/);
    expect(() => renderSchema(2001)).toThrowError(/HNSW ceiling/);
    expect(() => renderSchema(1.5)).toThrowError(/integer/);
  });

  it("refuses a drifted template, naming the counts it saw", () => {
    const drifted = readFileSync(schemaSqlPath(), "utf8") + "\nembedding vector(1536)";
    expect(() => renderSchemaText(drifted, 768)).toThrowError(/expected the vector\(1536\)/);
  });
});
