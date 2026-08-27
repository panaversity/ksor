/**
 * The takedown READ plane: what is denied, and the §7 acts that made it so.
 *
 * The write half moved to the ledger (record spec §5) and is walked through the
 * verb in `takedown-verb.db.test.ts`. What stays here is the pair that has to
 * hold whoever wrote the row: the acts are READABLE (before schema 2.3
 * `retrieval_log` had FORCE row-level security, an INSERT policy and no reader
 * at all — written forever, readable by nobody), and both readers are scoped to
 * ONE RECORD, not merely to the tenant.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest } from "./db.js";
import { grantIngest } from "./grant.js";
import { instanceOf } from "./ingest/fixtures/record-fixture.js";
import { applyLedger } from "./ingest/ledger-apply.js";
import { parseLedger } from "./record/ledger.js";
import { listTakedowns, readLedger } from "./takedown-ops.js";
import { applySchema } from "./schema.js";
import type { ContentInstance } from "./instance.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_takedown_ops_test";
const TENANT = "takedown-corp";

const instance: ContentInstance = instanceOf(TENANT, TENANT);

const LEDGER = `- id: "2026-08-25T10:00:00Z-aaa111"
  stable_id: "knowledge/withdrawn"
  scope: node
  expected: present
  by: "human:ciso"
  at: "2026-08-25T10:00:00Z"
  reason: "legal request 2026-08"
`;

/**
 * The revocation is signed by a DIFFERENT person from the denial, deliberately.
 *
 * `ledger-apply` picks the §7 actor with `revoked ? state.revokedBy.by : d.by`
 * — one expression deciding both the actor and the action — and with one name
 * in the fixture, changing it to `d.by` produces an identical row. So the
 * inversion this file exists to catch would be invisible to it (review
 * finding 7).
 */
const REVOKER = "human:dpo";
const REVOKED_LEDGER =
  LEDGER +
  `- id: "2026-08-25T11:00:00Z-bbb222"\n  revokes: "2026-08-25T10:00:00Z-aaa111"\n` +
  `  by: "${REVOKER}"\n  at: "2026-08-25T11:00:00Z"\n`;

