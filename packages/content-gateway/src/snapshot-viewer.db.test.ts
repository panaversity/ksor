/**
 * A snapshot token belongs to the VIEWER it was minted for — proved from the
 * door, with two real servers.
 *
 * A pin exists so a citation keeps resolving to the same bytes. Without the
 * viewer in the binding it does something else as well: a token minted for a
 * public caller re-serves that generation to an internal one, and back — and a
 * follow-up `read` is the one route where a value the CALLER holds decides how
 * much of the record they are shown.
 *
 * `lib/snapshot.ts` folds the viewer into the payload digest, so this suite's
 * job is the END of that wire: that the door actually passes its configured
 * viewer into the mint AND into the validate, on two processes that differ in
 * nothing else. Both share one `instance.md` and one signing key, so the viewer
 * list is the only variable — with an ephemeral per-process key the token would
 * be refused by the other door for a reason that has nothing to do with
 * audiences, and this suite would pass while proving nothing.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const TENANT = "viewer-corp";
const here = path.dirname(fileURLToPath(import.meta.url));
const GATEWAY_CLI = path.resolve(here, "..", "dist", "cli.mjs");
const KSOR_CLI = path.resolve(here, "..", "..", "ksor", "dist", "cli.mjs");
/** Identical across both doors: the viewer must be the ONLY difference. */
const SNAPSHOT_KEYS = "v1=a-fixed-secret-for-the-viewer-binding-suite";
const QUERY = "what does the record say about compensation review";

