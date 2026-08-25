/**
 * The seam decision 18 is about, at the one surface nobody had walked.
 *
 * The ledger's departed-authority escape is that an entry an earlier build
 * ACCEPTED is history and is never judged again — so a takedown authority who
 * leaves the company does not make every entry they ever wrote refuse. It is
 * carried by the baselines handed to `checkRecord`, and every caller passed the
 * committed lock as accepted except one: `buildGeneration` called
 * `checkRecord(record, { mode: "build" })` with no baselines at all.
 *
 * Each side was internally consistent, so nothing was red. What the seam did
 * was split the record in half: `ksor build` and the site published, and
 * `ksor ingest` refused `ksor-takedown-unauthorised` — the site up, the door
 * down, on one record, which is the state decision 19 forbids. Neither exit was
 * honest either: re-adding a departed person to the policy is a lie the policy
 * then carries, and deleting the entries is `ksor-ledger-shrank`. Revocations
 * were wedged too, so a takedown governance had LIFTED could not reach the door.
 *
 * This walks it at the ingest surface, because that is the half that was
 * missing — the unit tier already covers `checkRecord` with accepted baselines,
 * and covered it while ingest was broken.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  policyText,
  profileDoc,
  writeLock,
  TAKEDOWN_ACTOR,
  writeRecord,
} from "./fixtures/record-fixture.js";
import type { ContentInstance } from "../instance.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_departed_authority";
const DIM = 8;
const TENANT = "handbook";
const DEPARTED = "human:alice";
const DENIED = "knowledge/notes/withdrawn";

const LEDGER =
  `- id: 2026-08-25T10:00:00Z-aaaaaa\n  by: ${DEPARTED}\n  at: 2026-08-25T10:00:00Z\n` +
  `  stable_id: ${DENIED}\n  scope: node\n  expected: present\n  reason: legal hold\n`;

describe.runIf(adminDsn !== "")("a departed takedown authority (db)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let root: string;
  let instance: ContentInstance;

  /** The record as it stood while `alice` was still an authority — lock included. */
  const recordWithAlice = (): void => {
    writeRecord(root, {
      name: TENANT,
      policy: policyText([], [TAKEDOWN_ACTOR, DEPARTED]),
      ledger: LEDGER,
      docs: {
        "notes/withdrawn.md": profileDoc({
          title: "Withdrawn",
          body: "# Withdrawn\n\nWithdrawn by legal, and comfortably past the navigation floor.\n",
        }),
        "notes/kept.md": profileDoc({
          title: "Kept",
          body: "# Kept\n\nStill published, and comfortably past the navigation floor.\n",
        }),
      },
    });
  };

  const build = async (): Promise<unknown> =>
    buildGeneration(pool, instance, {
      recordRoot: root,
      sourceCommit: "test",
      flip: false,
      provider: buildShippedProvider("fake", { apiKey: null, modelId: FAKE_EMBED_MODEL, dim: DIM }),
    });

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB}`);
    const dsn = new URL(adminDsn);
    dsn.pathname = `/${DB}`;
    pool = contentPool(dsn.toString());
    await applySchema(pool, DIM);
    root = await mkdtemp(join(tmpdir(), "ksor-departed-"));
    instance = fixtureInstance(TENANT, TENANT, {
      embeddingModel: FAKE_EMBED_MODEL,
      embeddingDim: DIM,
    });
    await pool.query(
      "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', $1)",
      [TENANT],
    );
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  });

  it("ingests a record whose committed lock accepted the entry, after she leaves", async () => {
    recordWithAlice();
    // She leaves: removed from the policy, her entry untouched in the ledger.
    await writeFile(
      join(root, ".ksor", "governance.yaml"),
      policyText([], [TAKEDOWN_ACTOR]),
      "utf8",
    );
    // …then `ksor build` runs and PASSES — that is the half this fix restored —
    // and writes the lock the deploy commits. Ingest reads that lock. Skipping
    // this step would assert against `ksor-lock-stale` instead, which is a true
    // refusal about a different thing.
    writeLock(root);

    const error = await build().then(
      () => null,
      (e: unknown) => e,
    );
    expect(
      error === null ? null : (error as Error).message,
      "ingest refused an entry the committed lock had already accepted",
    ).toBeNull();
  }, 180_000);

  it("still refuses an entry NO baseline ever accepted — the guard is not merely off", async () => {
    recordWithAlice();
    await writeFile(
      join(root, ".ksor", "governance.yaml"),
      policyText([], [TAKEDOWN_ACTOR]),
      "utf8",
    );
    // No lock at all: a record whose build was never committed. Nothing has
    // accepted anything, so the strict rule applies and her entry refuses —
    // which is what makes the case above a fix rather than a hole.
    await rm(join(root, "build.lock.json"), { force: true });

    const error = await build().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error, "an entry no baseline accepted must still refuse").toBeInstanceOf(RecordRefused);
    expect((error as Error).message).toContain("ksor-takedown-unauthorised");
    expect((error as Error).message, "and it names WHO").toContain(DEPARTED);
  }, 180_000);
});
