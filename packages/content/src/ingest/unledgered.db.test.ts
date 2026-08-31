/**
 * The upgrade that corners an adopter, closed at the moment it is reachable.
 *
 * Before schema 2.5 a denial was a row and nothing else. The 2.4 -> 2.5
 * migration adds `ledger_id` and a migration cannot invent one, so every
 * carried denial arrives with `ledger_id IS NULL` — and `assertGovernanceServable`
 * refuses to boot on exactly that (`ksor-takedown-unledgered`). Between those
 * two facts sits `ksor ingest`, which is the only act that could have said so:
 * it folded the ledger, wrote nothing about the rows the ledger does not
 * account for, and went on to build and embed an entire generation before the
 * governance gate refused it at the end.
 *
 * The refusal now happens where the ledger is applied — BEFORE a generation is
 * allocated and before a single embedding is paid for — with the slug the boot
 * check uses and the remedy that actually resolves it. The state was never
 * servable; what changes is that the adopter learns at the first second of the
 * command rather than the last, and no generation is left behind.
 *
 * `ksor migrate --write` is the remedy, so the second half of this file walks
 * it: a ledger entry naming the same stable_id makes the SAME ingest succeed
 * and attaches the entry to the row. A refusal whose fix does not work is worse
 * than no refusal.
 */

import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest } from "../db.js";
import { applySchema } from "../schema.js";
import { buildShippedProvider } from "../lib/providers/registry.js";
import { FAKE_EMBED_MODEL } from "../lib/providers/fake.js";
import { buildGeneration, RecordRefused } from "./build.js";
import {
  instanceOf as fixtureInstance,
  profileDoc,
  TAKEDOWN_ACTOR,
  writeRecord,
} from "./fixtures/record-fixture.js";
import type { ContentInstance } from "../instance.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = `ksor_unledgered_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
const DIM = 8;
const TENANT = "handbook";
const DENIED = "knowledge/notes/withdrawn";

const LEDGER = (id: string): string =>
  `- id: ${id}\n  by: ${TAKEDOWN_ACTOR}\n  at: 2026-08-25T10:00:00Z\n` +
  `  stable_id: ${DENIED}\n  scope: node\n  expected: present\n  reason: legal hold\n`;

describe.runIf(adminDsn !== "")("an unledgered denial stops ingest where it happens (db)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let root: string;
  let instance: ContentInstance;

  const record = (ledger: string | null): string =>
    writeRecord(root, {
      name: TENANT,
      ledger,
      docs: {
        "notes/withdrawn.md": profileDoc({
          title: "Withdrawn",
          body: "# Withdrawn\n\nThis note was withdrawn by legal and is comfortably past the navigation floor.\n",
        }),
        "notes/kept.md": profileDoc({
          title: "Kept",
          body: "# Kept\n\nThis note is still published and is comfortably past the navigation floor.\n",
        }),
      },
    });

  const build = async (): Promise<unknown> =>
    buildGeneration(pool, instance, {
      recordRoot: root,
      sourceCommit: "test",
      flip: false,
      provider: buildShippedProvider("fake", { apiKey: null, modelId: FAKE_EMBED_MODEL, dim: DIM }),
    });

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: adminDsn });
    await admin.query(`CREATE DATABASE ${DB}`);
    const dsn = new URL(adminDsn);
    dsn.pathname = `/${DB}`;
    pool = contentPool(dsn.toString());
    await applySchema(pool, DIM);
    root = await mkdtemp(join(tmpdir(), "ksor-unledgered-"));
    instance = fixtureInstance(TENANT, TENANT, {
      embeddingModel: FAKE_EMBED_MODEL,
      embeddingDim: DIM,
    });

    // RLS admits the ingest role per tenant; the grant is the authorization.
    await pool.query(
      "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', $1)",
      [TENANT],
    );

    // The state a 2.4 -> 2.5 migration leaves behind: a denial with no ledger
    // entry, because there was no ledger when it was written.
    await runIngest(pool, TENANT, async (c) => {
      await c.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 0)" +
          " ON CONFLICT DO NOTHING",
        [TENANT],
      );
      await c.query(
        "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, scope, reason)" +
          " VALUES ($1, $1, $2, 'node', 'legal hold')",
        [TENANT, DENIED],
      );
    });
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  });

  it("REFUSES the ingest, naming the slug the boot check uses and the remedy", async () => {
    record(null);
    const error = await build().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error, "ingest must not succeed against a denial nothing accounts for").toBeInstanceOf(
      RecordRefused,
    );
    const message = (error as Error).message;
    expect(message).toContain("ksor-takedown-unledgered");
    expect(message, "the row it is about").toContain(DENIED);
    expect(message, "the remedy, spelled out").toContain("ksor migrate --write");
  });

  it("spent NOTHING: no generation was allocated, so nothing was embedded", async () => {
    const runs = await runIngest(pool, TENANT, (c) =>
      c.query("SELECT count(*)::int AS n FROM ingestion_runs WHERE tenant_id = $1", [TENANT]),
    );
    expect(
      runs.rows[0].n,
      "the refusal lands before allocateRun — a build left behind is a bill and a `ksor gc` chore",
    ).toBe(0);
  });

  it("the remedy WORKS: a ledger entry naming the row lets the same ingest through", async () => {
    record(LEDGER("2026-08-25T10:00:00Z-abc123"));
    const report = (await build()) as { generation: number };
    expect(report.generation).toBeGreaterThan(0);

    const row = await runIngest(pool, TENANT, (c) =>
      c.query("SELECT ledger_id, actor FROM takedown_denylist WHERE tenant_id = $1", [TENANT]),
    );
    expect(row.rows[0], "the entry is attached to the pre-existing row by stable_id").toMatchObject(
      { ledger_id: "2026-08-25T10:00:00Z-abc123", actor: TAKEDOWN_ACTOR },
    );
  });
});

describe.runIf(adminDsn === "")("unledgered denial (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