const doc = (title: string, audience: string, body: string): string =>
  [
    "---",
    "type: Document",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(`${title}, in one sentence.`)}`,
    "status: stable",
    'generated: { by: "fixture/1", at: 2026-08-20T09:00:00Z }',
    "ksor:",
    `  audience: [${audience}]`,
    '  approval: { by: "human:cfo", at: 2026-08-21T09:00:00Z }',
    "---",
    "",
    body,
    "",
  ].join("\n");

describe.runIf(adminDsn !== "")("a snapshot token is bound to its viewer (db)", () => {
  let admin: pg.Pool;
  let dbName: string;
  let work: string;
  let instancePath: string;
  let publicDoor: ChildProcess;
  let internalDoor: ChildProcess;
  let publicClient: Client;
  let internalClient: Client;

  const run = (args: string[], env: Record<string, string>): Promise<void> =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [KSOR_CLI, ...args], {
        env: { ...process.env, ...env },
      });
      let stderr = "";
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`${args[0]} → ${code}\n${stderr}`)),
      );
    });

  const boot = async (port: number, extra: Record<string, string>): Promise<ChildProcess> => {
    const child = spawn(process.execPath, [GATEWAY_CLI], {
      env: {
        ...process.env,
        KSOR_INSTANCE: instancePath,
        KSOR_MCP_PORT: String(port),
        KSOR_AUTH: "disabled-local",
        KSOR_SNAPSHOT_KEYS: SNAPSHOT_KEYS,
        ...extra,
      },
    });
    let booted = "";
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`no boot line: ${booted}`)), 40_000);
      child.stderr?.on("data", (d: Buffer) => {
        booted += d.toString();
        if (booted.includes("serving")) {
          clearTimeout(deadline);
          resolve();
        }
      });
      child.on("exit", (code) => reject(new Error(`gateway exited ${code}: ${booted}`)));
    });
    return child;
  };

  const connect = async (port: number): Promise<Client> => {
    const client = new Client({ name: "ksor-viewer-suite", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)),
    );
    return client;
  };

  const stop = async (child: ChildProcess | undefined): Promise<void> => {
    if (child === undefined) return;
    await new Promise<void>((resolve) => {
      const hard = setTimeout(() => child.kill("SIGKILL"), 5_000);
      child.once("exit", () => {
        clearTimeout(hard);
        resolve();
      });
      child.kill("SIGTERM");
    });
  };

  let publicPort: number;
  let internalPort: number;

  beforeAll(async () => {
    dbName = `ksor_viewer_${randomBytes(4).toString("hex")}`;
    admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminDsn);
    url.pathname = `/${dbName}`;
    const dsn = url.toString();

    work = mkdtempSync(path.join(tmpdir(), "ksor-viewer-"));
    mkdirSync(path.join(work, "knowledge"), { recursive: true });
    mkdirSync(path.join(work, ".ksor"), { recursive: true });
    instancePath = path.join(work, "instance.md");
    writeFileSync(
      instancePath,
      `---\nformat: 2\nname: ${TENANT}\ntitle: Viewer corp\ndescription: The viewer-binding record.\ndatabase:\n  dsn_env: KSOR_TEST_DSN\nembedding:\n  provider: fake\n---\n\nAnswer only from the record.\n`,
    );
    writeFileSync(
      path.join(work, ".ksor", "governance.yaml"),
      'version: "0.1"\naudiences:\n  internal:\n    description: Employees\napproval_authorities:\n  - actors: [human:cfo]\ntakedown_authorities:\n  actors: [human:ciso]\n',
    );
    writeFileSync(
      path.join(work, "knowledge", "public-bands.md"),
      doc(
        "Compensation bands",
        "public",
        "Compensation bands are reviewed every fiscal year by the compensation committee and published to all staff.",
      ),
    );
    writeFileSync(
      path.join(work, "knowledge", "internal-bands.md"),
      doc(
        "Compensation review notes",
        "internal",
        "The compensation committee's internal review notes record which bands moved and why, before publication.",
      ),
    );

    const env = { KSOR_TEST_DSN: dsn, KSOR_DB_URL: dsn };
    await run(["schema", "--instance", instancePath, "--apply"], env);
    await run(["grant", "--instance", instancePath], env);
    await run(["build", "--instance", instancePath, "--allow-unverifiable-ledger"], env);
    await run(["ingest", "--instance", instancePath, "--flip"], env);

    publicPort = 34000 + Math.floor(Math.random() * 2000);
    internalPort = publicPort + 1;
    publicDoor = await boot(publicPort, { KSOR_TEST_DSN: dsn });
    internalDoor = await boot(internalPort, {
      KSOR_TEST_DSN: dsn,
      KSOR_AUDIENCE: "public,internal",
    });
    publicClient = await connect(publicPort);
    internalClient = await connect(internalPort);
  }, 240_000);

  afterAll(async () => {
    await publicClient?.close();
    await internalClient?.close();
    await stop(publicDoor);
    await stop(internalDoor);
    if (admin !== undefined) {
      if (dbName !== undefined)
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
    if (work !== undefined) rmSync(work, { recursive: true, force: true });
  }, 60_000);

  const mintFrom = async (client: Client): Promise<string> => {
    const reply = await client.callTool({ name: "search", arguments: { query: QUERY, k: 5 } });
    const body = reply.structuredContent as {
      ok: boolean;
      snapshot: { token: string } | null;
    };
    expect(body.ok, JSON.stringify(reply.content)).toBe(true);
    expect(body.snapshot?.token, "a served search pins a generation").toBeTruthy();
    return body.snapshot!.token;
  };

  const readWith = async (
    client: Client,
    slug: string,
    token: string,
  ): Promise<{ snapshot_status: string }> => {
    const reply = await client.callTool({
      name: "read",
      arguments: { slug, snapshot_token: token },
    });
    expect(reply.isError, JSON.stringify(reply.content)).not.toBe(true);
    return reply.structuredContent as { snapshot_status: string };
  };

  it("the two doors really are two viewers — the positive control", async () => {
    // If both served the same set, the token test below would be about nothing.
    const publicHits = await publicClient.callTool({
      name: "outline",
      arguments: { limit: 50 },
    });
    const internalHits = await internalClient.callTool({
      name: "outline",
      arguments: { limit: 50 },
    });
    const slugs = (r: typeof publicHits): string[] =>
      ((r.structuredContent as { nodes: { slug: string }[] }).nodes ?? [])
        .map((n) => n.slug)
        .sort();
    expect(slugs(publicHits)).toEqual(["public-bands"]);
    expect(slugs(internalHits)).toEqual(["internal-bands", "public-bands"]);
  });

  it("a token minted at [public] is HONOURED at [public]", async () => {
    // The control that makes the refusal below mean something: same key, same
    // instance, same generation — so nothing but the viewer can refuse it.
    const token = await mintFrom(publicClient);
    expect((await readWith(publicClient, "public-bands", token)).snapshot_status).toBe("pinned");
  });

  it("a token minted at [public] is REFUSED at [public, internal]", async () => {
    const token = await mintFrom(publicClient);
    const body = await readWith(internalClient, "public-bands", token);
    // It fails SOFT, by design: the wider door serves the active generation and
    // says why, rather than erroring. What must never happen is `pinned`.
    expect(body.snapshot_status).not.toBe("pinned");
    expect(body.snapshot_status).toContain("refreshed");
  });

  it("and the reverse — a token minted at [public, internal] is refused at [public]", async () => {
    // Both directions, because the binding is a digest of a SET: an
    // implementation that only widened, or only narrowed, would pass one of
    // these and leak on the other.
    const token = await mintFrom(internalClient);
    const body = await readWith(publicClient, "public-bands", token);
    expect(body.snapshot_status).not.toBe("pinned");
    expect(body.snapshot_status).toContain("refreshed");
  });
});

describe.runIf(adminDsn === "")("the snapshot viewer binding (gated)", () => {
  it("skipped — set KSOR_DB_URL to run the two-door walk", () => {
    expect(adminDsn).toBe("");
  });
});
