/**
 * The read-path arms, live (oracle test_db_v2 read coverage, widened): the
 * verbatim schema applied at a test dimension, a small governed tree seeded
 * through the ingest role (RLS + grant table enforced for real), then slug
 * resolution (stable_id exact → alias flatten → suffix), document chunks
 * feeding the packer byte-exact, unit tree, outline browse + drill-down
 * re-basing, denial on every resolution arm, and the ABA-proof
 * takedown deny. Gated on KSOR_DB_URL (CI: pgvector service
 * container; dev: local Postgres or a throwaway Neon); self-contained in
 * its own throwaway database.
 */

import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest, runRead, type DbOp } from "../db.js";
import { WHOLE_RECORD_SCOPE } from "./audience.js";
import { applySchema } from "../schema.js";
import {
  documentChunks,
  findDocument,
  outline,
  unitTree,
  UnknownSlug,
  type ReadScope,
} from "./read.js";
import { windowDocument } from "./windowing.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;
const TENANT = "acme";
const CORPUS = "acme-handbook";

const scope: ReadScope = { tenantId: TENANT, corpusId: CORPUS, pinnedGeneration: null };

const PAD = " filler content well beyond the twenty-four character servable floor.";

describe.runIf(adminDsn !== "")("read db acceptance", () => {
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
    dbName = `ksor_t_${randomBytes(4).toString("hex")}`;
    admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminDsn);
    url.pathname = `/${dbName}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, DIM);
    // The grant table row is the ingest AUTHORIZATION (a CLI flag is not
    // authorization). The policy checks current_user AFTER the SET LOCAL
    // ROLE pin, so the row names the ingest role itself (found live,
    // 2026-08-19 — kernel.db.test.ts carries the story).
    await pool.query(
      "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', $1)",
      [TENANT],
    );

    await runIngest(pool, TENANT, async (c) => {
      await c.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $2, 1)",
        [TENANT, CORPUS],
      );
      const node = async (
        stableId: string,
        slug: string,
        opts: {
          parent?: string | null;
          position?: number;
          permalink?: string | null;
          status?: string;
        } = {},
      ): Promise<string> => {
        const r = await c.query(
          `INSERT INTO content_nodes (tenant_id, generation, stable_id, parent_id, kind, slug, title, position, permalink, status, audience, doc_status)
           VALUES ($1, 1, $2, $3, 'document', $4, $5, $6, $7, $8, ARRAY['public'], 'stable') RETURNING node_id`,
          [
            TENANT,
            stableId,
            opts.parent ?? null,
            slug,
            slug,
            opts.position ?? 0,
            opts.permalink ?? null,
            opts.status ?? "published",
          ],
        );
        return String(r.rows[0].node_id);
      };
      const source = async (nodeId: string, sourceId: string): Promise<void> => {
        await c.query(
          `INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path,
                                content_hash, embedding_model, chunk_policy)
           VALUES ($1, 1, $2, $3, $2, $2, 'hash', 'fake-embed-001', 'heading-aware-1500-content-only-v5')`,
          [TENANT, sourceId, nodeId],
        );
      };
      const chunk = async (
        sourceId: string,
        ordinal: number,
        headingPath: string,
        content: string,
      ): Promise<void> => {
        // Read arms never require an embedding; 'pending' satisfies the
        // embedded-has-vector constraint without one.
        await c.query(
          `INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content, chunk_hash,
                               heading_path_text, labels, embedding_status)
           VALUES ($1, 1, $2, $3, $4, md5($4), $5, '{"source_type": "prose"}', 'pending')`,
          [TENANT, sourceId, ordinal, content, headingPath === "" ? null : headingPath],
        );
      };

      const handbook = await node("handbook", "handbook");
      const onboarding = await node("handbook/onboarding", "onboarding", {
        parent: handbook,
        position: 0,
        permalink: "/docs/onboarding",
      });
      const security = await node("handbook/security", "security", {
        parent: handbook,
        position: 1,
      });
      const setupA = await node("handbook/onboarding/setup", "setup", {
        parent: onboarding,
        position: 0,
        permalink: "/docs/onboarding/setup",
      });
      await node("handbook/onboarding/draft", "draft-doc", {
        parent: onboarding,
        position: 1,
        status: "draft",
      });
      const setupB = await node("handbook/security/setup", "setup", {
        parent: security,
        position: 0,
        permalink: "/docs/security/setup",
      });

      await source(setupA, "onboarding-setup:prose");
      await chunk("onboarding-setup:prose", 0, "", "Preamble before any heading." + PAD);
      await chunk("onboarding-setup:prose", 1, "part-1", "Part one body." + PAD);
      await chunk("onboarding-setup:prose", 2, "part-1/deep", "Deep dive." + PAD);
      await chunk("onboarding-setup:prose", 3, "part-2", "Part two body." + PAD);

      await source(setupB, "security-setup:prose");
      await chunk("security-setup:prose", 0, "hardening", "Security setup body." + PAD);

      await c.query(
        `INSERT INTO slug_aliases (tenant_id, generation, alias_slug, canonical_slug)
         VALUES ($1, 1, 'getting-set-up', 'setup')`,
        [TENANT],
      );
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

  const deny = (stableId: string): Promise<unknown> =>
    pool.query(
      "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, reason) VALUES ($1, $2, $3, 'test')",
      [TENANT, CORPUS, stableId],
    );
  const undeny = (): Promise<unknown> =>
    pool.query("DELETE FROM takedown_denylist WHERE tenant_id = $1", [TENANT]);

  it("resolves an exact stable_id first", async () => {
    const node = await readWhole(TENANT, (c) =>
      findDocument(c, scope, "handbook/onboarding/setup"),
    );
    expect(node.path, JSON.stringify(node)).toBe("handbook/onboarding/setup");
    expect(node.generation).toBe(1);
    expect(node.permalink).toBe("/docs/onboarding/setup");
  });

  it("a bare duplicate leaf fails loud with both shortest qualified addresses", async () => {
    await expect(readWhole(TENANT, (c) => findDocument(c, scope, "setup"))).rejects.toThrowError(
      /ambiguous.*(onboarding\/setup.*security\/setup|security\/setup.*onboarding\/setup)/s,
    );
  });

  it("a path suffix disambiguates; an alias flattens inside a path address", async () => {
    const direct = await readWhole(TENANT, (c) => findDocument(c, scope, "onboarding/setup"));
    expect(direct.stableId).toBe("handbook/onboarding/setup");
    const viaAlias = await readWhole(TENANT, (c) =>
      findDocument(c, scope, "onboarding/getting-set-up"),
    );
    expect(viaAlias.nodeId, "alias must resolve to the same node").toBe(direct.nodeId);
  });

  it("an unknown slug raises the typed UnknownSlug; a draft never resolves", async () => {
    await expect(
      readWhole(TENANT, (c) => findDocument(c, scope, "no-such-doc")),
    ).rejects.toBeInstanceOf(UnknownSlug);
    await expect(
      readWhole(TENANT, (c) => findDocument(c, scope, "draft-doc")),
    ).rejects.toBeInstanceOf(UnknownSlug);
  });

  it("a pin to a generation that was never published resolves nothing", async () => {
    await expect(
      readWhole(TENANT, (c) =>
        findDocument(c, { ...scope, pinnedGeneration: 99 }, "onboarding/setup"),
      ),
    ).rejects.toBeInstanceOf(UnknownSlug);
  });

  it("document chunks feed the packer and reconstruct the document byte-exact", async () => {
    const node = await readWhole(TENANT, (c) => findDocument(c, scope, "onboarding/setup"));
    const chunks = await readWhole(TENANT, (c) => documentChunks(c, scope, node.nodeId));
    expect(
      chunks.map((c) => c.ordinal),
      JSON.stringify(chunks),
    ).toEqual([0, 1, 2, 3]);
    expect(chunks[0]?.headingPath, "NULL heading_path_text must arrive as ''").toBe("");
    const whole = windowDocument(chunks, 1_000_000);
    expect(whole.chunks.map((c) => c.content).join("")).toBe(chunks.map((c) => c.content).join(""));
    expect(whole.nextHeading).toBeNull();
  });

  it("unit tree lists distinct heading paths in curriculum order, preamble dropped", async () => {
    const node = await readWhole(TENANT, (c) => findDocument(c, scope, "onboarding/setup"));
    const tree = await readWhole(TENANT, (c) => unitTree(c, scope, node.nodeId));
    expect(tree).toEqual(["part-1", "part-1/deep", "part-2"]);
  });

  it("outline browse walks the published tree in position order, draft hidden", async () => {
    const rows = await readWhole(TENANT, (c) => outline(c, scope, { depth: 2 }));
    expect(
      rows.map((r) => r.headingPath),
      JSON.stringify(rows),
    ).toEqual([
      "handbook",
      "handbook/onboarding",
      "handbook/onboarding/setup",
      "handbook/security",
      "handbook/security/setup",
    ]);
    const root = rows[0];
    expect(root?.childCount, "draft child must not count").toBe(2);
    const setupRow = rows.find((r) => r.headingPath === "handbook/onboarding/setup");
    expect(setupRow?.hasContent).toBe(true);
    expect(setupRow?.permalink).toBe("/docs/onboarding/setup");
  });

  it("outline drill-down re-bases to root-absolute and carries the permalink (column 8)", async () => {
    const rows = await readWhole(TENANT, (c) =>
      outline(c, scope, { root: "onboarding", depth: 1 }),
    );
    expect(rows.length, JSON.stringify(rows)).toBe(1); // children only; draft hidden
    expect(rows[0]).toMatchObject({
      slug: "setup",
      headingPath: "handbook/onboarding/setup",
      depth: 2,
      permalink: "/docs/onboarding/setup", // the re-base once dropped this in prod (2026-07-31)
    });
  });

  it("outline accepts the very path addresses it emits", async () => {
    const rows = await readWhole(TENANT, (c) =>
      outline(c, scope, { root: "handbook/onboarding", depth: 1 }),
    );
    expect(rows[0]?.headingPath).toBe("handbook/onboarding/setup");
  });

  it("outline of a leaf yields []; an unknown node is loud", async () => {
    const rows = await readWhole(TENANT, (c) =>
      outline(c, scope, { root: "onboarding/setup", depth: 1 }),
    );
    expect(rows).toEqual([]);
    await expect(
      readWhole(TENANT, (c) => outline(c, scope, { root: "no-such-node" })),
    ).rejects.toThrowError(/no node with slug/);
  });

  it("an ambiguous outline anchor is refused, never silently merged", async () => {
    await expect(
      readWhole(TENANT, (c) => outline(c, scope, { root: "setup" })),
    ).rejects.toThrowError(/ambiguous/);
  });

  it("takedown denial hides a node from every resolution arm without re-ingest", async () => {
    await deny("handbook/onboarding/setup");
    try {
      // stable_id-exact arm (oracle self-review A1: this arm once missed the predicate)
      await expect(
        readWhole(TENANT, (c) => findDocument(c, scope, "handbook/onboarding/setup")),
      ).rejects.toBeInstanceOf(UnknownSlug);
      // slug arm — the sibling under security still resolves uniquely
      const survivor = await readWhole(TENANT, (c) => findDocument(c, scope, "setup"));
      expect(survivor.stableId, "denial must leave the sibling resolvable").toBe(
        "handbook/security/setup",
      );
      // outline arm
      const rows = await readWhole(TENANT, (c) => outline(c, scope, { depth: 2 }));
      expect(rows.map((r) => r.headingPath)).not.toContain("handbook/onboarding/setup");
    } finally {
      await undeny();
    }
  });

  it("RLS fails closed: an unknown tenant resolves nothing, not an error", async () => {
    await expect(
      readWhole("globex", (c) =>
        findDocument(c, { ...scope, tenantId: "globex" }, "onboarding/setup"),
      ),
    ).rejects.toBeInstanceOf(UnknownSlug);
    const rows = await readWhole("globex", (c) =>
      outline(c, { ...scope, tenantId: "globex" }, { depth: 2 }),
    );
    expect(rows).toEqual([]);
  });
});

describe.runIf(adminDsn === "")("read db acceptance (gated)", () => {
  it("skipped — set KSOR_DB_URL to run against Postgres + pgvector", () => {
    expect(adminDsn).toBe("");
  });
});
