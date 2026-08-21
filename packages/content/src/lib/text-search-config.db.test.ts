/**
 * The keyword arm stems in the record's language, not in English.
 *
 * `to_tsvector('english', content)` was hardcoded in a STORED generated column
 * and at four query sites, against the product's own claim that the owner
 * writes "in any language they write in". For a Spanish, Urdu or German corpus
 * the stemming is simply wrong — and on an uncalibrated record the keyword arm
 * is the ONLY arm that gates (audit finding 20).
 *
 * The configuration is declared in instance.md, RENDERED into the DDL the way
 * the embedding dimension is, and PARAMETERISED (`$n::regconfig`) on the query
 * side — never spliced, because it is a value from a config file reaching
 * DDL-shaped SQL.
 *
 * Because the column is STORED, changing it after a corpus exists restems
 * nothing: the stored vectors keep the old language while queries arrive in
 * the new one. That is a boot refusal, asserted here too.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool } from "../db.js";
import { applySchema, storedTextSearchConfig } from "../schema.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const EN = "ksor_ts_english";
const ES = "ksor_ts_spanish";

describe.runIf(adminDsn !== "")("the record's text-search configuration (db)", () => {
  let admin: pg.Pool;
  const pools: pg.Pool[] = [];

  const provision = async (db: string, config: string): Promise<pg.Pool> => {
    await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${db}`);
    const url = new URL(adminDsn);
    url.pathname = `/${db}`;
    const pool = contentPool(url.toString(), 4);
    pools.push(pool);
    await applySchema(pool, 1536, config);
    return pool;
  };

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
  }, 180_000);

  afterAll(async () => {
    for (const p of pools) await p.end().catch(() => undefined);
    for (const db of [EN, ES]) {
      await admin?.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => undefined);
    }
    await admin?.end().catch(() => undefined);
  });

  it("renders the declared configuration into the STORED column", async () => {
    const english = await provision(EN, "english");
    const spanish = await provision(ES, "spanish");
    expect(await storedTextSearchConfig(english)).toBe("english");
    expect(await storedTextSearchConfig(spanish)).toBe("spanish");
  }, 180_000);

  it("STEMS in that language — the difference English gets wrong", async () => {
    // "corriendo" (running) stems to "corr" under Spanish, and is left whole
    // under English. A Spanish record searched with English stemming misses
    // every inflected form its author actually wrote.
    const spanish = pools[1]!;
    const r = await spanish.query(
      "SELECT to_tsvector('spanish', $1) @@ websearch_to_tsquery('spanish', $2) AS es, " +
        "to_tsvector('english', $1) @@ websearch_to_tsquery('english', $2) AS en",
      ["El perro está corriendo por el parque", "corrió"],
    );
    const { es, en } = r.rows[0] as { es: boolean; en: boolean };
    expect(es, "Spanish stemming matches an inflected form").toBe(true);
    expect(en, "English stemming does not — this is the defect, not a nuance").toBe(false);
  }, 60_000);

  it("REFUSES a configuration name that is not a bare identifier", async () => {
    // The value is spliced into DDL, so it is validated at both ends.
    const { renderSchema } = await import("../schema.js");
    for (const bad of ["english'; DROP TABLE chunks; --", "English", "pg_catalog.english", ""]) {
      expect(() => renderSchema(1536, undefined, bad), bad).toThrow(
        /bare Postgres configuration name/,
      );
    }
  });

  it("the query side is PARAMETERISED, never spliced", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "search.ts"),
      "utf8",
    );
    expect(src, "a spliced config name is the one injectable place here").not.toMatch(
      /websearch_to_tsquery\('/,
    );
    expect(src).toMatch(/websearch_to_tsquery\(\$\d+::regconfig/);
  });
});

describe.runIf(adminDsn === "")("text-search configuration (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
