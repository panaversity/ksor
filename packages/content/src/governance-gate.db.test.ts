/**
 * The two states the site refuses to BUILD in, which the door used to SERVE in.
 *
 * Both were reachable through ordinary operator actions and neither showed as
 * an error anywhere: the schema gate passed, /ready was green, and the boot
 * line reported the audience model as enforced while restricted documents went
 * out in full (round-5 review of #43).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest } from "./db.js";
import { assertGovernanceServable, GovernanceGateError } from "./governance-gate.js";
import { grantIngest } from "./grant.js";
import { applySchema } from "./schema.js";
import type { ContentInstance } from "./instance.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_governance_gate";
const TENANT = "gate-corp";

const instanceWith = (audiences: string[]): ContentInstance =>
  ({
    name: TENANT,
    corpusId: TENANT,
    tenantId: TENANT,
    dsnEnv: "KSOR_DB_URL",
    abstain: { vectorFloor: null, keywordFloor: null },
    maximumResponseCharacters: 120_000,
    instructions: "",
    audiences,
    defaultVisibility: audiences.length > 0 ? "public" : null,
    embeddingProvider: "fake",
    embeddingModel: "fake-embed-001",
    embeddingDim: 1536,
  }) as ContentInstance;

describe.runIf(adminDsn !== "")("the governance boot gate (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;

  /** Put one generation in place, with control over what the record remembers. */
  const seed = async (opts: {
    generation: number;
    schemaVersion: string | null;
    visibility: string | null;
  }): Promise<void> => {
    await runIngest(pool, TENANT, async (client) => {
      await client.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $2, $3) " +
          "ON CONFLICT (tenant_id, corpus_id) DO UPDATE SET active_generation = $3",
        [TENANT, TENANT, opts.generation],
      );
      await client.query(
        "INSERT INTO ingestion_runs (tenant_id, corpus_id, generation, state, source_commit," +
          " instance_bundle_sha256, schema_version) VALUES ($1, $2, $3, 'active', 'seed', 'seed', $4) " +
          "ON CONFLICT (tenant_id, corpus_id, generation) DO UPDATE SET schema_version = $4",
        [TENANT, TENANT, opts.generation, opts.schemaVersion],
      );
      await client.query(
        "INSERT INTO content_nodes (tenant_id, corpus_id, generation, stable_id, slug, title, kind, position, visibility)" +
          " VALUES ($1, $1, $2, $3, $4, 'Doc', 'document', 0, $5)",
        [
          TENANT,
          opts.generation,
          `knowledge/doc-${opts.generation}.md`,
          `doc-${opts.generation}`,
          opts.visibility,
        ],
      );
    });
  };

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

  it("REFUSES a generation built before governance reached the node row", async () => {
    // The upgrade path: 2.1 -> 2.2 added `visibility` and could not backfill
    // it, so every carried-forward node has NULL — which the predicate reads
    // as default_visibility, the widest tier.
    await seed({ generation: 1, schemaVersion: null, visibility: null });
    await expect(
      assertGovernanceServable(pool, instanceWith(["public", "internal"])),
    ).rejects.toThrow(GovernanceGateError);
    await expect(
      assertGovernanceServable(pool, instanceWith(["public", "internal"])),
    ).rejects.toThrow(/ksor ingest/);
  });

  it("REFUSES a schema_version older than the governance columns", async () => {
    await seed({ generation: 2, schemaVersion: "2.1", visibility: null });
    await expect(
      assertGovernanceServable(pool, instanceWith(["public", "internal"])),
    ).rejects.toThrow(/older than 2\.2/);
  });

  it("ACCEPTS a generation built at or after the governance columns", async () => {
    await seed({ generation: 3, schemaVersion: "2.4", visibility: "public" });
    await expect(
      assertGovernanceServable(pool, instanceWith(["public", "internal"])),
    ).resolves.toBeUndefined();
  });

  it("REFUSES a document declaring visibility: when the record declares no model", async () => {
    // The site refuses to BUILD here by name (ksor-visibility-without-audiences);
    // the door served it in full to everyone.
    await seed({ generation: 4, schemaVersion: "2.4", visibility: "internal" });
    await expect(assertGovernanceServable(pool, instanceWith([]))).rejects.toThrow(
      /declare visibility:, but instance\.md declares no audiences/,
    );
  });

  it("ACCEPTS the level-0 shape: no model, and no document claims one", async () => {
    await seed({ generation: 5, schemaVersion: "2.4", visibility: null });
    await expect(assertGovernanceServable(pool, instanceWith([]))).resolves.toBeUndefined();
  });

  it("ACCEPTS a record with no active generation — that is a new project", async () => {
    await runIngest(pool, TENANT, (client) =>
      client.query("UPDATE corpora SET active_generation = 0 WHERE tenant_id = $1", [TENANT]),
    );
    await expect(
      assertGovernanceServable(pool, instanceWith(["public", "internal"])),
    ).resolves.toBeUndefined();
  });
});

describe.runIf(adminDsn === "")("the governance boot gate (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
