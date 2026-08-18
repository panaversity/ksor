/**
 * The gateway acceptance — the product, driven the way a user's agent
 * drives it: a REAL MCP client spawning the BUILT gateway binary over
 * stdio (run `pnpm build` first; the suite spawns dist/cli.mjs), against a
 * live Postgres corpus embedded by the fake provider, with an abstention
 * floor the suite CALIBRATES itself (midpoint of the in/out-of-corpus
 * separation — the paste-value method in miniature). Includes the question
 * whose only passing answer is the abstention, and the HTTP door's
 * fail-closed boot refusal.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  applySchema,
  buildShippedProvider,
  contentPool,
  embedInput,
  embedIntent,
  runIngest,
  runRead,
  topOneScore,
  vectorLiteral,
  VECTOR_TXN_GUCS,
  type EmbeddingProvider,
} from "@panaversity/ksor-content";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;
const TENANT = "acme-handbook";
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.mjs");

const DOCS = [
  {
    stableId: "policies/compensation",
    slug: "compensation",
    title: "Compensation bands",
    content:
      "Zebra compensation bands are reviewed every fiscal year by the compensation committee and published to all staff.",
  },
  {
    stableId: "onboarding/checklist",
    slug: "onboarding",
    title: "Onboarding checklist",
    content:
      "New engineers complete the onboarding checklist: accounts, laptop setup, security training, and a first pull request.",
  },
] as const;

const IN_CORPUS_QUERY = "when are zebra compensation bands reviewed";
/** The question whose only passing answer is the abstention. */
const OOC_QUERY = "what does quantum blockchain weather forecasting cost";
/** Scope-adjacent: shares tokens with the corpus, answered by nothing in it. */
const NEAR_MISS_QUERY = "what is the zebra parental leave policy in belgium";

