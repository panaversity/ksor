/**
 * The visibility leak, closed — against a real database, on the overlap model.
 *
 * A document marked `visibility: internal` was hidden from the website and
 * served in full to every agent: the site enforced the key at build time, and
 * ingest dropped it so the MCP door had nothing to filter on (review
 * 2026-08-20, reproduced live). Schema 2.5 carries `audience TEXT[]` (record
 * spec §2.4); these tests pin that every serving path reads it through ONE
 * predicate, and that a viewer holding a list sees exactly the overlap.
 */

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runRead } from "../db.js";
import { applySchema } from "../schema.js";
import { audienceGucs, WHOLE_RECORD_SCOPE } from "./audience.js";
import { findDocument, outline, UnknownSlug } from "./read.js";
import { keywordSearch } from "./search.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = `ksor_audience_test_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
const TENANT = "audience-corp";

/** A viewer is a LIST; the ranked model's tiers become the lists a viewer of that tier holds. */
const PUBLIC = ["public"];
const INTERNAL = ["public", "internal"];
const RESTRICTED = ["public", "internal", "restricted"];

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

    // One document per audience, one for two audiences at once, and one
    // pre-2.5 row that carries no list at all.
    const docs: [string, string[] | null][] = [
      ["open-notice", ["public"]],
      ["staff-handbook", ["internal"]],
      ["board-minutes", ["restricted"]],
      ["either", ["internal", "restricted"]],
      ["undeclared", null],
    ];
    for (const [slug, audience] of docs) {
      const node = await pool.query(
        "INSERT INTO content_nodes (tenant_id, generation, stable_id, kind, slug, title," +
          " corpus_id, audience, doc_status) VALUES ($1, 1, $2, 'document', $3, $4, $1, $5::text[], 'stable')" +
          " RETURNING node_id",
        [TENANT, `knowledge/${slug}`, slug, slug, audience],
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

  const gucsFor = (viewer: readonly string[] | "whole"): Readonly<Record<string, string>> =>
    viewer === "whole" ? WHOLE_RECORD_SCOPE : audienceGucs(viewer);

  const searchAs = (viewer: readonly string[] | "whole"): Promise<string[]> =>
    runRead(
      pool,
      TENANT,
      async (c) => (await keywordSearch(c, scope, "widgets", 20)).map((h) => h.slug),
      gucsFor(viewer),
    ).then((s) => s.sort());

  const outlineAs = (viewer: readonly string[]): Promise<string[]> =>
    runRead(
      pool,
      TENANT,
      async (c) =>
        (await outline(c, scope, { root: null, depth: 5, limit: 200 })).rows.map((r) => r.slug),
      audienceGucs(viewer),
    ).then((s) => s.sort());

  const readAs = (viewer: readonly string[] | "whole", slug: string): Promise<string | null> =>
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
      gucsFor(viewer),
    );

  it("search: a public viewer sees only the public document — never internal, restricted or unlisted", async () => {
    expect(await searchAs(PUBLIC)).toEqual(["open-notice"]);
  });

  it("search: a viewer holding a list sees every document whose list overlaps it", async () => {
    expect(await searchAs(INTERNAL)).toEqual(["either", "open-notice", "staff-handbook"]);
    expect(await searchAs(RESTRICTED)).toEqual([
      "board-minutes",
      "either",
      "open-notice",
      "staff-handbook",
    ]);
    // Membership stays on the document: a viewer holding only `restricted`
    // beside public sees the two-audience document and not the internal one.
    expect(await searchAs(["public", "restricted"])).toEqual([
      "board-minutes",
      "either",
      "open-notice",
    ]);
  });

  it("outline: a document outside the viewer's lists is not even listed", async () => {
    expect(await outlineAs(PUBLIC)).toEqual(["open-notice"]);
    expect(await outlineAs(INTERNAL)).toContain("staff-handbook");
    expect(await outlineAs(INTERNAL)).not.toContain("board-minutes");
  });

  it("read: resolving a slug outside the viewer's lists is a not-found, not a partial serve", async () => {
    expect(await readAs(PUBLIC, "staff-handbook")).toBeNull();
    expect(await readAs(PUBLIC, "board-minutes")).toBeNull();
    expect(await readAs(INTERNAL, "staff-handbook")).toBe("staff-handbook");
  });

  it("a row with NO audience list is served to nobody — omission is a refusal, never a default", async () => {
    expect(await searchAs(RESTRICTED)).not.toContain("undeclared");
    expect(await readAs(RESTRICTED, "undeclared")).toBeNull();
  });

  it("the whole-record scope (calibration) is a stated value that admits everything with a list", async () => {
    expect(await searchAs("whole")).toEqual([
      "board-minutes",
      "either",
      "open-notice",
      "staff-handbook",
      "undeclared",
    ]);
  });

  it("a document naming an identifier no viewer holds is never served — a typo is a restriction", async () => {
    await pool.query(
      "UPDATE content_nodes SET audience = ARRAY['board-only'] WHERE tenant_id = $1 AND slug = $2",
      [TENANT, "open-notice"],
    );
    try {
      expect(await searchAs(RESTRICTED)).not.toContain("open-notice");
    } finally {
      await pool.query(
        "UPDATE content_nodes SET audience = ARRAY['public'] WHERE tenant_id = $1 AND slug = $2",
        [TENANT, "open-notice"],
      );
    }
  });

  /**
   * `runRead` used to bind the whole-record sentinel by DEFAULT, so a read that
   * named no viewer was served EVERY tier. The stated reason was that "the
   * whole record" should be something a caller says rather than an accident of
   * an unbound GUC — and binding it by default achieved the exact opposite: the
   * accident became the default, and the SQL backstop that denies an unbound
   * viewer could never fire, because the viewer was never unbound. A serving
   * path that forgot to narrow was therefore caught by nothing but a grep over
   * `service.ts` (audience-binding.integration.test.ts).
   *
   * A default of "every audience" underneath a governance predicate is a loaded
   * gun in a codebase whose posture is to refuse rather than default (review
   * 2026-08-25). It is gone: the sentinel is now only ever a value a caller
   * states, and a read that states none is served nothing.
   */
  it("a read that names NO viewer is served nothing — the SQL backstop, now reachable", async () => {
    const unscoped = await runRead(pool, TENANT, async (c) =>
      (await keywordSearch(c, scope, "widgets", 20)).map((h) => h.slug),
    );
    expect(
      unscoped,
      "an unbound app.viewer overlaps nothing, so the predicate is false for every row",
    ).toEqual([]);
    expect(
      await readAs("whole", "open-notice"),
      "and the sentinel still admits everything when a caller STATES it",
    ).toBe("open-notice");
  });

  it("the audience GUCs are transaction-scoped — they never leak to the next borrower", async () => {
    // Read the GUC on the RAW connection, not through `runRead`.
    //
    // The first version of this test bound "restricted" in one `runRead` and
    // then asserted a second `runRead` saw the whole record — but `runRead`
    // binds WHOLE_RECORD_SCOPE by DEFAULT, so it overwrote whatever the first
    // transaction left behind. The assertion was satisfied by the default
    // binding, not by transaction scoping: changing `scopedTxn` to bind
    // `app.viewer` with `set_config(..., false)` — session scope,
    // surviving the COMMIT and leaking to the next borrower of that pooled
    // connection — left all nine tests in this file green (round-8 review of
    // #43).
    //
    // maxSize 1 so "the next borrower" is guaranteed to be the SAME physical
    // connection; with more, a leak could hide on a socket nobody checks.
    const single = contentPool(dsn, 1);
    try {
      await runRead(single, TENANT, async () => undefined, audienceGucs(RESTRICTED));
      const client = await single.connect();
      try {
        const leaked = await client.query("SELECT current_setting('app.viewer', true) AS viewer");
        const { viewer } = leaked.rows[0] as { viewer: string | null };
        expect(
          viewer ?? "",
          `app.viewer survived the COMMIT as ${JSON.stringify(viewer)} — the next ` +
            "caller on this connection would inherit someone else's viewer list",
        ).toBe("");
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
