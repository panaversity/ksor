/**
 * Scoped takedown denial, live (decision 14). A small governed tree seeded
 * through the ingest role, then denial exercised across every serving arm —
 * findDocument (stable_id + slug), outline (incl child_count), hybridSearch,
 * keywordSearch, topOneScore. The fixture is built to catch the two ways a
 * subtree deny can be wrong:
 *   - a descendant whose stable_id is an author `sor_id` override (LGL-9931,
 *     NOT path-derived) — a stable_id prefix match would leak it; the
 *     parent_id walk must hide it;
 *   - a prefix-sibling (docs/legal-archive, a SIBLING of docs/legal that
 *     shares its text prefix) — must SURVIVE a subtree deny of docs/legal.
 * Gated on KSOR_DB_URL; self-contained in its own throwaway database.
 */

import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest, runRead, type DbOp } from "../db.js";
import { WHOLE_RECORD_SCOPE } from "../lib/audience.js";
import { applySchema } from "../schema.js";
import { embedIntent } from "./embedding.js";
import { buildShippedProvider } from "./providers/registry.js";
import { findDocument, outline, UnknownSlug, type ReadScope } from "./read.js";
import { hybridSearch, topOneScore, VECTOR_TXN_GUCS, type SearchScope } from "./search.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;
const TENANT = "acme";
const CORPUS = "acme-handbook";
const PAD = " filler content well beyond the twenty-four character servable floor.";

const rscope: ReadScope = { tenantId: TENANT, corpusId: CORPUS, pinnedGeneration: null };
const sscope: SearchScope = {
  tenantId: TENANT,
  corpusId: CORPUS,
  kinds: null,
  pinnedGeneration: null,
};

// content by stable_id — each leaf's own text, used as its own query
const BODY: Record<string, string> = {
  "docs/legal/policy": "Data retention policy governs how long records are kept." + PAD,
  "LGL-9931": "Terms of service and acceptable use for the platform." + PAD,
  "docs/legal-archive": "Archived legal notices from prior calendar years." + PAD,
  "docs/guide": "Getting started guide for new operators onboarding today." + PAD,
};

