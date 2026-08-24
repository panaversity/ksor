/**
 * The states the door refuses to BOOT in, and `ksor ingest` refuses to publish
 * (decision 19: a surface that refuses must refuse on BOTH surfaces).
 *
 * Each was reachable through ordinary operator actions and showed as an error
 * nowhere: the schema gate passed, /ready was green, and restricted documents
 * went out in full (round-5 review of #43). Schema 2.5 adds the ledger states
 * (record spec §5): a row no ledger entry accounts for refuses; a row whose
 * entry never merged is reported.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest } from "./db.js";
import { assertGovernanceServable, GovernanceGateError } from "./governance-gate.js";
import { grantIngest } from "./grant.js";
import { instanceOf } from "./ingest/fixtures/record-fixture.js";
import { applySchema } from "./schema.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_governance_gate";
const TENANT = "gate-corp";

describe.runIf(adminDsn !== "")("the governance boot gate (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;
  const instance = instanceOf(TENANT, TENANT);

  /** Put one generation in place, with control over what the record remembers. */
  const seed = async (opts: {
    generation: number;
    schemaVersion: string | null;
    ledgerIds?: readonly string[] | null;
  }): Promise<void> => {
    await runIngest(pool, TENANT, async (client) => {
      await client.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $2, $3) " +
          "ON CONFLICT (tenant_id, corpus_id) DO UPDATE SET active_generation = $3",
        [TENANT, TENANT, opts.generation],
      );
      await client.query(
        "INSERT INTO ingestion_runs (tenant_id, corpus_id, generation, state, source_commit," +
          " instance_bundle_sha256, schema_version, ledger_ids) VALUES ($1, $2, $3, 'active', 'seed', 'seed', $4, $5::text[]) " +
          "ON CONFLICT (tenant_id, corpus_id, generation) DO UPDATE SET schema_version = $4, ledger_ids = $5::text[]",
        [TENANT, TENANT, opts.generation, opts.schemaVersion, opts.ledgerIds ?? null],
      );
      await client.query(
        "INSERT INTO content_nodes (tenant_id, corpus_id, generation, stable_id, slug, title, kind, position, audience)" +
          " VALUES ($1, $1, $2, $3, $4, 'Doc', 'document', 0, ARRAY['public'])" +
          // Several rows re-seed the SAME generation to vary only what the run
          // remembers; the node is identical each time, so re-seeding it is a
          // no-op rather than a duplicate-key error.
          " ON CONFLICT DO NOTHING",
        [TENANT, opts.generation, `knowledge/doc-${opts.generation}`, `doc-${opts.generation}`],
      );
    });
  };

  const deny = async (
    stableId: string,
    ledgerId: string | null,
    revokedAt: string | null = null,
  ): Promise<void> => {
    await runIngest(pool, TENANT, (client) =>
      client.query(
        "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, scope, reason, ledger_id, actor, revoked_at)" +
          " VALUES ($1, $1, $2, 'node', 'seed', $3, 'human:ciso', $4::timestamptz)",
        [TENANT, stableId, ledgerId, revokedAt],
      ),
    );
  };
  const clearDenials = (): Promise<unknown> =>
    runIngest(pool, TENANT, (client) =>
      client.query("DELETE FROM takedown_denylist WHERE tenant_id = $1", [TENANT]),
    );

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
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("REFUSES a generation built before the profile reached the node row", async () => {
    await seed({ generation: 1, schemaVersion: null });
    await expect(assertGovernanceServable(pool, instance)).rejects.toThrow(GovernanceGateError);
    await expect(assertGovernanceServable(pool, instance)).rejects.toThrow(/ksor ingest/);
  });

  it("REFUSES a schema_version older than 2.5 — the 2.4 shape carries a ranked tier, not a list", async () => {
    await seed({ generation: 2, schemaVersion: "2.4" });
    await expect(assertGovernanceServable(pool, instance)).rejects.toThrow(/older than 2\.5/);
  });

  it("ACCEPTS a generation built at or after 2.5", async () => {
    await seed({ generation: 3, schemaVersion: "2.5", ledgerIds: [] });
    await expect(assertGovernanceServable(pool, instance)).resolves.toBeUndefined();
  });

  it("REFUSES a denial row with no ledger entry (ksor-takedown-unledgered)", async () => {
    await deny("knowledge/doc-3", null);
    try {
      await expect(assertGovernanceServable(pool, instance)).rejects.toThrow(
        /^ksor-takedown-unledgered/,
      );
      await expect(assertGovernanceServable(pool, instance)).rejects.toThrow(
        /ksor migrate --write/,
      );
    } finally {
      await clearDenials();
    }
  });

  it("REPORTS, never refuses, a row whose ledger entry the ingested ledger does not contain", async () => {
    await seed({ generation: 3, schemaVersion: "2.5", ledgerIds: ["2026-08-25T10:00:00Z-aaaaaa"] });
    await deny("knowledge/doc-3", "2026-08-25T11:00:00Z-bbbbbb");
    const lines: string[] = [];
    try {
      await expect(
        assertGovernanceServable(pool, instance, undefined, { report: (l) => lines.push(l) }),
      ).resolves.toBeUndefined();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(
        /^ksor-takedown-unmerged: knowledge\/doc-3 .*`2026-08-25T11:00:00Z-bbbbbb`/,
      );
      expect(lines[0]).toMatch(/--revoke 2026-08-25T11:00:00Z-bbbbbb/);
    } finally {
      await clearDenials();
    }
  });

  it("says nothing about a row the ledger accounts for, revoked or in force", async () => {
    await seed({
      generation: 3,
      schemaVersion: "2.5",
      ledgerIds: ["2026-08-25T10:00:00Z-aaaaaa", "2026-08-25T10:00:00Z-cccccc"],
    });
    await deny("knowledge/doc-3", "2026-08-25T10:00:00Z-aaaaaa");
    await deny("knowledge/gone", "2026-08-25T10:00:00Z-cccccc", "2026-08-25T12:00:00Z");
    const lines: string[] = [];
    try {
      await expect(
        assertGovernanceServable(pool, instance, undefined, { report: (l) => lines.push(l) }),
      ).resolves.toBeUndefined();
      expect(lines).toEqual([]);
    } finally {
      await clearDenials();
    }
  });

  it("a refused ingest must not have MOVED the active pointer", () => {
    // Ordering, asserted on the source because it is an ordering: the command
    // builds with `flip: false`, runs the gate, and only then flips (found live
    // against a Neon database, 2026-08-21).
    const src = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "commands.ts"),
      "utf8",
    );
    const ingest = src.slice(src.indexOf("buildGeneration(pool, instance, {"));
    const build = ingest.indexOf("flip: false,");
    const gate = ingest.indexOf("assertGovernanceServable(pool, instance, report.generation");
    const doFlip = ingest.indexOf("flip(client, {");
    expect(build, "the build must not flip").toBeGreaterThan(-1);
    expect(gate, "the gate must run").toBeGreaterThan(-1);
    expect(doFlip, "the command must flip itself").toBeGreaterThan(-1);
    expect(gate, "gate runs after the build").toBeGreaterThan(build);
    expect(doFlip, "and the flip runs after the gate").toBeGreaterThan(gate);
  });

  it("ACCEPTS a record with no active generation — that is a new project", async () => {
    await runIngest(pool, TENANT, (client) =>
      client.query("UPDATE corpora SET active_generation = 0 WHERE tenant_id = $1", [TENANT]),
    );
    await expect(assertGovernanceServable(pool, instance)).resolves.toBeUndefined();
  });
});

