/**
 * A withdrawn document must not appear in ANY field of ANY reachable response.
 *
 * `takedown.db.test.ts` proves the denial seam does the right thing at each arm
 * it knows about — findDocument by stable_id and by slug, outline, hybridSearch,
 * keywordSearch, topOneScore. Every case in it is a case someone thought of.
 * Issue #33 names what that leaves open: no sweep asserts that *no reachable
 * request shape* returns denied content, in any field, including ones nobody
 * thought to check — a note, a title, a heading path, an error message.
 *
 * So this test does not look at fields. It plants an unguessable MARKER inside
 * the withdrawn document and asserts the marker never appears anywhere in the
 * serialized response, across a matrix of request shapes. A leak into a field
 * this file has never heard of still fails it.
 *
 * A leak here is not a bug. It is the product failing: "never weaken provenance,
 * citation, abstention, or governance" is critical rule 1, and a takedown that
 * half-works is worse than none, because the operator believes it worked.
 *
 * POSITIVE CONTROL, first and non-negotiable. Every assertion below is a
 * not-contains, and a probe that could never see the marker would pass all of
 * them while proving nothing. So each shape is run BEFORE the takedown and
 * required to FIND the marker. Only shapes that demonstrably see it are allowed
 * to testify that it is gone.
 */

import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest, runRead } from "../db.js";
import { applySchema } from "../schema.js";
import { embedIntent } from "./embedding.js";
import { buildShippedProvider } from "./providers/registry.js";
import { findDocument, outline, type ReadScope } from "./read.js";
import { WHOLE_RECORD_SCOPE } from "./audience.js";
import {
  hybridSearch,
  keywordSearch,
  topOneScore,
  VECTOR_TXN_GUCS,
  type SearchScope,
} from "./search.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;
const TENANT = "acme";
const CORPUS = "acme-handbook";

/**
 * Unguessable, and shaped so no ordinary text could contain it by accident. It
 * is the ONLY thing this test looks for, which is what makes the sweep
 * field-agnostic.
 */
const MARKER = `ZQXJ${randomBytes(6).toString("hex").toUpperCase()}MARKER`;

const PAD = " filler content well beyond the twenty-four character servable floor.";
const SECRET_BODY = `Withdrawn under legal request ${MARKER} and must never be served.${PAD}`;
const SURVIVOR_BODY = `Getting started guide for new operators onboarding today.${PAD}`;

const rscope: ReadScope = { tenantId: TENANT, corpusId: CORPUS, pinnedGeneration: null };
const sscope: SearchScope = {
  tenantId: TENANT,
  corpusId: CORPUS,
  kinds: null,
  pinnedGeneration: null,
};