describe.runIf(adminDsn !== "")("scoped takedown (db)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;

  /**
   * Every read in this file is entitled to the WHOLE record — these suites test
   * resolution and denial, not audience — so the scope is STATED once here rather
   * than on every call site. `runRead` binds no audience of its own: a read that
   * names no viewer is served nothing (db.ts, review 2026-08-25), which is why
   * the sentinel has to appear somewhere for these reads to see anything at all.
   */
  function readWhole<T>(
    tenant: string,
    op: DbOp<T>,
    extra: Readonly<Record<string, string>> = {},
  ): Promise<T> {
    return runRead(pool, tenant, op, { ...WHOLE_RECORD_SCOPE, ...extra });
  }
  let dbName: string;

  beforeAll(async () => {
    dbName = `ksor_td_${randomBytes(4).toString("hex")}`;
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
      ): Promise<string> => {
        const r = await c.query(
          // A SECTION carries no governance of its own (record spec §1) — it is
          // admitted through a visible descendant — so only the leaves get an
          // audience and a lifecycle status here.
          `INSERT INTO content_nodes (tenant_id, generation, stable_id, parent_id, kind, slug, title, position, status, audience, doc_status)
           VALUES ($1, 1, $2, $3, $4, $5, $5, $6, 'published',
                   CASE WHEN $4 = 'section' THEN NULL ELSE ARRAY['public'] END,
                   CASE WHEN $4 = 'section' THEN NULL ELSE 'stable' END) RETURNING node_id`,
          [TENANT, stableId, parent, kind, slug, position],
        );
        return String(r.rows[0].node_id);
      };
      const leaf = async (
        stableId: string,
        slug: string,
        parent: string,
        pos: number,
      ): Promise<void> => {
        const nodeId = await node(stableId, slug, "document", parent, pos);
        const sourceId = `${stableId}:prose`;
        await c.query(
          `INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path,
                                content_hash, embedding_model, chunk_policy)
           VALUES ($1, 1, $2, $3, $2, $2, 'hash', 'fake-embed-001', 'heading-aware-1500-content-only-v5')`,
          [TENANT, sourceId, nodeId],
        );
        const body = BODY[stableId]!;
        const [vector] = await embedIntent([body], { provider, intent: "document" });
        await c.query(
          `INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content, chunk_hash,
                               labels, embedding, embedding_status, embedding_model)
           VALUES ($1, 1, $2, 0, $3, md5($3), '{"source_type": "prose"}', $4, 'embedded', 'fake-embed-001')`,
          [TENANT, sourceId, body, `[${(vector ?? []).join(",")}]`],
        );
      };

      const docs = await node("docs", "docs", "section", null, 0);
      const legal = await node("docs/legal", "legal", "section", docs, 0);
      await leaf("docs/legal/policy", "policy", legal, 0); // path-form descendant
      await leaf("LGL-9931", "terms", legal, 1); // sor_id-override descendant (NOT path-derived)
      await leaf("docs/legal-archive", "legal-archive", docs, 1); // prefix-SIBLING decoy
      await leaf("docs/guide", "guide", docs, 2); // unrelated survivor
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (admin !== undefined) {
      if (dbName !== undefined)
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
  }, 60_000);

  const deny = (stableId: string, scope: "node" | "subtree"): Promise<unknown> =>
    pool.query(
      "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, scope, reason) VALUES ($1, $2, $3, $4, 'test')",
      [TENANT, CORPUS, stableId, scope],
    );
  const undeny = (): Promise<unknown> =>
    pool.query("DELETE FROM takedown_denylist WHERE tenant_id = $1", [TENANT]);

  const search = (query: string): Promise<{ stableId: string }[]> =>
    runRead(
      pool,
      TENANT,
      async (c) => {
        const [qv] = await embedIntent([query], {
          provider: buildShippedProvider("fake", { apiKey: null, dim: DIM }),
          intent: "query",
        });
        const { hits } = await hybridSearch(c, sscope, qv ?? [], query, 10);
        return hits.map((h) => ({ stableId: h.stableId }));
      },
      { ...VECTOR_TXN_GUCS, ...WHOLE_RECORD_SCOPE },
    );
  const stableIds = (hits: { stableId: string }[]): string[] => hits.map((h) => h.stableId);

  it("subtree deny hides the container AND every descendant, incl. a sor_id-override child", async () => {
    await deny("docs/legal", "subtree");
    try {
      // findDocument — both the path-form and the sor_id-override descendant vanish
      await expect(
        readWhole(TENANT, (c) => findDocument(c, rscope, "docs/legal/policy")),
      ).rejects.toBeInstanceOf(UnknownSlug);
      await expect(
        readWhole(TENANT, (c) => findDocument(c, rscope, "LGL-9931")),
      ).rejects.toBeInstanceOf(UnknownSlug);
      // the container itself
      await expect(
        readWhole(TENANT, (c) => findDocument(c, rscope, "docs/legal")),
      ).rejects.toBeInstanceOf(UnknownSlug);
      // the prefix-SIBLING decoy and the unrelated doc SURVIVE
      expect(
        (await readWhole(TENANT, (c) => findDocument(c, rscope, "docs/legal-archive"))).stableId,
      ).toBe("docs/legal-archive");
      expect((await readWhole(TENANT, (c) => findDocument(c, rscope, "docs/guide"))).stableId).toBe(
        "docs/guide",
      );

      // outline browse: docs' children exclude legal; child_count drops it
      const rows = await readWhole(TENANT, (c) => outline(c, rscope, { depth: 3 }));
      const paths = rows.map((r) => r.headingPath);
      expect(paths, JSON.stringify(paths)).not.toContain("docs/legal");
      expect(paths).not.toContain("docs/legal/policy");
      expect(paths).toContain("docs/legal-archive");
      expect(paths).toContain("docs/guide");
      const docsRow = rows.find((r) => r.headingPath === "docs");
      expect(docsRow?.childCount, "docs has 3 published children; legal denied → 2").toBe(2);

      // search: neither descendant can rank; the survivors still do
      expect(stableIds(await search(BODY["docs/legal/policy"]!))).not.toContain(
        "docs/legal/policy",
      );
      expect(stableIds(await search(BODY["LGL-9931"]!))).not.toContain("LGL-9931");
      expect(stableIds(await search(BODY["docs/guide"]!))).toContain("docs/guide");
      expect(stableIds(await search(BODY["docs/legal-archive"]!))).toContain("docs/legal-archive");
    } finally {
      await undeny();
    }
  });

  it("node deny (default) hides EXACTLY the listed node — no cascade to siblings or parent", async () => {
    await deny("docs/legal/policy", "node");
    try {
      // the listed leaf is gone
      await expect(
        readWhole(TENANT, (c) => findDocument(c, rscope, "docs/legal/policy")),
      ).rejects.toBeInstanceOf(UnknownSlug);
      // its sibling under the same container SURVIVES (no cascade)
      expect((await readWhole(TENANT, (c) => findDocument(c, rscope, "LGL-9931"))).stableId).toBe(
        "LGL-9931",
      );
      // the container itself SURVIVES
      expect((await readWhole(TENANT, (c) => findDocument(c, rscope, "docs/legal"))).stableId).toBe(
        "docs/legal",
      );
      // search: the leaf cannot rank; the sibling still can
      expect(stableIds(await search(BODY["docs/legal/policy"]!))).not.toContain(
        "docs/legal/policy",
      );
      expect(stableIds(await search(BODY["LGL-9931"]!))).toContain("LGL-9931");
    } finally {
      await undeny();
    }
  });

  it("a REVOKED denial serves again — the row is the state, the ledger is the history", async () => {
    // Record spec §5: a revocation sets `revoked_ledger_id`/`revoked_at` on the
    // row rather than deleting it, so the ledger keeps the whole history and
    // the DENIED seam must read only rows still in force. Without this the
    // revocation entry lands, the row stays, and the door refuses forever while
    // the site (which reads the ledger) publishes — the two surfaces disagreeing
    // is the state decision 19 exists to prevent.
    await deny("docs/legal", "subtree");
    await deny("docs/guide", "node");
    try {
      await expect(
        readWhole(TENANT, (c) => findDocument(c, rscope, "docs/guide")),
      ).rejects.toBeInstanceOf(UnknownSlug);
      await pool.query(
        "UPDATE takedown_denylist SET revoked_ledger_id = 'r1', revoked_at = now()" +
          " WHERE tenant_id = $1 AND stable_id IN ('docs/guide', 'docs/legal')",
        [TENANT],
      );
      // the revoked node denial
      expect((await readWhole(TENANT, (c) => findDocument(c, rscope, "docs/guide"))).stableId).toBe(
        "docs/guide",
      );
      expect(stableIds(await search(BODY["docs/guide"]!))).toContain("docs/guide");
      // and the revoked SUBTREE denial: the cascade must stop cascading too,
      // which is a second EXISTS in the same CTE and drifts independently
      expect(
        (await readWhole(TENANT, (c) => findDocument(c, rscope, "docs/legal/policy"))).stableId,
      ).toBe("docs/legal/policy");
      expect((await readWhole(TENANT, (c) => findDocument(c, rscope, "LGL-9931"))).stableId).toBe(
        "LGL-9931",
      );
    } finally {
      await undeny();
    }
  });

  it("topOneScore (the calibration signal, a distinct statement) honors a subtree deny", async () => {
    const topOne = (query: string): Promise<number | null> =>
      runRead(
        pool,
        TENANT,
        async (c) => {
          const [qv] = await embedIntent([query], {
            provider: buildShippedProvider("fake", { apiKey: null, dim: DIM }),
            intent: "query",
          });
          return topOneScore(c, sscope, qv ?? []);
        },
        { ...VECTOR_TXN_GUCS, ...WHOLE_RECORD_SCOPE },
      );
    // policy's own text scores ~1.0 against its own chunk when nothing is denied
    const before = await topOne(BODY["docs/legal/policy"]!);
    expect(before, "policy query must match its own chunk").not.toBeNull();
    expect(before!).toBeGreaterThan(0.9);
    await deny("docs/legal", "subtree");
    try {
      // with policy's chunk (and its whole subtree) denied, the best remaining
      // match is a different, less similar chunk — the top-1 signal MUST drop
      const after = await topOne(BODY["docs/legal/policy"]!);
      expect(after, `after=${after} before=${before}`).toBeLessThan(before!);
    } finally {
      await undeny();
    }
  });
});

describe.runIf(adminDsn === "")("scoped takedown (db) — gated", () => {
  it("skipped — set KSOR_DB_URL to run against Postgres + pgvector", () => {
    expect(adminDsn).toBe("");
  });
});
