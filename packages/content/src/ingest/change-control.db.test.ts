/**
 * KSP R23 at the served rung: `ksor ingest` runs the same change-control
 * check `ksor build` runs, so the door can never publish a stable body the
 * free rung would have refused (decision 27 — ingest runs the SAME checker).
 * And where it cannot run — a record that reached the container without its
 * `.git` — it SAYS so through the report channel rather than passing in
 * silence.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool } from "../db.js";
import { applySchema } from "../schema.js";
import { buildShippedProvider } from "../lib/providers/registry.js";
import { FAKE_EMBED_MODEL } from "../lib/providers/fake.js";
import { buildGeneration, RecordRefused } from "./build.js";
import {
  instanceOf as fixtureInstance,
  profileDoc,
  writeIndexesAndLock,
  writeRecord,
} from "./fixtures/record-fixture.js";
import type { ContentInstance } from "../instance.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = `ksor_change_control_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
const DIM = 8;
const TENANT = "change-control";
const BODY =
  "# Alpha\n\nThe alpha note is ordinary prose, comfortably past the navigation floor so it is searchable.\n";

describe.runIf(adminDsn !== "")("ksor ingest verifies generated.at against history (db)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let instance: ContentInstance;
  const roots: string[] = [];

  const git = (root: string, ...args: string[]): void => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    expect(r.status, `git ${args.join(" ")}: ${r.stderr}`).toBe(0);
  };

  const fresh = async (): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), "ksor-change-control-"));
    roots.push(root);
    writeRecord(root, {
      name: TENANT,
      docs: { "notes/alpha.md": profileDoc({ title: "Alpha", body: BODY }) },
    });
    return root;
  };

  const ingest = async (root: string, reports: string[]): Promise<number> => {
    const r = await buildGeneration(pool, instance, {
      recordRoot: root,
      sourceCommit: "commit-frozen",
      flip: true,
      provider: buildShippedProvider("fake", {
        apiKey: null,
        modelId: FAKE_EMBED_MODEL,
        dim: DIM,
      }),
      onReport: (line) => reports.push(line),
    });
    return r.generation;
  };

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: adminDsn });
    await admin.query(`CREATE DATABASE ${DB}`);
    const dsn = new URL(adminDsn);
    dsn.pathname = `/${DB}`;
    pool = contentPool(dsn.toString());
    await applySchema(pool, DIM);
    await pool.query(
      "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', $1)",
      [TENANT],
    );
    instance = fixtureInstance(TENANT, TENANT, {
      embeddingModel: FAKE_EMBED_MODEL,
      embeddingDim: DIM,
    });
  });

  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await admin.end();
    for (const root of roots) await rm(root, { recursive: true, force: true });
  });

  it("outside a repository it ingests, and reports that the check could not run", async () => {
    const root = await fresh();
    const reports: string[] = [];
    await expect(ingest(root, reports)).resolves.toBeGreaterThan(0);
    expect(reports.join("\n")).toContain("change-control: not checked");
    expect(reports.join("\n")).toContain("not in a git repository");
  });

  it("a committed stable body edited without a bump is refused ksor-generated-stale, before any write", async () => {
    const root = await fresh();
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.email", "t@example.com");
    git(root, "config", "user.name", "t");
    git(root, "config", "commit.gpgsign", "false");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "first");
    const doc = join(root, "knowledge/notes/alpha.md");
    writeFileSync(doc, readFileSync(doc, "utf8").replace("ordinary prose", "edited prose"));
    // A fresh lock, so the lock gate is not what refuses.
    writeIndexesAndLock(root);
    const before = await pool.query("SELECT count(*)::int AS n FROM ingestion_runs");
    await expect(ingest(root, [])).rejects.toSatisfy(
      (e: unknown) => e instanceof RecordRefused && e.refusals[0]?.slug === "ksor-generated-stale",
      "expected RecordRefused with ksor-generated-stale first",
    );
    const after = await pool.query("SELECT count(*)::int AS n FROM ingestion_runs");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
