/**
 * What a governance refusal is allowed to tell a CALLER.
 *
 * `refusalBody` passes an AUTHORED error's whole message through as
 * `error.data.detail`, because a remedy a caller receives one line of is a
 * remedy they cannot act on. Two `GovernanceGateError` messages interpolate up
 * to five `stable_id`s — the paths of documents someone WITHDREW — and under
 * `KSOR_AUTH=disabled-public` the 503 carrying them reaches any caller at all.
 * Takedown is the strongest governance act in the product, and this enumerated
 * what it had removed, to an unprivileged agent, on the way to explaining why
 * the door was down.
 *
 * The existing unit test blessed the pass-through with a hand-written message
 * that happens to contain no identifiers, so nothing was red. This composes the
 * errors the way the DOOR does — `assertGovernanceServable` against a real
 * database — because the leak is a property of the messages the product builds,
 * not of one a test built.
 */

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applySchema,
  assertGovernanceServable,
  contentPool,
  grantIngest,
  runIngest,
} from "@panaversity/ksor-content";
import type { ContentInstance } from "@panaversity/ksor-content";
import type pg from "pg";

import { refusalBody } from "./refusal-body.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = `ksor_refusal_governance_test_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
const TENANT = "refusal-corp";

/** Shaped like real withdrawals, because the point is that these never leave. */
const WITHDRAWN = ["knowledge/hr/allegation-2026-03", "knowledge/legal/settlement-doe"];

const instance: ContentInstance = {
  name: TENANT,
  corpusId: TENANT,
  tenantId: TENANT,
  title: TENANT,
  description: "A record whose governance cannot be honoured.",
  toolchain: null,
  dsnEnv: "KSOR_DB_URL",
  abstain: { vectorFloor: null, keywordFloor: null, floorDigest: null },
  textSearchConfig: "english",
  maximumResponseCharacters: 120_000,
  instructions: "",
  embeddingProvider: "fake",
  embeddingModel: "fake-embed-001",
  embeddingDim: 1536,
};

/** The error `assertGovernanceServable` actually throws for this state. */
async function refusal(pool: pg.Pool): Promise<unknown> {
  try {
    await assertGovernanceServable(pool, instance, undefined, { report: () => {} });
  } catch (error) {
    return error;
  }
  throw new Error("assertGovernanceServable did not refuse — the fixture no longer reaches it");
}

describe.runIf(adminDsn !== "")("a governance refusal names no withdrawn document (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, 1536);
    await grantIngest(pool, TENANT);
    await pool.query(
      "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 1)",
      [TENANT],
    );
    // A generation built against a schema NEW enough to pass the pre-profile
    // gate, so the walk reaches the two id-bearing refusals below rather than
    // stopping at the one that names nothing.
    await runIngest(pool, TENANT, async (client) => {
      await client.query(
        "INSERT INTO ingestion_runs (tenant_id, corpus_id, generation, state, source_commit," +
          " instance_bundle_sha256, schema_version, ledger_ids)" +
          " VALUES ($1, $1, 1, 'active', 'deadbeef', 'cafe', '2.5', ARRAY[]::text[])",
        [TENANT],
      );
      for (const stableId of WITHDRAWN) {
        await client.query(
          "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, scope, reason)" +
            " VALUES ($1, $1, $2, 'node', 'legal request')",
          [TENANT, stableId],
        );
      }
    });
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("the fixture really does reach an id-bearing refusal", async () => {
    // Guard on the guard: if the gate ever stops throwing here, the leak
    // assertions below would pass by testing nothing at all.
    const error = await refusal(pool);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message, "the message itself still names them, for the LOGS").toContain(
      WITHDRAWN[0]!,
    );
  });

  it("puts no withdrawn document's path in the 503 body", async () => {
    const body = JSON.stringify(refusalBody(await refusal(pool)));
    for (const stableId of WITHDRAWN) {
      expect(body, `a 503 enumerated a WITHDRAWN document to the caller:\n${body}`).not.toContain(
        stableId,
      );
    }
    // Nothing that looks like a record path, either — a future message that
    // interpolates a different identifier must fail here too.
    expect(body, `a record path reached the wire:\n${body}`).not.toMatch(/knowledge\//);
  });

  it("still tells the operator what is wrong and how to end it", async () => {
    // The exchange is the identifiers, not the remedy: a refusal that says
    // nothing actionable is the "errors are documentation" principle broken at
    // the moment it matters most.
    const body = refusalBody(await refusal(pool));
    expect(body.error.message).toContain("this record cannot be served");
    expect(body.error.data?.detail, "the slug survives").toContain("ksor-takedown-unledgered");
    expect(body.error.data?.detail, "and so does the fix").toContain("ksor migrate --write");
  });
});

describe.runIf(adminDsn === "")("governance refusal payload (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
