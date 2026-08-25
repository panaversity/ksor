/**
 * The admission seam, end to end in real Postgres: audience overlap, the
 * lifecycle window, the trust floor and the SECTION branch, on the one CTE
 * every serving statement binds.
 *
 * The section branch is why this is a set rather than a row predicate. A
 * section has no body and declares no governance of its own (record spec §1),
 * so it cannot be judged on its own row at all — it is admitted iff a
 * descendant is visible, resolved by a recursive `parent_id` walk the way
 * `takedown.ts` resolves a subtree denial. Ingest's union-of-descendants
 * `audience` could express that for audience and for nothing else: a section
 * whose every child is a draft, or past its review date, or below the trust
 * floor, would still have carried their audience lists.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scopedTxn } from "@panaversity/ksor-postgres";
import { contentPool } from "../db.js";
import { ADMITTED, ADMITTED_CTE } from "./admit.js";
import { DENIED_CTE } from "./takedown.js";
import { audienceGucs, WHOLE_RECORD_SCOPE } from "./audience.js";
import { trustGucs } from "./trust.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_admit_seam";
const TENANT = "t-admit";
const DAY = 86_400_000;

interface Seed {
  readonly stableId: string;
  readonly kind: "section" | "document";
  readonly parent: string | null;
  readonly audience: string[] | null;
  readonly docStatus: string | null;
  readonly effectiveFrom?: number | null;
  readonly staleAfter?: number | null;
  readonly trustTier?: number;
}

const NOW = Date.now();

const SEEDS: readonly Seed[] = [
  // A section whose only document is public and stable — admitted through it.
  { stableId: "open", kind: "section", parent: null, audience: null, docStatus: null },
  {
    stableId: "open/live",
    kind: "document",
    parent: "open",
    audience: ["public"],
    docStatus: "stable",
  },
  // A section whose only document is a draft — nothing to admit it.
  { stableId: "drafts", kind: "section", parent: null, audience: null, docStatus: null },
  {
    stableId: "drafts/wip",
    kind: "document",
    parent: "drafts",
    audience: ["public"],
    docStatus: "draft",
  },
  // A section whose only document is internal — admitted for an internal
  // viewer, absent for a public one.
  { stableId: "inner", kind: "section", parent: null, audience: null, docStatus: null },
  {
    stableId: "inner/memo",
    kind: "document",
    parent: "inner",
    audience: ["internal"],
    docStatus: "stable",
  },
  // Two levels: the outer section is admitted only through its grandchild.
  { stableId: "outer", kind: "section", parent: null, audience: null, docStatus: null },
  { stableId: "outer/mid", kind: "section", parent: "outer", audience: null, docStatus: null },
  {
    stableId: "outer/mid/leaf",
    kind: "document",
    parent: "outer/mid",
    audience: ["public"],
    docStatus: "stable",
  },
  // Lifecycle edges, each its own document at the root.
  {
    stableId: "future",
    kind: "document",
    parent: null,
    audience: ["public"],
    docStatus: "stable",
    effectiveFrom: NOW + DAY,
  },
  {
    stableId: "stale",
    kind: "document",
    parent: null,
    audience: ["public"],
    docStatus: "stable",
    staleAfter: NOW - DAY,
  },
  {
    stableId: "gone",
    kind: "document",
    parent: null,
    audience: ["public"],
    docStatus: "deprecated",
  },
  // Trust tiers.
  {
    stableId: "unverified",
    kind: "document",
    parent: null,
    audience: ["public"],
    docStatus: "stable",
    trustTier: 0,
  },
  {
    stableId: "machine",
    kind: "document",
    parent: null,
    audience: ["public"],
    docStatus: "stable",
    trustTier: 1,
  },
  {
    stableId: "human",
    kind: "document",
    parent: null,
    audience: ["public"],
    docStatus: "stable",
    trustTier: 2,
  },
];

describe.runIf(adminDsn !== "")("the admission seam (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    const { renderSchema } = await import("../schema.js");
    const boot = new Pool({ connectionString: url.toString() });
    await boot.query(renderSchema(8));
    await boot.end();
    pool = contentPool(url.toString(), 4);

    await pool.query(
      "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, 'c', 1)",
      [TENANT],
    );
    const ids = new Map<string, string>();
    for (const s of SEEDS) {
      const r = await pool.query<{ node_id: string }>(
        `INSERT INTO content_nodes (tenant_id, corpus_id, generation, stable_id, parent_id, kind, slug,
             title, audience, doc_status, effective_from, stale_after, trust_tier)
         VALUES ($1, 'c', 1, $2, $3, $4, $5, $5, $6::text[], $7, $8::timestamptz, $9::timestamptz, $10)
         RETURNING node_id`,
        [
          TENANT,
          s.stableId,
          s.parent === null ? null : ids.get(s.parent),
          s.kind,
          s.stableId.replaceAll("/", "-"),
          s.audience,
          s.docStatus,
          s.effectiveFrom == null ? null : new Date(s.effectiveFrom).toISOString(),
          s.staleAfter == null ? null : new Date(s.staleAfter).toISOString(),
          s.trustTier ?? 0,
        ],
      );
      ids.set(s.stableId, String(r.rows[0]?.node_id));
    }
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  const sql = `
WITH RECURSIVE g AS (SELECT active_generation AS gen FROM corpora WHERE tenant_id = $1 AND corpus_id = $2),
${DENIED_CTE},
${ADMITTED_CTE}
SELECT n.stable_id FROM content_nodes n JOIN g ON n.generation = g.gen
WHERE n.tenant_id = $1 AND ${ADMITTED} ORDER BY n.stable_id`;

  const admitted = async (gucs: Readonly<Record<string, string>>): Promise<string[]> =>
    scopedTxn(pool, { "app.tenant_id": TENANT, ...gucs }, async (client) => {
      const r = await client.query<{ stable_id: string }>(sql, [TENANT, "c"]);
      return r.rows.map((row) => row.stable_id);
    });

  it("a public viewer gets the public stable documents and the sections that hold them", async () => {
    expect(await admitted(audienceGucs(["public"]))).toEqual([
      "human",
      "machine",
      "open",
      "open/live",
      "outer",
      "outer/mid",
      "outer/mid/leaf",
      "unverified",
    ]);
  });

  it("a section whose only document is a DRAFT is admitted to nobody", async () => {
    const rows = await admitted(audienceGucs(["public", "internal"]));
    expect(rows).not.toContain("drafts");
    expect(rows).not.toContain("drafts/wip");
  });

  it("a section is admitted through an INTERNAL descendant only to a viewer holding internal", async () => {
    expect(await admitted(audienceGucs(["public"]))).not.toContain("inner");
    expect(await admitted(audienceGucs(["public", "internal"]))).toContain("inner");
  });

  it("a not-yet-effective, a stale and a deprecated document are all absent", async () => {
    const rows = await admitted(WHOLE_RECORD_SCOPE);
    expect(rows).not.toContain("future");
    expect(rows).not.toContain("stale");
    expect(rows).not.toContain("gone");
  });

  it("the trust floor keeps every tier below it out — and the whole record in at 0", async () => {
    const all = await admitted({ ...WHOLE_RECORD_SCOPE, ...trustGucs(0) });
    expect(all).toContain("unverified");
    const confirmed = await admitted({ ...WHOLE_RECORD_SCOPE, ...trustGucs("machine-confirmed") });
    expect(confirmed).not.toContain("unverified");
    expect(confirmed).toEqual(expect.arrayContaining(["machine", "human"]));
    const reviewed = await admitted({ ...WHOLE_RECORD_SCOPE, ...trustGucs("human-reviewed") });
    expect(reviewed).not.toContain("machine");
    expect(reviewed).toContain("human");
  });

  it("a trust floor that empties a section removes the section too", async () => {
    // open/live is unverified, so at human-reviewed nothing is left under `open`.
    const reviewed = await admitted({ ...WHOLE_RECORD_SCOPE, ...trustGucs("human-reviewed") });
    expect(reviewed).not.toContain("open");
  });

  /**
   * Decision 19: a surface that refuses must refuse on BOTH surfaces. A section
   * whose every descendant is taken down at the DEFAULT node scope used to
   * survive here — `admittedCte` seeded from documents without ever consulting
   * the deny seam, and a node-scoped denial of a child never denies its parent
   * — so the door's `outline` kept the named container with `child_count: 0`
   * while the site's staging pruned the directory completely. A section is
   * never admitted with no documents at all, so that zero is a positive signal
   * to an agent that something was withdrawn from a container it can name.
   */
  describe("denial empties a section, the way every other predicate does", () => {
    const deny = async (stableId: string, scope: "node" | "subtree" = "node"): Promise<void> => {
      await pool.query(
        "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, scope, reason)" +
          " VALUES ($1, 'c', $2, $3, 'test')",
        [TENANT, stableId, scope],
      );
    };
    const lift = async (): Promise<void> => {
      await pool.query("DELETE FROM takedown_denylist WHERE tenant_id = $1", [TENANT]);
    };

    it("a node-scoped denial of a section's ONLY document removes the section too", async () => {
      await deny("open/live");
      try {
        const rows = await admitted(audienceGucs(["public"]));
        expect(rows).not.toContain("open/live");
        expect(rows, "the container must not survive its last document").not.toContain("open");
      } finally {
        await lift();
      }
    });

    it("a denial two levels down removes every section that held only it", async () => {
      await deny("outer/mid/leaf");
      try {
        const rows = await admitted(audienceGucs(["public"]));
        expect(rows).not.toContain("outer/mid");
        expect(rows).not.toContain("outer");
      } finally {
        await lift();
      }
    });

    it("a REVOKED denial denies nothing", async () => {
      await deny("open/live");
      await pool.query(
        "UPDATE takedown_denylist SET revoked_ledger_id = 'r1', revoked_at = now()" +
          " WHERE tenant_id = $1 AND stable_id = $2",
        [TENANT, "open/live"],
      );
      try {
        expect(await admitted(audienceGucs(["public"]))).toEqual(
          expect.arrayContaining(["open", "open/live"]),
        );
      } finally {
        await lift();
      }
    });

    it("a section with a surviving sibling stays", async () => {
      await deny("outer/mid/leaf");
      const extra = await pool.query<{ node_id: string }>(
        "SELECT node_id FROM content_nodes WHERE tenant_id = $1 AND stable_id = 'outer'",
        [TENANT],
      );
      await pool.query(
        `INSERT INTO content_nodes (tenant_id, corpus_id, generation, stable_id, parent_id, kind,
             slug, title, audience, doc_status, trust_tier)
         VALUES ($1, 'c', 1, 'outer/other', $2, 'document', 'outer-other', 'o', '{public}', 'stable', 0)`,
        [TENANT, String(extra.rows[0]?.node_id)],
      );
      try {
        const rows = await admitted(audienceGucs(["public"]));
        expect(rows).toContain("outer");
        expect(rows).not.toContain("outer/mid");
      } finally {
        await lift();
        await pool.query("DELETE FROM content_nodes WHERE tenant_id = $1 AND stable_id = $2", [
          TENANT,
          "outer/other",
        ]);
      }
    });
  });

  it("an UNBOUND viewer admits nothing — the seam fails closed", async () => {
    const r = await scopedTxn(pool, { "app.tenant_id": TENANT }, async (client) =>
      client.query<{ stable_id: string }>(sql, [TENANT, "c"]),
    );
    expect(r.rows).toEqual([]);
  });
});

describe.runIf(adminDsn === "")("the admission seam (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
