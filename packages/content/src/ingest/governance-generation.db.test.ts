/**
 * A change to GOVERNANCE ALONE must earn a generation.
 *
 * `buildGeneration` skips when the corpus it just wrote matches the one already
 * serving, and the skip is what makes `pnpm serve` free on an unchanged record.
 * The question this file answers is what "unchanged" is allowed to mean: an
 * audience narrowing, an approval, a policy edit and a new denial all leave the
 * DOCUMENT BODIES byte-identical, and the door binds to the record — so if any
 * of them slipped through the skip, the door would go on serving the OLD
 * governance until some unrelated document happened to change. That is decision
 * 15's guarantee failing, and an audience narrowing is a security control, so
 * deferring one silently is not a thing a system of record may do.
 *
 * Each case here changes exactly one governance input and NOTHING else — the
 * same tree, the same source commit — and asserts a new generation. They are
 * separated because the three inputs are compared by three different
 * mechanisms: the node row (`sameCorpus`), the policy digest and the ledger id
 * set (`sameGovernance`). A single case would pass on one of them while the
 * other two were broken (review 2026-08-25, finding 32).
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool } from "../db.js";
import { applySchema } from "../schema.js";
import { buildShippedProvider } from "../lib/providers/registry.js";
import { FAKE_EMBED_MODEL } from "../lib/providers/fake.js";
import { buildGeneration } from "./build.js";
import {
  instanceOf as fixtureInstance,
  policyText,
  profileDoc,
  TAKEDOWN_ACTOR,
  writeRecord,
} from "./fixtures/record-fixture.js";
import type { ContentInstance } from "../instance.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_governance_generation";
const DIM = 8;
const TENANT = "gov-gen";
/** The same commit throughout: a new commit earns a generation on its own, which would mask everything. */
const COMMIT = "commit-frozen";

const BODY = (name: string): string =>
  `# ${name}\n\nThe ${name} note is ordinary prose, comfortably past the navigation floor so it is searchable.\n`;

interface Knobs {
  readonly audience?: readonly string[];
  readonly audiences?: readonly string[];
  readonly ledger?: string | null;
}

describe.runIf(adminDsn !== "")("governance alone earns a generation (db)", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let root: string;
  let instance: ContentInstance;

  /** Writes the record AND regenerates the lock, which is what `ksor build` does. */
  const write = (knobs: Knobs = {}): void => {
    writeRecord(root, {
      name: TENANT,
      policy: policyText(knobs.audiences ?? ["internal"]),
      ledger: knobs.ledger ?? null,
      docs: {
        "notes/alpha.md": profileDoc({
          title: "Alpha",
          audience: knobs.audience ?? ["public"],
          body: BODY("alpha"),
        }),
        "notes/beta.md": profileDoc({ title: "Beta", body: BODY("beta") }),
      },
    });
  };

  const ingest = async (): Promise<{ generation: number; unchanged: boolean }> => {
    const r = await buildGeneration(pool, instance, {
      recordRoot: root,
      sourceCommit: COMMIT,
      flip: true,
      provider: buildShippedProvider("fake", {
        apiKey: null,
        modelId: FAKE_EMBED_MODEL,
        dim: DIM,
      }),
    });
    return { generation: r.generation, unchanged: r.unchanged };
  };

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB}`);
    const dsn = new URL(adminDsn);
    dsn.pathname = `/${DB}`;
    pool = contentPool(dsn.toString());
    await applySchema(pool, DIM);
    await pool.query(
      "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', $1)",
      [TENANT],
    );
    root = await mkdtemp(join(tmpdir(), "ksor-gov-gen-"));
    instance = fixtureInstance(TENANT, TENANT, {
      embeddingModel: FAKE_EMBED_MODEL,
      embeddingDim: DIM,
    });
    write();
    await ingest();
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  });

  it("CONTROL: the identical record at the same commit earns nothing", async () => {
    write();
    const again = await ingest();
    expect(
      again.unchanged,
      "without this the rest of the file proves nothing — every case would be 'changed'",
    ).toBe(true);
  });

  it("narrowing a document's AUDIENCE earns one — the bodies never moved", async () => {
    const before = (await ingest()).generation;
    write({ audience: ["internal"] });
    const after = await ingest();
    expect(after.unchanged, "an audience narrowing is a security control, never deferred").toBe(
      false,
    );
    expect(after.generation).toBeGreaterThan(before);
  });

  it("editing the POLICY earns one — the door binds to the run's policy row", async () => {
    write({ audience: ["internal"] });
    const before = (await ingest()).generation;
    // A second registered audience: the registry the door validates viewers
    // against, so a stale one answers `ksor-viewer-unregistered` to a viewer the
    // record now admits.
    write({ audience: ["internal"], audiences: ["internal", "board"] });
    const after = await ingest();
    expect(after.unchanged).toBe(false);
    expect(after.generation).toBeGreaterThan(before);
  });

  it("appending a DENIAL earns one — the boot gate compares against the run's ledger ids", async () => {
    write({ audience: ["internal"], audiences: ["internal", "board"] });
    const before = (await ingest()).generation;
    const ledger =
      `- id: 2026-08-25T10:00:00Z-aa11bb\n  by: ${TAKEDOWN_ACTOR}\n  at: 2026-08-25T10:00:00Z\n` +
      "  stable_id: knowledge/notes/beta\n  scope: node\n  expected: present\n  reason: legal hold\n";
    write({ audience: ["internal"], audiences: ["internal", "board"], ledger });
    const after = await ingest();
    expect(after.unchanged).toBe(false);
    expect(after.generation).toBeGreaterThan(before);
  });
});

describe.runIf(adminDsn === "")("governance alone earns a generation (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
