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

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import {
  applySchema,
  buildShippedProvider,
  WHOLE_RECORD_SCOPE,
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

describe.runIf(adminDsn !== "")("gateway acceptance (HTTP, real MCP client)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;
  let dbUrl: string;
  let work: string;
  let instancePath: string;
  let client: Client;
  let server: ChildProcess;
  let port: number;
  let floor: number;
  let nearMissScore: number;

  /** Spawn the built gateway as an HTTP server (loopback, auth off) and wait for its boot line. */
  async function bootHttp(extraEnv: Record<string, string>): Promise<ChildProcess> {
    const child = spawn(process.execPath, [CLI], {
      env: { ...process.env, KSOR_INSTANCE: instancePath, KSOR_TEST_DSN: dbUrl, ...extraEnv },
    });
    let booted = "";
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error(`no boot line; stderr: ${booted}`)),
        30_000,
      );
      child.stderr?.on("data", (d: Buffer) => {
        booted += d.toString();
        if (booted.includes("serving")) {
          clearTimeout(deadline);
          resolve();
        }
      });
      child.on("exit", (code) =>
        reject(new Error(`gateway exited ${code} before serving: ${booted}`)),
      );
    });
    return child;
  }

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
        { ...VECTOR_TXN_GUCS, ...WHOLE_RECORD_SCOPE },
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

    // The one transport: stateless Streamable HTTP, on a loopback bind with
    // auth off (the dev posture). A real MCP client drives it.
    port = 30000 + Math.floor(Math.random() * 20000);
    server = await bootHttp({ KSOR_MCP_PORT: String(port), KSOR_AUTH_DISABLED: "1" });
    client = new Client({ name: "ksor-acceptance", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)),
    );
  }, 180_000);

  afterAll(async () => {
    await client?.close();
    // AWAIT the spawned gateway's exit before dropping the database: its
    // SIGTERM handler drains its own pool, so DROP ... WITH (FORCE) has no
    // live connection to terminate. Killing without waiting raced the drop
    // into a 57P01 on the gateway's connections (found live in CI,
    // 2026-08-19). SIGKILL is the fallback if graceful shutdown stalls.
    if (server !== undefined) {
      await new Promise<void>((resolve) => {
        const hard = setTimeout(() => server.kill("SIGKILL"), 5_000);
        server.once("exit", () => {
          clearTimeout(hard);
          resolve();
        });
        server.kill("SIGTERM");
      });
    }
    await pool?.end();
    if (admin !== undefined) {
      if (dbName !== undefined)
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
    if (work !== undefined) rmSync(work, { recursive: true, force: true });
  }, 60_000);

  // The era is the point of the SDK v2 upgrade, and it is INVISIBLE to the
  // MCP client above, which negotiates whichever era the server offers and
  // would stay green on the superseded one. 2026-07-28 is handshake-free:
  // every request carries the protocol version and client capabilities in the
  // `_meta` envelope and declares its method in the `Mcp-Method` header (so
  // intermediaries route without parsing the body). `server/discover` replaces
  // the `initialize` handshake and exists ONLY in this era — the pre-upgrade
  // wiring answered it "Method not found" and rejected the header with
  // "Unsupported protocol version" (both proved by probe, 2026-08-20).
  it("serves the 2026-07-28 era: server/discover answers handshake-free", async () => {
    const modern = (method: string, id: number): Promise<Response> =>
      fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": method,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        }),
      });

    const discover = await modern("server/discover", 1);
    const discoverBody = (await discover.text()).trim();
    expect(discover.status, `server/discover: ${discoverBody.slice(0, 300)}`).toBe(200);
    const discovered = JSON.parse(discoverBody) as {
      result?: { supportedVersions?: string[]; instructions?: string };
    };
    expect(
      discovered.result?.supportedVersions,
      `the era the server itself reports: ${discoverBody.slice(0, 300)}`,
    ).toContain("2026-07-28");
    // The authored identity reaches the modern surface too, not only legacy.
    expect(discovered.result?.instructions, "instance.md body is the system prompt").toContain(
      "Answer ONLY from this record",
    );

    // Tools resolve over the modern envelope — the surface actually works,
    // rather than merely completing a handshake.
    const tools = await modern("tools/list", 2);
    const toolsBody = (await tools.text()).trim();
    expect(tools.status, `tools/list: ${toolsBody.slice(0, 300)}`).toBe(200);
    const listed = JSON.parse(toolsBody) as { result?: { tools?: { name: string }[] } };
    expect((listed.result?.tools ?? []).map((t) => t.name)).toContain("search");
  });

  it("refuses subscriptions/listen rather than holding a stream for nothing", async () => {
    // v2's entry would serve `subscriptions/listen` as a long-lived SSE stream
    // that the in-flight cap cannot bound (its Response resolves at once), and
    // this record publishes no change notifications — so the stream is pure
    // cost. Refused at the door in both eras' shapes (security
    // re-verification, 2026-08-20).
    for (const headers of [
      { "content-type": "application/json" },
      {
        "content-type": "application/json",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "subscriptions/listen",
      },
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: { accept: "application/json, text/event-stream", ...headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "subscriptions/listen", params: {} }),
      });
      expect(response.status, `listen refused (headers: ${JSON.stringify(headers)})`).toBe(501);
      expect(response.headers.get("content-type") ?? "").toContain("application/json");
      expect(await response.text()).toContain("publishes no change");
    }
  });

  it("holds the in-flight slot until the work is done — the cap must bound real work", async () => {
    // The legacy leg answers over SSE and the SDK resolves its Response as soon
    // as dispatch STARTS, so an undrained door frees the slot while the embed
    // call and pg queries still run and KSOR_MAX_INFLIGHT bounds nothing —
    // concurrent searches then exhaust the pool (security re-verification,
    // 2026-08-20: found MEDIUM, fixed by draining before releasing the slot).
    //
    // Asserting the CAP is the only assertion that can see this. The obvious
    // test — read the body and check it is complete — passes identically
    // against a reverted door, because the client's own read drains the stream
    // either way (proved by the fix verification, 2026-08-20). So: a gateway
    // capped at ONE, two concurrent legacy searches, and exactly one must be
    // turned away. Undrained, both are admitted.
    const capPort = 30000 + Math.floor(Math.random() * 20000);
    const capped = await bootHttp({
      KSOR_MCP_PORT: String(capPort),
      KSOR_AUTH_DISABLED: "1",
      KSOR_MAX_INFLIGHT: "1",
    });
    try {
      const call = (): Promise<Response> =>
        fetch(`http://127.0.0.1:${capPort}/mcp`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "search", arguments: { query: IN_CORPUS_QUERY, k: 1 } },
          }),
        });
      const [first, second] = await Promise.all([call(), call()]);
      const codes = [first.status, second.status].sort((a, b) => a - b);
      // Drain both so the gateway can shut down cleanly.
      await Promise.all([first.text(), second.text()]);
      expect(
        codes,
        `both admitted ⇒ the slot was released before the work finished: ${JSON.stringify(codes)}`,
      ).toEqual([200, 503]);
    } finally {
      await new Promise<void>((resolve) => {
        const hard = setTimeout(() => capped.kill("SIGKILL"), 5_000);
        capped.once("exit", () => {
          clearTimeout(hard);
          resolve();
        });
        capped.kill("SIGTERM");
      });
    }
  }, 120_000);

  it("refuses a VALID listen — the one shape that would hang the door", async () => {
    // A listen carrying a `notifications` filter is the only request the SDK
    // would serve as a never-ending stream; with the refusal removed the door
    // never responds at all and holds the slot for the client's lifetime
    // (proved by the fix verification, 2026-08-20). The refusal is therefore
    // load-bearing for the drain above, not merely tidy — so the VALID shape
    // needs its own guard, not just the malformed one.
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": "subscriptions/listen",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "subscriptions/listen",
        params: {
          notifications: ["notifications/tools/list_changed"],
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      }),
    });
    expect(response.status, "a valid listen must be refused, not streamed").toBe(501);
    await response.text();
  });

  it("still serves 2025-era clients — the upgrade is not a cutoff", async () => {
    // `legacy: "stateless"` keeps the previous revision working, so an
    // assistant that has not moved yet is not broken by our upgrade.
    const legacy = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "legacy-probe", version: "0.0.0" },
        },
      }),
    });
    const body = await legacy.text();
    expect(legacy.status, body.slice(0, 200)).toBe(200);
    expect(body, "the legacy handshake still negotiates its own revision").toContain("2025-11-25");
  });

  it("the BUNDLED ksor binary reports its published version, not 0.0.0", async () => {
    // The regression this pins shipped in 0.0.4: the gateway read its version
    // from an env var at MODULE scope, and the CLI's static import had already
    // evaluated that module before the CLI could set the variable, so every
    // client saw serverInfo.version "0.0.0". Nothing asserted it, which is why
    // it slipped. The version now travels as an ARGUMENT — and the assertion
    // has to drive the BUNDLED binary, because the private gateway package is
    // itself 0.0.0 and could never tell the two apart.
    const ksorPkg = JSON.parse(
      readFileSync(path.resolve(CLI, "..", "..", "..", "ksor", "package.json"), "utf8"),
    ) as { version: string };
    const ksorCli = path.resolve(CLI, "..", "..", "..", "ksor", "dist", "cli.mjs");
    const port2 = 30000 + Math.floor(Math.random() * 20000);
    const child = spawn(process.execPath, [ksorCli, "serve"], {
      env: {
        ...process.env,
        KSOR_INSTANCE: instancePath,
        KSOR_TEST_DSN: dbUrl,
        KSOR_MCP_PORT: String(port2),
        KSOR_AUTH_DISABLED: "1",
      },
    });
    try {
      let booted = "";
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(() => reject(new Error(`no boot: ${booted}`)), 30_000);
        child.stderr?.on("data", (d: Buffer) => {
          booted += d.toString();
          if (booted.includes("serving")) {
            clearTimeout(deadline);
            resolve();
          }
        });
        child.on("exit", (c) => reject(new Error(`ksor serve exited ${c}: ${booted}`)));
      });
      const probe = new Client({ name: "version-probe", version: "0.0.0" });
      await probe.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port2}/mcp`)),
      );
      const reported = probe.getServerVersion()?.version;
      await probe.close();
      expect(reported, `serverInfo.version from the bundled binary`).toBe(ksorPkg.version);
      expect(reported, "the hardcoded fallback must not reach a client").not.toBe("0.0.0");
    } finally {
      child.kill("SIGTERM");
      await new Promise<void>((r) => {
        const h = setTimeout(() => {
          child.kill("SIGKILL");
          r();
        }, 5000);
        child.once("exit", () => {
          clearTimeout(h);
          r();
        });
      });
    }
  }, 120_000);

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

  it("survives the managed-Postgres suspend/resume cycle a Neon deployment lives in", async () => {
    // Neon suspends compute after ~5 minutes idle and every open connection is
    // dropped with 57P01 (admin_shutdown). Terminating every backend of this
    // database reproduces exactly that against a RUNNING gateway, driven by a
    // real MCP client — the shape a deployment meets on the FIRST request after
    // any quiet period, which for a low-traffic record is most requests.
    //
    // Walked live too (2026-08-21, Postgres 17.7 stopped and restarted under a
    // served record): the request during suspension returned "content store
    // temporarily unavailable", the first request after resume answered, and
    // the process never died. This test holds the same guarantee in CI.
    const answered = await client.callTool({
      name: "search",
      arguments: { query: IN_CORPUS_QUERY, k: 3 },
    });
    expect((answered.structuredContent as { ok: boolean }).ok, "warm baseline").toBe(true);

    // SUSPEND: drop every backend this database holds, gateway's included.
    // ASSERT that it killed something — the gateway keeps min:0 and reaps idle
    // connections, so a version of this test that terminated NOTHING would pass
    // trivially by opening a fresh connection, proving no reconnect at all.
    const killed = await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [dbName],
    );
    expect(
      killed.rowCount ?? 0,
      "nothing was terminated, so this test would prove nothing — the gateway held no connection " +
        "to drop at this moment",
    ).toBeGreaterThan(0);
    // Stronger: NOTHING survives. Whatever the next call uses, it cannot be a
    // connection that existed before the suspend, so a pass here is a real
    // reconnect and not a lucky reuse.
    const survivors = await admin.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [dbName],
    );
    expect(survivors.rows[0].n, "a surviving connection would make the reconnect untested").toBe(0);

    // RESUME is implicit — Postgres is still listening, as Neon is once the
    // compute wakes. The next call must reconnect and answer, NOT surface the
    // dead socket and NOT take the process down.
    const afterResume = await client.callTool({
      name: "search",
      arguments: { query: IN_CORPUS_QUERY, k: 3 },
    });
    const body = afterResume.structuredContent as {
      ok: boolean;
      hits: { slug: string; provenance: { generation: number } }[];
    };
    expect(
      body.ok,
      `the first call after a suspend must answer: ${JSON.stringify(afterResume.content)}`,
    ).toBe(true);
    expect(body.hits.length, "and answer with real hits, not an empty success").toBeGreaterThan(0);
    expect(body.hits[0]?.provenance.generation, "still citing the published generation").toBe(1);

    // And it keeps working — the discarded client was replaced, not reused.
    const third = await client.callTool({
      name: "search",
      arguments: { query: IN_CORPUS_QUERY, k: 3 },
    });
    expect((third.structuredContent as { ok: boolean }).ok).toBe(true);
  }, 120_000);

  it("/ready shares ONE probe however slow it is — coalescing keyed on the answer, not the start", async () => {
    // /ready is unauthenticated and outside /mcp's in-flight cap, so it is the
    // one door a flood can use to drain the pool. The cache was keyed on the
    // probe's START against a 1s TTL, so a probe SLOWER than 1s stopped being
    // shared — coalescing failed exactly when the database was unhealthy, which
    // is the only time it matters. Against a waking compute one probe per
    // second accumulated concurrent checkouts until the pool was gone
    // (round-4 review of #43, found by two reviewers independently).
    const burst = await Promise.all(
      Array.from({ length: 12 }, () => fetch(`http://127.0.0.1:${port}/ready`)),
    );
    for (const r of burst) expect(r.status, "a healthy store answers ready").toBe(200);

    // The real assertion is on the pool: twelve simultaneous probes must not
    // have opened twelve connections. With coalescing, the whole burst shares
    // at most a couple of checkouts.
    const peak = await admin.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [dbName],
    );
    expect(
      peak.rows[0].n,
      `12 concurrent /ready probes opened ${peak.rows[0].n} backends — they are not being shared`,
    ).toBeLessThan(6);
  }, 60_000);

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

  it("outline PAGES to the end — a partial list is never mistaken for the record", async () => {
    // A truncated outline with no continuation manufactures a false "not in
    // the record": the agent asks for the structure, gets a partial list, and
    // concludes a document is absent. `has_more` announced the truncation and
    // nothing let the caller past it — the only recourse was re-asking with a
    // bigger limit, and above the maximum the tail was unreachable at all
    // (round-6 review of #43).
    const whole = await client.callTool({ name: "outline", arguments: {} });
    const all = (whole.structuredContent as { nodes: { slug: string }[]; has_more: boolean }).nodes;
    expect(all.length, "the fixture needs at least two rows to page through").toBeGreaterThan(1);

    const seen: string[] = [];
    let offset = 0;
    let pages = 0;
    for (;;) {
      const page = await client.callTool({ name: "outline", arguments: { limit: 1, offset } });
      const body = page.structuredContent as {
        nodes: { slug: string }[];
        has_more: boolean;
        offset: number;
        next_offset: number | null;
      };
      expect(body.offset, "the page states where it started").toBe(offset);
      seen.push(...body.nodes.map((n) => n.slug));
      pages += 1;
      expect(pages, "paging must terminate").toBeLessThan(all.length + 5);
      if (!body.has_more) {
        expect(body.next_offset, "the last page offers no continuation").toBeNull();
        break;
      }
      expect(body.next_offset, "has_more means there IS a continuation").not.toBeNull();
      offset = body.next_offset!;
    }
    expect(seen, "paging one row at a time reconstructs the whole outline").toEqual(
      all.map((n) => n.slug),
    );
  }, 60_000);

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

  it("the http door: /health names the gate honestly, /ready probes the store, chunked POST replays", async () => {
    const health = (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as {
      abstain_gate: string;
      auth: string;
      corpus_id: string;
    };
    expect(health.abstain_gate).toContain(`floor ${floor}`);
    expect(health.auth).toBe("disabled");
    expect(health.corpus_id).toBe(TENANT);
    expect((await fetch(`http://127.0.0.1:${port}/ready`)).status).toBe(200);

    // A CHUNKED POST must work through harden's buffered replay seam — the
    // gateway once dropped the replayed body and every chunked request
    // failed (review finding, 2026-08-19).
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
  });

  it("a public bind with no auth decision refuses to boot — fail-closed", async () => {
    const badPort = 30000 + Math.floor(Math.random() * 20000);
    const env = {
      ...process.env,
      KSOR_INSTANCE: instancePath,
      KSOR_TEST_DSN: dbUrl,
      KSOR_MCP_HOST: "0.0.0.0",
      KSOR_MCP_PORT: String(badPort),
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
  }, 60_000);

  it("a missing provider API key is an ENVIRONMENT failure — exit 3, classified by type", async () => {
    // A gemini-provider instance with GEMINI_API_KEY absent: compose builds the
    // provider, buildShippedProvider throws the TYPED MissingProviderKeyError,
    // and compose maps it to exit 3 (not a refusal's exit 1) — classified by
    // type, never by message prose (review finding 6, 2026-08-19).
    const geminiInstance = path.join(work, "instance.gemini.md");
    writeFileSync(
      geminiInstance,
      `---
format: 1
name: ${TENANT}
database:
  dsn_env: KSOR_TEST_DSN
embedding:
  provider: gemini
  model: gemini-embedding-001
  dim: ${DIM}
---

# Acme Handbook

Answer ONLY from this record.
`,
    );
    const env = {
      ...process.env,
      KSOR_INSTANCE: geminiInstance,
      KSOR_TEST_DSN: dbUrl,
      KSOR_AUTH_DISABLED: "1",
    } as Record<string, string>;
    delete env["GEMINI_API_KEY"];
    delete env["PORT"];
    delete env["KSOR_MCP_HOST"];
    const spawned = spawn(process.execPath, [CLI], { env });
    const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      let stderr = "";
      spawned.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      spawned.on("exit", (code) => resolve({ code, stderr }));
    });
    expect(result.code, result.stderr).toBe(3);
    expect(result.stderr.toLowerCase()).toContain("api key");
  }, 60_000);
});

describe.runIf(adminDsn === "")("gateway acceptance (gated)", () => {
  it("skipped — set KSOR_DB_URL to run the MCP client walk", () => {
    expect(adminDsn).toBe("");
  });
});
