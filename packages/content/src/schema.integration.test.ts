import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  renderSchema,
  renderSchemaText,
  schemaCompatibleFrom,
  schemaSqlPath,
  schemaVersion,
} from "./schema.js";

describe("schemaVersion parses the DDL's declared version (one source, no drift)", () => {
  it("returns a semver-ish version that the schema.sql INSERT actually declares", () => {
    const v = schemaVersion();
    expect(v, "schema version shape").toMatch(/^\d+\.\d+$/);
    // the parsed version is exactly what the applied DDL writes into schema_meta
    expect(readFileSync(schemaSqlPath(), "utf8")).toContain(`VALUES ('${v}', `);
  });
});

describe("schemaCompatibleFrom parses the same row's second value", () => {
  it("reads what the DDL declares, so the printed remedy cannot go stale", () => {
    const declared = /INSERT INTO schema_meta[^;]*VALUES\s*\(\s*'([^']+)'\s*,\s*'([^']+)'/i.exec(
      readFileSync(schemaSqlPath(), "utf8"),
    );
    expect(declared, "schema.sql must declare both values on one row").not.toBeNull();
    expect(schemaVersion()).toBe(declared![1]);
    expect(
      schemaCompatibleFrom(),
      "the `schema_meta exists but records no version` remedy prints this; it was hardcoded to " +
        "'2.0' and silently became false when 2.5 dropped `visibility`, telling an operator to " +
        "record that a 2.0 reader can read a 2.5 database",
    ).toBe(declared![2]);
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

/**
 * Role creation must survive two applies at once — asserted on the DDL's SHAPE,
 * because the live race is unreachable wherever the roles already exist.
 *
 * Roles are CLUSTER-GLOBAL, so `IF NOT EXISTS ... THEN CREATE ROLE` is
 * check-then-act across every database on the instance. Measured on Postgres
 * 17.7 against an empty cluster: six concurrent applies, FIVE failed. Two
 * `ksor schema --apply` runs, or two `pnpm test:db` runs, are all it takes
 * (issue #166).
 *
 * `schema-concurrency.db.test.ts` races it for real, and SKIPS wherever the
 * roles cannot be dropped — which is most developer machines. So this is the
 * guard that always runs: it pins the two properties the fix depends on, and
 * both are easy to undo by tidying.
 */
describe("concurrent applies cannot lose a role", () => {
  const roleBlocks = (): string[] =>
    [...readFileSync(schemaSqlPath(), "utf8").matchAll(/DO \$\$[\s\S]*?END \$\$;/g)]
      .map((m) => m[0])
      .filter((block) => /CREATE ROLE/.test(block));

  it("creates each role in its OWN block", () => {
    // One block per role, because a `DO` block is a single statement: an
    // exception anywhere in it rolls the whole block back, so a loser on the
    // first role would never create the other two — and the GRANTs below would
    // then name roles that do not exist.
    const blocks = roleBlocks();
    for (const block of blocks) {
      const created = [...block.matchAll(/CREATE ROLE/g)].length;
      expect(created, `a block creates ${created} roles:\n${block}`).toBe(1);
    }
    expect(blocks.length, "one block per role the DDL grants against").toBe(3);
  });

  it("tolerates BOTH SQLSTATEs a lost race raises", () => {
    // `unique_violation` (23505) on pg_authid_rolname_index is what Postgres
    // 17.7 actually raised in the measured run — NOT `duplicate_object`
    // (42710), which is the intuitive one to catch and is not sufficient on its
    // own. Which surfaces depends on where the loser lands, so both are named.
    for (const block of roleBlocks()) {
      expect(block, `role block without an exception handler:\n${block}`).toMatch(/EXCEPTION/);
      expect(block, `role block does not tolerate unique_violation:\n${block}`).toMatch(
        /unique_violation/,
      );
      expect(block, `role block does not tolerate duplicate_object:\n${block}`).toMatch(
        /duplicate_object/,
      );
    }
  });
});