describe.runIf(adminDsn !== "")("gateway acceptance (stdio, real MCP client)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;
  let dbUrl: string;
  let work: string;
  let instancePath: string;
  let client: Client;
  let floor: number;
  let nearMissScore: number;

  beforeAll(async () => {
    dbName = `ksor_g_${randomBytes(4).toString("hex")}`;
    admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminDsn);
    url.pathname = `/${dbName}`;
    dbUrl = url.toString();
    pool = contentPool(dbUrl, 4);
    await applySchema(pool, DIM);
    await pool.query(
      "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', $1)",
      [TENANT],
    );

    const provider: EmbeddingProvider = buildShippedProvider("fake", { apiKey: null, dim: DIM });
    await runIngest(pool, TENANT, async (c) => {
      await c.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 1)",
        [TENANT],
      );
      for (const doc of DOCS) {
        const node = await c.query(
          `INSERT INTO content_nodes (tenant_id, generation, stable_id, kind, slug, title)
           VALUES ($1, 1, $2, 'document', $3, $4) RETURNING node_id`,
          [TENANT, doc.stableId, doc.slug, doc.title],
        );
        await c.query(
          `INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path,
                                content_hash, embedding_model, chunk_policy)
           VALUES ($1, 1, $2, $3, $4, $2, 'hash', 'fake-embed-001', 'heading-aware-1500-content-only-v5')`,
          [TENANT, `${doc.slug}:prose`, node.rows[0].node_id, doc.title],
        );
        // Embedded exactly as ingest embeds: the embed_input recipe through
        // the framework contract (normalize + count + degenerate checks).
        const [vector] = await embedIntent([embedInput(doc.title, "", doc.content)], {
          provider,
          intent: "document",
        });
        await c.query(
          `INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content, chunk_hash,
                               labels, embedding, embedding_status, embedding_model)
           VALUES ($1, 1, $2, 0, $3, md5($3), '{"source_type": "prose"}', $4, 'embedded', 'fake-embed-001')`,
          [TENANT, `${doc.slug}:prose`, doc.content, vectorLiteral(vector ?? [])],
        );
      }
    });

    // Calibrate the floor the way calibrate.py does, in miniature: score
    // both probes through the REAL gate signal, take the midpoint.
    const score = async (query: string): Promise<number | null> => {
      const [qv] = await embedIntent([query], { provider, intent: "query" });
      return runRead(
        pool,
        TENANT,
        (c) =>
          topOneScore(
            c,
            { tenantId: TENANT, corpusId: TENANT, kinds: null, pinnedGeneration: null },
            qv ?? [],
          ),
        VECTOR_TXN_GUCS,
      );
    };
    const inScore = await score(IN_CORPUS_QUERY);
    const oocScore = await score(OOC_QUERY);
    nearMissScore = (await score(NEAR_MISS_QUERY)) ?? 0;
    expect(inScore, "in-corpus probe must score").not.toBeNull();
    expect(oocScore, "ooc probe must score").not.toBeNull();
    expect(
      (inScore ?? 0) - (oocScore ?? 0),
      `separation too small: in=${inScore} ooc=${oocScore}`,
    ).toBeGreaterThan(0.05);
    floor = Math.round((((inScore ?? 0) + (oocScore ?? 0)) / 2) * 1000) / 1000;

    work = mkdtempSync(path.join(tmpdir(), "ksor-gw-"));
    instancePath = path.join(work, "instance.md");
    writeFileSync(
      instancePath,
      `---
format: 1
name: ${TENANT}
database:
  dsn_env: KSOR_TEST_DSN
embedding:
  provider: fake
  model: fake-embed-001
  dim: ${DIM}
retrieval:
  vector_floor: ${floor} # calibrated in-test, midpoint method
---

# Acme Handbook

Answer ONLY from this record. Abstention is a correct answer.
`,
    );

    client = new Client({ name: "ksor-acceptance", version: "0.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [CLI],
        env: {
          ...process.env,
          KSOR_INSTANCE: instancePath,
          KSOR_TEST_DSN: dbUrl,
          KSOR_MCP_TRANSPORT: "stdio",
        },
        stderr: "pipe",
      }),
    );
  }, 180_000);

  afterAll(async () => {
    await client?.close();
    await pool?.end();
    if (admin !== undefined) {
      if (dbName !== undefined)
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
    if (work !== undefined) rmSync(work, { recursive: true, force: true });
  }, 60_000);

  it("serves the instance body as the server's instructions", () => {
    expect(client.getInstructions(), "instance.md body is the agent-surface prompt").toContain(
      "Answer ONLY from this record",
    );
  });

  it("lists the search tool, read-only annotated", async () => {
    const tools = await client.listTools();
    const search = tools.tools.find((t) => t.name === "search");
    expect(search, JSON.stringify(tools.tools.map((t) => t.name))).toBeDefined();
    expect(search?.annotations?.readOnlyHint).toBe(true);
  });

  it("answers an in-corpus question with cited passages and a snapshot", async () => {
    const result = await client.callTool({
      name: "search",
      arguments: { query: IN_CORPUS_QUERY, k: 5 },
    });
    const body = result.structuredContent as {
      ok: boolean;
      hits: { slug: string; provenance: { generation: number; stable_id: string } }[];
      snapshot: { token: string; generation: number };
    };
    expect(body.ok, JSON.stringify(body)).toBe(true);
    expect(body.hits[0]?.slug).toBe("compensation");
    expect(body.hits[0]?.provenance.generation, "the citation carries the generation").toBe(1);
    expect(body.snapshot.token.length).toBeGreaterThan(20);
  });

  it("outline lists the record; read reconstructs a document byte-exact with provenance", async () => {
    const outline = await client.callTool({ name: "outline", arguments: {} });
    const nodes = (outline.structuredContent as { nodes: { slug: string }[] }).nodes;
    expect(nodes.map((n) => n.slug).sort(), JSON.stringify(nodes)).toEqual([
      "compensation",
      "onboarding",
    ]);

    const read = await client.callTool({ name: "read", arguments: { slug: "compensation" } });
    const doc = read.structuredContent as {
      text: string;
      title: string;
      provenance: { generation: number; stable_id: string };
    };
    expect(doc.text, "byte-exact reconstruction").toBe(DOCS[0].content);
    expect(doc.title).toBe("Compensation bands");
    expect(doc.provenance.stable_id).toBe("policies/compensation");
    expect(doc.provenance.generation).toBe(1);

    const missing = await client.callTool({ name: "read", arguments: { slug: "nonexistent" } });
    expect(missing.isError, JSON.stringify(missing)).toBe(true);
    expect(JSON.stringify(missing.content)).toContain("outline");
  });

  it("abstains on the out-of-corpus question — the only passing answer", async () => {
    const result = await client.callTool({
      name: "search",
      arguments: { query: OOC_QUERY, k: 5 },
    });
    const body = result.structuredContent as { ok: boolean; reason?: string; hits: unknown[] };
    expect(body.ok, `floor=${floor}: ${JSON.stringify(body)}`).toBe(false);
    expect(body.reason).toBe("abstained");
    expect(body.hits).toEqual([]);
  });

  it("a scope-adjacent near-miss gets exactly the answer the calibrated floor decides", async () => {
    const result = await client.callTool({
      name: "search",
      arguments: { query: NEAR_MISS_QUERY, k: 5 },
    });
    const body = result.structuredContent as { ok: boolean; reason?: string };
    // The assertion is tied to the calibration, so it CAN fail (a vacuous
    // typeof check shipped here once — review finding 2026-08-19): the
    // gate must decide this query exactly as its measured score against
    // the ratified floor says, and with the token-bag fake the shared
    // tokens ("zebra", "policy") still land below the midpoint floor.
    const expectAbstain = nearMissScore < floor;
    expect(
      body.ok,
      `near-miss score ${nearMissScore} vs floor ${floor}: ${JSON.stringify(body)}`,
    ).toBe(!expectAbstain);
    expect(expectAbstain, "the near-miss must actually probe the gate (below the floor)").toBe(
      true,
    );
  });

  it("the http door refuses to boot with no auth decision (fail-closed), and boots with the explicit opt-out", async () => {
    const port = 30000 + Math.floor(Math.random() * 20000);
    const env = {
      ...process.env,
      KSOR_INSTANCE: instancePath,
      KSOR_TEST_DSN: dbUrl,
      KSOR_MCP_TRANSPORT: "http",
      KSOR_MCP_PORT: String(port),
    } as Record<string, string>;
    delete env["KSOR_AUTH_DISABLED"];
    delete env["PORT"];

    const refused = spawn(process.execPath, [CLI], { env });
    const refusal = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      let stderr = "";
      refused.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      refused.on("exit", (code) => resolve({ code, stderr }));
    });
    expect(refusal.code, refusal.stderr).toBe(1);
    expect(refusal.stderr.toLowerCase()).toContain("auth");

    const server = spawn(process.execPath, [CLI], {
      env: { ...env, KSOR_AUTH_DISABLED: "1" },
    });
    try {
      let booted = "";
      server.stderr.on("data", (d: Buffer) => (booted += d.toString()));
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(
          () => reject(new Error(`no boot line; stderr: ${booted}`)),
          30_000,
        );
        const poll = setInterval(() => {
          if (booted.includes("serving")) {
            clearTimeout(deadline);
            clearInterval(poll);
            resolve();
          }
        }, 100);
      });
      const health = (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as {
        abstain_gate: string;
        auth: string;
      };
      expect(health.abstain_gate).toContain(`floor ${floor}`);
      expect(health.auth).toBe("disabled");
      const ready = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(ready.status).toBe(200);

      // The full MCP round trip over stateless Streamable HTTP — the same
      // protocol a hosted client speaks.
      const httpClient = new Client({ name: "ksor-http-acceptance", version: "0.0.0" });
      await httpClient.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)),
      );
      try {
        const result = await httpClient.callTool({
          name: "search",
          arguments: { query: IN_CORPUS_QUERY, k: 3 },
        });
        const body = result.structuredContent as { ok: boolean; hits: { slug: string }[] };
        expect(body.ok, JSON.stringify(body)).toBe(true);
        expect(body.hits[0]?.slug).toBe("compensation");
      } finally {
        await httpClient.close();
      }

      // A CHUNKED POST must work through harden's buffered replay seam —
      // the gateway once dropped the replayed body and every chunked
      // request failed (review finding, 2026-08-19).
      const initialize = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "chunked-probe", version: "0" },
        },
      });
      const chunked = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(initialize));
            controller.close();
          },
        }),
        duplex: "half",
      } as RequestInit);
      expect(chunked.status, await chunked.text().catch(() => "")).toBe(200);
    } finally {
      server.kill();
    }
  }, 60_000);
});

describe.runIf(adminDsn === "")("gateway acceptance (gated)", () => {
  it("skipped — set KSOR_DB_URL to run the MCP client walk", () => {
    expect(adminDsn).toBe("");
  });
});
