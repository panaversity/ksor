/**
 * The visibility leak, closed — against a real database.
 *
 * A document marked `visibility: internal` was hidden from the website and
 * served in full to every agent: the site enforced the key at build time, and
 * ingest dropped it so the MCP door had nothing to filter on (review
 * 2026-08-20, reproduced live). Schema 2.2 carries the column; these tests pin
 * that every serving path reads it, and that a record declaring no audience
 * model behaves exactly as it did before.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runRead } from "../db.js";
import { applySchema } from "../schema.js";
import { audienceGucs, type AudienceModel } from "./audience.js";
import { findDocument, outline, UnknownSlug } from "./read.js";
import { keywordSearch } from "./search.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_audience_test";
const TENANT = "audience-corp";

const MODEL: AudienceModel = {
  audiences: ["public", "internal", "restricted"],
  defaultVisibility: "public",
};
const NO_MODEL: AudienceModel = { audiences: [], defaultVisibility: null };

const scope = { tenantId: TENANT, corpusId: TENANT, kinds: null, pinnedGeneration: null };

// The schema requires an embedded chunk to carry a vector; these tests exercise
// the AUDIENCE predicate, not similarity, so one constant vector is enough.
const VECTOR = `[${Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)).join(",")}]`;

describe.runIf(adminDsn !== "")("audience filtering (db)", () => {
  let pool: pg.Pool;
  /** The test database's DSN, for a second pool the leak check needs. */
  let dsn: string;
  let admin: pg.Pool;

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    dsn = url.toString();
    pool = contentPool(dsn, 4);
    await applySchema(pool, 1536);

    await pool.query(
      "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 1)",
      [TENANT],
    );
    await pool.query(
      "INSERT INTO ingestion_runs (tenant_id, corpus_id, generation, state, source_commit," +
        " instance_bundle_sha256, finished_at) VALUES ($1, $1, 1, 'active', 'test', 'x', now())",
      [TENANT],
    );

    // One document per tier, plus one that declares nothing (takes the default).
    const docs: [string, string | null][] = [
      ["open-notice", "public"],
      ["staff-handbook", "internal"],
      ["board-minutes", "restricted"],
      ["undeclared", null],
    ];
    for (const [slug, visibility] of docs) {
      const node = await pool.query(
        "INSERT INTO content_nodes (tenant_id, generation, stable_id, kind, slug, title," +
          " corpus_id, visibility) VALUES ($1, 1, $2, 'document', $3, $4, $1, $5)" +
          " RETURNING node_id",
        [TENANT, `knowledge/${slug}`, slug, slug, visibility],
      );
      const nodeId = String(node.rows[0].node_id);
      await pool.query(
        "INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path," +
          " content_hash, embedding_model, chunk_policy)" +
          " VALUES ($1, 1, $2, $3, $4, $5, 'h', 'fake-embed-001', 'p')",
        [TENANT, slug, nodeId, slug, `${slug}.md`],
      );
      await pool.query(
        "INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content, chunk_hash," +
          " embedding, embedding_status, embedding_model, labels)" +
          " VALUES ($1, 1, $2, 0, $3, $4, $5::vector, 'embedded', 'fake-embed-001'," +
          ' \'{"source_type":"prose"}\'::jsonb)',
        [TENANT, slug, `The ${slug} document mentions widgets.`, `hash-${slug}`, VECTOR],
      );
    }
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    if (process.env["KSOR_KEEP_DB"] !== "1")
      await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  const searchAs = (viewer: string | null, model: AudienceModel = MODEL): Promise<string[]> =>
    runRead(
      pool,
      TENANT,
      async (c) => (await keywordSearch(c, scope, "widgets", 20)).map((h) => h.slug),
      audienceGucs(model, viewer),
    ).then((s) => s.sort());

  const outlineAs = (viewer: string | null, model: AudienceModel = MODEL): Promise<string[]> =>
    runRead(
      pool,
      TENANT,
      async (c) =>
        (await outline(c, scope, { root: null, depth: 5, limit: 200 })).map((r) => r.slug),
      audienceGucs(model, viewer),
    ).then((s) => s.sort());

  const readAs = (
    viewer: string | null,
    slug: string,
    model: AudienceModel = MODEL,
  ): Promise<string | null> =>
    runRead(
      pool,
      TENANT,
      async (c) => {
        try {
          return (await findDocument(c, scope, slug)).slug;
        } catch (error) {
          if (error instanceof UnknownSlug) return null;
          throw error;
        }
      },
      audienceGucs(model, viewer),
    );

  it("search: the public tier sees only public + undeclared, never internal or restricted", async () => {
    expect(await searchAs("public")).toEqual(["open-notice", "undeclared"]);
  });

  it("search: an unnamed viewer gets the least-privileged tier, not everything", async () => {
    // This is the exact leak: before the fix an agent with no identity received
    // every document in the record.
    expect(await searchAs(null)).toEqual(["open-notice", "undeclared"]);
  });

  it("search: each tier sees its own and everything less restricted", async () => {
    expect(await searchAs("internal")).toEqual(["open-notice", "staff-handbook", "undeclared"]);
    expect(await searchAs("restricted")).toEqual([
      "board-minutes",
      "open-notice",
      "staff-handbook",
      "undeclared",
    ]);
  });

  it("outline: a restricted document is not even listed to a lower tier", async () => {
    expect(await outlineAs("public")).toEqual(["open-notice", "undeclared"]);
    expect(await outlineAs("internal")).toContain("staff-handbook");
    expect(await outlineAs("internal")).not.toContain("board-minutes");
  });

  it("read: resolving a restricted slug from a lower tier is a not-found, not a partial serve", async () => {
    expect(await readAs("public", "staff-handbook")).toBeNull();
    expect(await readAs("public", "board-minutes")).toBeNull();
    expect(await readAs("internal", "staff-handbook")).toBe("staff-handbook");
  });

  it("a record with NO audience model is unfiltered — the level-0 shape is unchanged", async () => {
    expect(await searchAs(null, NO_MODEL)).toEqual([
      "board-minutes",
      "open-notice",
      "staff-handbook",
      "undeclared",
    ]);
    expect(await readAs(null, "board-minutes", NO_MODEL)).toBe("board-minutes");
  });

  it("an undeclared document follows default_visibility, and fails CLOSED when there is none", async () => {
    const noDefault: AudienceModel = { audiences: ["public", "internal"], defaultVisibility: null };
    expect(await searchAs("public", noDefault)).toEqual(["open-notice"]);
    expect(await readAs("public", "undeclared", noDefault)).toBeNull();
  });

  it("a document declaring a tier the record does not know is never served", async () => {
    await pool.query(
      "UPDATE content_nodes SET visibility = 'board-only' WHERE tenant_id = $1 AND slug = $2",
      [TENANT, "undeclared"],
    );
    try {
      expect(await searchAs("restricted")).not.toContain("undeclared");
    } finally {
      await pool.query(
        "UPDATE content_nodes SET visibility = NULL WHERE tenant_id = $1 AND slug = $2",
        [TENANT, "undeclared"],
      );
    }
  });

  it("the audience GUCs are transaction-scoped — they never leak to the next borrower", async () => {
    // Read the GUC on the RAW connection, not through `runRead`.
    //
    // The first version of this test bound "restricted" in one `runRead` and
    // then asserted a second `runRead` saw the whole record — but `runRead`
    // binds WHOLE_RECORD_SCOPE by DEFAULT, so it overwrote whatever the first
    // transaction left behind. The assertion was satisfied by the default
    // binding, not by transaction scoping: changing `scopedTxn` to bind
    // `app.audience_tiers` with `set_config(..., false)` — session scope,
    // surviving the COMMIT and leaking to the next borrower of that pooled
    // connection — left all nine tests in this file green (round-8 review of
    // #43).
    //
    // maxSize 1 so "the next borrower" is guaranteed to be the SAME physical
    // connection; with more, a leak could hide on a socket nobody checks.
    const single = contentPool(dsn, 1);
    try {
      await runRead(single, TENANT, async () => undefined, audienceGucs(MODEL, "restricted"));
      const client = await single.connect();
      try {
        const leaked = await client.query(
          "SELECT current_setting('app.audience_tiers', true) AS tiers, " +
            "current_setting('app.default_visibility', true) AS fallback",
        );
        const { tiers, fallback } = leaked.rows[0] as {
          tiers: string | null;
          fallback: string | null;
        };
        expect(
          tiers ?? "",
          `app.audience_tiers survived the COMMIT as ${JSON.stringify(tiers)} — the next ` +
            "caller on this connection would inherit someone else's tier",
        ).toBe("");
        expect(fallback ?? "", "…and so would the default it resolves against").toBe("");
      } finally {
        client.release();
      }
    } finally {
      await single.end().catch(() => undefined);
    }
  });
});

describe.runIf(adminDsn === "")("audience filtering (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
