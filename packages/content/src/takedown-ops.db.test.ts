/**
 * The takedown write plane, and the manifest that carries a denial to the site.
 *
 * Two halves of one finding. The denial mechanism was complete on the serving
 * side and had no door: the only way to impose one was a superuser psql prompt,
 * with no row proving who did it. And because it lived only in the database,
 * the site kept publishing a withdrawn document — `llms.txt` included.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest } from "./db.js";
import { grantIngest } from "./grant.js";
import {
  applyTakedown,
  deniedStableIds,
  deniedSubtreeDirs,
  denylistManifest,
  listTakedowns,
  readLedger,
  revokeTakedown,
} from "./takedown-ops.js";
import { applySchema } from "./schema.js";
import type { ContentInstance } from "./instance.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_takedown_ops_test";
const TENANT = "takedown-corp";

const instance: ContentInstance = {
  name: TENANT,
  corpusId: TENANT,
  tenantId: TENANT,
  dsnEnv: "KSOR_DB_URL",
  abstain: { vectorFloor: null, keywordFloor: null },
  maximumResponseCharacters: 120_000,
  instructions: "",
  audiences: [],
  defaultVisibility: null,
  embeddingProvider: "fake",
  embeddingModel: "fake-embed-001",
  embeddingDim: 1536,
};

describe.runIf(adminDsn !== "")("takedown write plane (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, 1536);
    await grantIngest(pool, TENANT);
    await pool.query(
      "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 1)",
      [TENANT],
    );
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("denies a node through the ingest role — no superuser psql required", async () => {
    const out = await applyTakedown(pool, instance, {
      stableId: "knowledge/withdrawn",
      scope: "node",
      reason: "legal request 2026-08",
      actor: "ops@example.com",
    });
    expect(out.changed).toBe(true);
    expect((await listTakedowns(pool, instance)).map((r) => r.stableId)).toEqual([
      "knowledge/withdrawn",
    ]);
  });

  it("writes the §7 row that proves WHO denied it, and the ledger can be READ", async () => {
    // Both halves matter: the row exists, and a shipped role can read it back.
    // Before schema 2.3 retrieval_log had FORCE RLS, an INSERT policy, and no
    // SELECT policy or grant — write-only under every credential ksor ships.
    const rows = await readLedger(pool, instance, 10);
    const act = rows.find((r) => r.action === "takedown_applied");
    expect(act, "the act left a row").toBeDefined();
    expect(act?.actor).toBe("ops@example.com");
    expect(act?.detail.stable_id).toBe("knowledge/withdrawn");
    expect(act?.detail.reason).toBe("legal request 2026-08");
  });

  it("is idempotent, and says so rather than pretending it changed something", async () => {
    const again = await applyTakedown(pool, instance, {
      stableId: "knowledge/withdrawn",
      scope: "node",
      reason: "legal request 2026-08",
      actor: "ops@example.com",
    });
    expect(again.changed).toBe(false);
  });

  it("widening a denial to a subtree is a change, not a no-op", async () => {
    const widened = await applyTakedown(pool, instance, {
      stableId: "knowledge/withdrawn",
      scope: "subtree",
      reason: "legal request 2026-08",
      actor: "ops@example.com",
    });
    expect(widened.changed).toBe(true);
    expect((await listTakedowns(pool, instance))[0]?.scope).toBe("subtree");
  });

  it("exports a manifest of EXACT ids, with subtree denials already expanded", async () => {
    // The site has no tree to walk, so the expansion happens here. Handing it a
    // scope to interpret meant prefix-matching, and a section's stable_id ends
    // in /index — so its children never matched and kept publishing.
    const ids = await deniedStableIds(pool, instance);
    const manifest = denylistManifest(TENANT, ids, new Date("2026-08-21T00:00:00Z"));
    expect(manifest.source).toBe("database");
    expect(manifest.denied.map((d) => d.stable_id)).toContain("knowledge/withdrawn");
    expect(
      manifest.denied.every((d) => d.scope === "node"),
      "every entry is an outright denial, nothing left to interpret",
    ).toBe(true);
  });

  it("exports the subtree's DIRECTORY, so a document added later is covered too", async () => {
    // The expanded id list can only name what the ACTIVE GENERATION contains,
    // and the site builds from DISK. A document added under a withdrawn
    // section after the last ingest is on disk and not in the database, so it
    // published to /docs and llms.txt under a section that had been explicitly
    // withdrawn — while decision 14 states outright that a subtree deny must
    // cover descendants a FUTURE re-ingest adds (round-5 review of #43).
    //
    // Walked live 2026-08-21: `knowledge/policies/2026-layoffs.md`, created
    // after the takedown and never ingested, is absent from the id list and
    // covered by the directory.
    const tree = [
      // A SECTION — the ordinary target of --subtree, and synthetic: it has no
      // source row at all, so deriving the directory from the denied node's own
      // file finds nothing.
      { stable: "knowledge/policies#section", slug: "policies", kind: "section", path: null },
      {
        stable: "knowledge/policies/purchase-approval",
        slug: "purchase-approval",
        kind: "document",
        path: "knowledge/policies/purchase-approval.md",
      },
      {
        stable: "knowledge/policies/nested/detail",
        slug: "detail",
        kind: "document",
        path: "knowledge/policies/nested/detail.md",
      },
      // Outside the section, and it must stay servable.
      { stable: "knowledge/about", slug: "about", kind: "document", path: "knowledge/about.md" },
    ];
    const ids = new Map<string, string>();
    await runIngest(pool, TENANT, async (client) => {
      for (const node of tree) {
        const parent = node.stable.startsWith("knowledge/policies/")
          ? ids.get("knowledge/policies#section")
          : null;
        const r = await client.query(
          "INSERT INTO content_nodes (tenant_id, corpus_id, generation, stable_id, slug, title, kind, position, parent_id)" +
            " VALUES ($1, $1, 1, $2, $3, $4, $5, 0, $6) RETURNING node_id",
          [TENANT, node.stable, node.slug, node.slug, node.kind, parent ?? null],
        );
        const nodeId = String(r.rows[0].node_id);
        ids.set(node.stable, nodeId);
        if (node.path !== null) {
          await client.query(
            "INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path," +
              " content_hash, embedding_model, chunk_policy) VALUES ($1, 1, $2, $3, $4, $5, 'h', 'fake-embed-001', 'p')",
            [TENANT, `${node.path}:prose`, nodeId, node.slug, node.path],
          );
        }
      }
    });
    await applyTakedown(pool, instance, {
      stableId: "knowledge/policies#section",
      scope: "subtree",
      reason: "legal hold",
      actor: "ops@example.com",
    });

    const dirs = await deniedSubtreeDirs(pool, instance);
    expect(dirs, "the section's directory, derived from its DESCENDANTS' files").toEqual([
      "knowledge/policies/",
    ]);

    // A file that does not exist in the database is still covered.
    const later = "knowledge/policies/2026-layoffs.md";
    expect(
      dirs.some((d) => later.startsWith(d)),
      `a document added after the takedown must be covered: ${JSON.stringify(dirs)}`,
    ).toBe(true);
    // And a document OUTSIDE the section is not.
    expect(dirs.some((d) => "knowledge/about.md".startsWith(d))).toBe(false);

    const manifest = denylistManifest(
      TENANT,
      await deniedStableIds(pool, instance),
      new Date("2026-08-21T00:00:00Z"),
      "database",
      dirs,
    );
    expect(manifest.denied_subtrees).toEqual(["knowledge/policies/"]);
    expect(
      manifest.denied.map((d) => d.stable_id),
      "the later document is NOT in the id list — the database has never seen it",
    ).not.toContain("knowledge/policies/2026-layoffs");

    // These cases share one database in order, so this one puts back what it
    // changed rather than leaving a denial for the next test to trip over.
    await revokeTakedown(pool, instance, {
      stableId: "knowledge/policies#section",
      actor: "ops@example.com",
    });
  });

  it("a --subtree denial on a LEAF contributes no directory — its subtree is itself", async () => {
    // Otherwise the leaf's own directory would be emitted and every sibling in
    // it would be denied.
    await applyTakedown(pool, instance, {
      stableId: "knowledge/about",
      scope: "subtree",
      reason: "leaf",
      actor: "ops@example.com",
    });
    const dirs = await deniedSubtreeDirs(pool, instance);
    expect(dirs, "a leaf must not deny its siblings").not.toContain("knowledge/");
    await revokeTakedown(pool, instance, { stableId: "knowledge/about", actor: "ops@example.com" });
  });

  it("lifts a denial and records THAT act too", async () => {
    const lifted = await revokeTakedown(pool, instance, {
      stableId: "knowledge/withdrawn",
      actor: "ops@example.com",
    });
    expect(lifted.changed).toBe(true);
    expect(await listTakedowns(pool, instance)).toEqual([]);
    const rows = await readLedger(pool, instance, 20);
    expect(
      rows.some((r) => r.detail.change === "revoked"),
      "the lift is on the record",
    ).toBe(true);
  });

  it("lifting something that was never denied is honest about it", async () => {
    const none = await revokeTakedown(pool, instance, {
      stableId: "knowledge/never",
      actor: "ops@example.com",
    });
    expect(none.changed).toBe(false);
  });
});

describe.runIf(adminDsn === "")("takedown write plane (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