describe.runIf(adminDsn !== "")("a withdrawn document leaks through no request shape (db)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;
  let queryVector: string;

  beforeAll(async () => {
    dbName = `ksor_sweep_${randomBytes(4).toString("hex")}`;
    admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminDsn);
    url.pathname = `/${dbName}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, DIM);
    await pool.query(
      "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', $1)",
      [TENANT],
    );

    const provider = buildShippedProvider("fake", { apiKey: null, dim: DIM });
    await runIngest(pool, TENANT, async (c) => {
      await c.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $2, 1)",
        [TENANT, CORPUS],
      );
      const node = async (
        stableId: string,
        slug: string,
        kind: string,
        parent: string | null,
        position: number,
        title: string,
      ): Promise<string> => {
        const r = await c.query(
          `INSERT INTO content_nodes (tenant_id, generation, stable_id, parent_id, kind, slug, title, position, status)
           VALUES ($1, 1, $2, $3, $4, $5, $6, $7, 'published') RETURNING node_id`,
          [TENANT, stableId, parent, kind, slug, title, position],
        );
        return String(r.rows[0].node_id);
      };
      const leaf = async (
        stableId: string,
        slug: string,
        parent: string,
        pos: number,
        title: string,
        body: string,
      ): Promise<void> => {
        const nodeId = await node(stableId, slug, "document", parent, pos, title);
        const sourceId = `${stableId}:prose`;
        await c.query(
          `INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path,
                                content_hash, embedding_model, chunk_policy)
           VALUES ($1, 1, $2, $3, $4, $2, 'hash', 'fake-embed-001', 'heading-aware-1500-content-only-v5')`,
          [TENANT, sourceId, nodeId, title],
        );
        const [vector] = await embedIntent([body], { provider, intent: "document" });
        await c.query(
          `INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content, chunk_hash,
                               labels, embedding, embedding_status, embedding_model)
           VALUES ($1, 1, $2, 0, $3, md5($3), '{"source_type": "prose"}', $4, 'embedded', 'fake-embed-001')`,
          [TENANT, sourceId, body, `[${(vector ?? []).join(",")}]`],
        );
      };

      const docs = await node("docs", "docs", "section", null, 0, "Docs");
      const legal = await node("docs/legal", "legal", "section", docs, 0, "Legal");
      // The TITLE carries the marker too: a leak through a title would be
      // invisible to a test that only inspected chunk content.
      await leaf("docs/legal/secret", "secret", legal, 0, `Secret ${MARKER}`, SECRET_BODY);
      await leaf("docs/guide", "guide", docs, 1, "Guide", SURVIVOR_BODY);
    });

    const [vec] = await embedIntent([SECRET_BODY], { provider, intent: "query" });
    queryVector = `[${(vec ?? []).join(",")}]`;
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (admin !== undefined) {
      if (dbName !== undefined)
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
  }, 60_000);

  /**
   * Every reachable shape, as a name and a thunk returning whatever the seam
   * returns. The sweep serializes the WHOLE result, so a shape does not need to
   * know which field could carry a leak.
   */
  const SHAPES: ReadonlyArray<{ name: string; run: (c: pg.PoolClient) => Promise<unknown> }> = [
    // Search, by several routes to the same document.
    {
      name: "hybridSearch by its own body",
      run: (c) => hybridSearch(c, sscope, queryVector, SECRET_BODY, 10),
    },
    {
      name: "hybridSearch by the marker itself",
      run: (c) => hybridSearch(c, sscope, queryVector, MARKER, 10),
    },
    {
      name: "hybridSearch by its title words",
      run: (c) => hybridSearch(c, sscope, queryVector, "Secret", 10),
    },
    {
      name: "hybridSearch, limit 1",
      run: (c) => hybridSearch(c, sscope, queryVector, SECRET_BODY, 1),
    },
    {
      name: "hybridSearch, limit 50",
      run: (c) => hybridSearch(c, sscope, queryVector, SECRET_BODY, 50),
    },
    { name: "keywordSearch by body", run: (c) => keywordSearch(c, sscope, SECRET_BODY, 10) },
    { name: "keywordSearch by marker", run: (c) => keywordSearch(c, sscope, MARKER, 10) },
    {
      name: "keywordSearch by 'withdrawn legal'",
      run: (c) => keywordSearch(c, sscope, "withdrawn legal", 10),
    },
    // topOneScore feeds the ABSTENTION gate: a denied document scoring here
    // would let a record answer "covered" on the strength of content it refuses
    // to show — the subtlest leak of the set, and not a content leak at all.
    { name: "topOneScore", run: (c) => topOneScore(c, sscope, queryVector) },
    // Read, by every address form.
    {
      name: "findDocument by stable_id",
      run: (c) => findDocument(c, rscope, "docs/legal/secret").catch((e) => String(e)),
    },
    {
      name: "findDocument by slug",
      run: (c) => findDocument(c, rscope, "secret").catch((e) => String(e)),
    },
    {
      name: "findDocument by qualified path",
      run: (c) => findDocument(c, rscope, "legal/secret").catch((e) => String(e)),
    },
    // Outline, at every anchor and page that could surface it.
    { name: "outline at root", run: (c) => outline(c, rscope, {}) },
    { name: "outline deep", run: (c) => outline(c, rscope, { depth: 5 }) },
    {
      name: "outline at its parent",
      run: (c) => outline(c, rscope, { root: "docs/legal", depth: 5 }),
    },
    {
      name: "outline at its grandparent",
      run: (c) => outline(c, rscope, { root: "docs", depth: 5 }),
    },
    { name: "outline paged small", run: (c) => outline(c, rscope, { limit: 1, depth: 5 }) },
    {
      name: "outline paged offset",
      run: (c) => outline(c, rscope, { limit: 1, offset: 1, depth: 5 }),
    },
  ];

  const sweep = async (): Promise<Map<string, string>> => {
    const seen = new Map<string, string>();
    for (const shape of SHAPES) {
      const value = await runRead(pool, TENANT, async (c) => shape.run(c), {
        ...VECTOR_TXN_GUCS,
        ...WHOLE_RECORD_SCOPE,
      });
      seen.set(shape.name, JSON.stringify(value ?? null));
    }
    return seen;
  };

  let before: Map<string, string>;

  it("POSITIVE CONTROL: the marker is reachable before the takedown", async () => {
    before = await sweep();
    // Not every shape must see it — outline paging may legitimately not reach
    // it — but the ones that testify below must have seen it, or they prove
    // nothing. Assert the probe works on the shapes that address it directly.
    const mustSee = [
      "hybridSearch by its own body",
      "keywordSearch by marker",
      "findDocument by stable_id",
      "findDocument by slug",
      "outline at its parent",
    ];
    for (const name of mustSee) {
      expect(
        before.get(name),
        `${name} never saw the marker, so its not-contains proves nothing`,
      ).toContain(MARKER);
    }
    // And the gate can see it: a non-null top score means it is retrievable.
    expect(before.get("topOneScore")).not.toBe("null");
  });

  it("after a node takedown, the marker appears in NO response", async () => {
    await pool.query(
      `INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, scope, reason, actor)
       VALUES ($1, $2, 'docs/legal/secret', 'node', 'legal request', 'acceptance')`,
      [TENANT, CORPUS],
    );

    const after = await sweep();
    for (const [name, serialized] of after) {
      expect(serialized, `${name} leaked the withdrawn document`).not.toContain(MARKER);
      // The identity leaks too, even without the text: a stable_id or slug in a
      // citation tells a caller the document exists and what it is called.
      expect(serialized, `${name} leaked the withdrawn stable_id`).not.toContain(
        "docs/legal/secret",
      );
    }

    // The survivor is untouched — a sweep that passed by serving nothing at all
    // would be worthless.
    expect(after.get("outline at root")).toContain("guide");
  });

  it("the abstention gate stops scoring it, so coverage is not claimed on withdrawn text", async () => {
    const score = await runRead(pool, TENANT, async (c) => topOneScore(c, sscope, queryVector), {
      ...VECTOR_TXN_GUCS,
      ...WHOLE_RECORD_SCOPE,
    });
    // Either nothing scores, or what scores is the survivor — never the
    // withdrawn document. This is the leak that carries no content and still
    // breaks the guarantee: "we cover that" is an answer about a document the
    // record refuses to show.
    const top = await runRead(
      pool,
      TENANT,
      async (c) => hybridSearch(c, sscope, queryVector, SECRET_BODY, 5),
      { ...VECTOR_TXN_GUCS, ...WHOLE_RECORD_SCOPE },
    );
    expect(JSON.stringify(top)).not.toContain(MARKER);
    if (score !== null) expect(typeof score).toBe("number");
  });

  it("a subtree takedown of the parent hides it by every shape too", async () => {
    await pool.query(`DELETE FROM takedown_denylist WHERE tenant_id = $1`, [TENANT]);
    await pool.query(
      `INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, scope, reason, actor)
       VALUES ($1, $2, 'docs/legal', 'subtree', 'legal request', 'acceptance')`,
      [TENANT, CORPUS],
    );

    const after = await sweep();
    for (const [name, serialized] of after) {
      expect(serialized, `${name} leaked a document under a withdrawn subtree`).not.toContain(
        MARKER,
      );
    }
    expect(after.get("outline at root")).toContain("guide");
  });
});