describe.runIf(adminDsn === "")("the governance boot gate (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});

/**
 * A takedown that has stopped applying: `takedown_denylist` records a
 * `stable_id`, and the serving seam matches those rows against nodes in the
 * SERVING generation. A row whose id no longer exists denies nothing —
 * silently, on both surfaces (issue #85). Path is identity (decision 26), so
 * an ordinary rename of a denied FILE breaks a `scope=node` match; the
 * checker's `ksor-takedown-dangling` catches it in the tree, and this catches
 * it at the door.
 */
describe.runIf(adminDsn !== "")("a takedown that no longer resolves (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;
  const DB2 = "ksor_gate_takedown";
  const T = "gatetd";
  const instance = instanceOf(T, T);

  const putGeneration = async (generation: number, stableId: string): Promise<void> => {
    await runIngest(pool, T, async (client) => {
      await client.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1,$1,$2) " +
          "ON CONFLICT (tenant_id, corpus_id) DO UPDATE SET active_generation = $2",
        [T, generation],
      );
      await client.query(
        "INSERT INTO ingestion_runs (tenant_id, corpus_id, generation, state, source_commit," +
          " instance_bundle_sha256, schema_version, ledger_ids) VALUES ($1,$1,$2,'active','seed','seed','2.5', ARRAY['L1']) " +
          "ON CONFLICT (tenant_id, corpus_id, generation) DO UPDATE SET schema_version = '2.5'",
        [T, generation],
      );
      await client.query(
        "INSERT INTO content_nodes (tenant_id, corpus_id, generation, stable_id, slug, title, kind, position, audience)" +
          " VALUES ($1,$1,$2,$3,'doc','Doc','document',0,ARRAY['public'])",
        [T, generation, stableId],
      );
    });
  };

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB2} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB2}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB2}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, 1536);
    await grantIngest(pool, T);
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB2} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("serves happily while the denial still matches something", async () => {
    await putGeneration(1, "knowledge/legal/notice");
    await runIngest(pool, T, async (client) => {
      await client.query(
        "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, scope, reason, ledger_id, actor)" +
          " VALUES ($1,$1,'knowledge/legal/notice','node','court order','L1','human:ciso')",
        [T],
      );
    });
    await expect(assertGovernanceServable(pool, instance)).resolves.toBeUndefined();
  }, 60_000);

  it("REFUSES once the denied document has been renamed out from under the row", async () => {
    await putGeneration(2, "knowledge/legal/notice-2024");
    await expect(assertGovernanceServable(pool, instance)).rejects.toBeInstanceOf(
      GovernanceGateError,
    );
    await expect(assertGovernanceServable(pool, instance)).rejects.toThrow(
      /knowledge\/legal\/notice/,
    );
  }, 60_000);

  it("names the remedy, both halves of it — record the removal, or deny the new path", async () => {
    await expect(assertGovernanceServable(pool, instance)).rejects.toThrow(/--removed/);
    await expect(assertGovernanceServable(pool, instance)).rejects.toThrow(/the new stable_id/);
  }, 60_000);

  it("refuses the GENERATION BEING BUILT, so ingest stops before the flip", async () => {
    await expect(assertGovernanceServable(pool, instance, 2)).rejects.toBeInstanceOf(
      GovernanceGateError,
    );
  }, 60_000);

  it("goes quiet again once the row is REVOKED — the row stays, revoked, and denies nothing", async () => {
    await runIngest(pool, T, async (client) => {
      await client.query(
        "UPDATE takedown_denylist SET revoked_ledger_id = 'L2', revoked_at = now() WHERE tenant_id = $1",
        [T],
      );
    });
    await expect(assertGovernanceServable(pool, instance)).resolves.toBeUndefined();
  }, 60_000);
});