describe.runIf(adminDsn !== "")("takedown read plane (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;

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
    await pool.query(
      "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 1)",
      [TENANT],
    );
    const parsed = parseLedger(LEDGER, ".ksor/takedowns.yaml");
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.refusals));
    await runIngest(pool, TENANT, (c) => applyLedger(c, instance, parsed.ledger));
  }, 180_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("lists what is denied, with the scope the ledger recorded", async () => {
    expect(await listTakedowns(pool, instance)).toMatchObject([
      { stableId: "knowledge/withdrawn", scope: "node", reason: "legal request 2026-08" },
    ]);
  });

  /**
   * `--list` is the operator's own check on what is denied, so it must read the
   * SAME state the serving predicate does: a row whose `revoked_at` is set is
   * not denied anywhere else, and reporting it here made the duplicate-denial
   * leak look like correct behaviour instead of surfacing it.
   */
  it("a revoked row is not listed — the list is what is IN FORCE", async () => {
    const revoked = parseLedger(REVOKED_LEDGER, ".ksor/takedowns.yaml");
    if (!revoked.ok) throw new Error(JSON.stringify(revoked.refusals));
    await runIngest(pool, TENANT, (c) => applyLedger(c, instance, revoked.ledger));
    expect(await listTakedowns(pool, instance)).toEqual([]);
    const row = await pool.query(
      "SELECT revoked_at FROM takedown_denylist WHERE tenant_id = $1 AND stable_id = $2",
      [TENANT, "knowledge/withdrawn"],
    );
    expect(row.rows[0]?.revoked_at, "the row stays — only the denial lifts").not.toBeNull();
    // Put the record back the way the rest of this file expects it.
    const again = parseLedger(LEDGER, ".ksor/takedowns.yaml");
    if (!again.ok) throw new Error(JSON.stringify(again.refusals));
    await runIngest(pool, TENANT, (c) => applyLedger(c, instance, again.ledger));
  });

  it("the §7 act is readable, and names the LEDGER's actor rather than whoever ran the apply", async () => {
    const rows = await readLedger(pool, instance, 10);
    const act = rows.find((r) => r.action === "takedown_applied");
    expect(act, "the act left a row").toBeDefined();
    expect(act?.actor).toBe("human:ciso");
    expect(act).toMatchObject({
      actor: "human:ciso",
      action: "takedown_applied",
      detail: {
        stable_id: "knowledge/withdrawn",
        ledger_id: "2026-08-25T10:00:00Z-aaa111",
        // WHY it was withdrawn is half of what a governance trail is for, and
        // the check for it was dropped when this file replaced an older one
        // (review finding 8).
        reason: "legal request 2026-08",
      },
    });
  });

  /**
   * A REVOCATION is a governance act in its own right, and it was asserted
   * nowhere that runs.
   *
   * `ledger-apply.ts` chooses the actor and the action in a single expression;
   * the only `takedown_revoked` assertion in the repository is over `ledgerActs`
   * — a pure function on a parsed file, a different code path that never reaches
   * `applyLedger` or a database. So changing the actor back to the DENIER left
   * every test green: a lifted denial would have been attributed, in the audit
   * trail, to the person who imposed it (review finding 7).
   */
  it("a revocation's §7 row names the REVOKER, not the person who imposed the denial", async () => {
    const revoked = parseLedger(REVOKED_LEDGER, ".ksor/takedowns.yaml");
    if (!revoked.ok) throw new Error(JSON.stringify(revoked.refusals));
    // Parsed BEFORE the try, so the restore in `finally` cannot throw: a throw
    // there replaces whichever assertion actually failed, which is the one
    // thing this test exists to report.
    const restore = parseLedger(LEDGER, ".ksor/takedowns.yaml");
    if (!restore.ok) throw new Error(JSON.stringify(restore.refusals));
    const restored = restore.ledger;
    await runIngest(pool, TENANT, (c) => applyLedger(c, instance, revoked.ledger));
    try {
      const rows = await readLedger(pool, instance, 50);
      const act = rows.find((r) => r.action === "takedown_revoked");
      expect(act, "the revocation left a row of its own").toBeDefined();
      expect(act).toMatchObject({
        actor: REVOKER,
        action: "takedown_revoked",
        detail: {
          stable_id: "knowledge/withdrawn",
          revoked_ledger_id: "2026-08-25T11:00:00Z-bbb222",
          change: "revoked",
        },
      });
      // The two acts are distinguishable by actor, which is the whole point of
      // recording one: they must not both name the denier.
      expect(act?.actor, "the revoker is not the denier").not.toBe("human:ciso");
    } finally {
      await runIngest(pool, TENANT, (c) => applyLedger(c, instance, restored));
    }
  });

  it("the ledger is scoped to THIS record, not just the tenant", async () => {
    // Every governance write records corpus_id, and listTakedowns already
    // scoped by it; readLedger did not. One tenant serving two corpora — the
    // shape the second-record open question prepares for — got one record's
    // audit trail polluted with the other's (round-9 review of #43).
    const other: ContentInstance = { ...instance, corpusId: "other-corpus" };
    await runIngest(pool, TENANT, async (client) => {
      await client.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $2, 1) " +
          "ON CONFLICT (tenant_id, corpus_id) DO NOTHING",
        [TENANT, "other-corpus"],
      );
      await client.query(
        "INSERT INTO retrieval_log (tenant_id, corpus_id, actor, action, detail)" +
          " VALUES ($1, $2, 'someone-else', 'takedown_applied', '{}'::jsonb)",
        [TENANT, "other-corpus"],
      );
    });

    const mine = await readLedger(pool, instance, 50);
    expect(
      mine.some((r) => r.actor === "someone-else"),
      `another corpus's act appeared in this record's ledger: ${JSON.stringify(mine.map((r) => r.actor))}`,
    ).toBe(false);

    const theirs = await readLedger(pool, other, 50);
    expect(
      theirs.map((r) => r.actor),
      "…and it IS in its own",
    ).toContain("someone-else");
  });
});

describe.runIf(adminDsn === "")("takedown read plane (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
