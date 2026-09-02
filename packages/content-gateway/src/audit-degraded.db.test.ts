/**
 * The audit-degraded signal, on the WIRE.
 *
 * `content/src/service-audit-degraded.db.test.ts` proves every serving arm
 * answers `audit: "degraded"` when its §7 row cannot be written. That is the
 * service's envelope; what an agent sees is the tool's `structuredContent`,
 * validated by the tool's OUTPUT SCHEMA — and a field the service emits that
 * the schema does not admit is dropped or refused by the SDK before any agent
 * reads it. So this drives the three handlers through real Postgres, in both
 * states, and hands each reply to the schema the registration declares for
 * it: the field must be there when the row was shed, absent when it landed,
 * and parse either way.
 *
 * Fixture is the content suite's, one document at a test dimension; the
 * grant on `retrieval_log` is the lever, as there.
 */

import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applySchema,
  contentPool,
  keyRingFromEnv,
  runIngest,
  RUNTIME_ROLE,
  type ContentInstance,
  type ServiceContext,
} from "@panaversity/ksor-content";
import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";

import {
  OUTLINE_OUTPUT,
  outlineHandler,
  READ_OUTPUT,
  readHandler,
  SEARCH_OUTPUT,
  searchHandler,
} from "./tools.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;
const TENANT = "audit-wire-corp";
const PAD = " filler content well beyond the twenty-four character servable floor.";

function unit(hot: number): number[] {
  const v = Array.from({ length: DIM }, (_, i) => (i === hot ? 1 : 0.01));
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

/** Validate through the schema the SDK would use, and answer what it objected to. */
async function issuesFrom(schema: StandardSchemaWithJSON, value: unknown): Promise<string[]> {
  const result = await schema["~standard"].validate(value);
  return "issues" in result && result.issues !== undefined
    ? result.issues.map((issue) => `${issue.path?.map(String).join(".") ?? ""}: ${issue.message}`)
    : [];
}

describe.runIf(adminDsn !== "")("the audit-degraded field on the tool surface (db)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;
  let ctx: ServiceContext;

  beforeAll(async () => {
    dbName = `ksor_audit_wire_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
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
    await runIngest(pool, TENANT, async (c) => {
      await c.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 1)",
        [TENANT],
      );
      const r = await c.query(
        `INSERT INTO content_nodes (tenant_id, generation, stable_id, corpus_id, kind, slug, title,
                                    status, audience, doc_status)
         VALUES ($1, 1, 'doc/zebra', $1, 'document', 'zebra', 'zebra', 'published',
                 ARRAY['public'], 'stable') RETURNING node_id`,
        [TENANT],
      );
      await c.query(
        `INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path,
                              content_hash, embedding_model, chunk_policy)
         VALUES ($1, 1, 'zebra:prose', $2, 'zebra:prose', 'zebra:prose', 'hash', 'fake-embed-001',
                 'heading-aware-1500-content-only-v6')`,
        [TENANT, r.rows[0].node_id],
      );
      await c.query(
        `INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content, chunk_hash,
                             labels, embedding, embedding_status, embedding_model)
         VALUES ($1, 1, 'zebra:prose', 0, $2, md5($2), '{"source_type": "prose"}', $3::vector,
                 'embedded', 'fake-embed-001')`,
        [TENANT, "Zebra compensation bands are reviewed yearly." + PAD, `[${unit(0).join(",")}]`],
      );
    });

    const instance: ContentInstance = {
      name: TENANT,
      corpusId: TENANT,
      tenantId: TENANT,
      title: "Audit wire corp",
      description: "The audit-on-the-wire record.",
      toolchain: null,
      dsnEnv: "KSOR_DB_URL",
      abstain: { vectorFloor: null, keywordFloor: null, floorDigest: null },
      textSearchConfig: "english",
      maximumResponseCharacters: 120_000,
      instructions: "",
      embeddingProvider: "fake",
      embeddingModel: "fake-embed-001",
      embeddingDim: DIM,
    };
    ctx = {
      pool,
      instance,
      ring: keyRingFromEnv("k1=test-secret"),
      instanceDigest: "audit-wire-suite",
      embedQuery: async () => unit(0),
      viewer: ["public"],
    };
  }, 120_000);

  afterAll(async () => {
    await pool?.query(`GRANT INSERT ON retrieval_log TO ${RUNTIME_ROLE}`).catch(() => undefined);
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  /** Each tool, called the way the registration calls it, with the schema it declares. */
  const tools = {
    search: {
      schema: SEARCH_OUTPUT,
      call: () => searchHandler(ctx)({ query: "zebra compensation bands", k: 5 }),
    },
    outline: { schema: OUTLINE_OUTPUT, call: () => outlineHandler(ctx)({ limit: 10 }) },
    read: { schema: READ_OUTPUT, call: () => readHandler(ctx)({ slug: "zebra" }) },
  } as const;
  const toolNames = Object.keys(tools) as (keyof typeof tools)[];

  const served = async (tool: keyof typeof tools): Promise<Record<string, unknown>> => {
    const reply = await tools[tool].call();
    expect(reply.isError, JSON.stringify(reply)).not.toBe(true);
    return reply.structuredContent as Record<string, unknown>;
  };

  describe("while the §7 row cannot be written", () => {
    beforeAll(async () => {
      await pool.query(`REVOKE INSERT ON retrieval_log FROM ${RUNTIME_ROLE}`);
    });
    afterAll(async () => {
      await pool.query(`GRANT INSERT ON retrieval_log TO ${RUNTIME_ROLE}`);
    });

    it.each(toolNames)(
      '%s emits audit: "degraded", and its output schema parses it',
      async (tool) => {
        const content = await served(tool);
        expect(content["audit"], `${tool} served ${JSON.stringify(content)}`).toBe("degraded");
        expect(await issuesFrom(tools[tool].schema, content), `${tool}'s schema objected`).toEqual(
          [],
        );
      },
    );
  });

  describe("once the row lands normally", () => {
    it.each(toolNames)(
      "%s emits no audit field, and its output schema parses that too",
      async (tool) => {
        const content = await served(tool);
        expect(content["audit"], `${tool} served ${JSON.stringify(content)}`).toBeUndefined();
        expect(await issuesFrom(tools[tool].schema, content), `${tool}'s schema objected`).toEqual(
          [],
        );
      },
    );

    it.each(toolNames)(
      "%s's schema admits only the one value the service can emit",
      async (tool) => {
        // The field is an enum of ONE member on purpose: "degraded" is a state
        // the agent must notice, and anything else on the wire is a bug wearing
        // the field's name.
        const content = await served(tool);
        const issues = await issuesFrom(tools[tool].schema, { ...content, audit: "landed" });
        expect(issues.join("\n"), `${tool}'s schema accepted audit: "landed"`).toContain("audit");
      },
    );
  });
});
