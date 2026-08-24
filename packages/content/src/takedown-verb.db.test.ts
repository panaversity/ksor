/**
 * `ksor takedown`, walked (record spec §5) — the CLI itself, against a real
 * record on disk and a real database, one test per branch of the decision
 * table.
 *
 * The verb is ledger-first: it appends to `.ksor/takedowns.yaml` and only then
 * writes the denylist row, so the file can always rebuild the row and nothing
 * can rebuild the file from the row. Every assertion here is on BOTH — what
 * the committed file says and what the door would serve — because the state
 * where they disagree is the one decision 19 exists to prevent.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { runContentCli } from "./commands.js";
import { contentPool, runIngest } from "./db.js";
import { grantIngest } from "./grant.js";
import { instanceText, policyText, writeRecord } from "./ingest/fixtures/record-fixture.js";
import { profileDoc } from "./ingest/fixtures/record-fixture.js";
import { parseLedger } from "./record/ledger.js";
import { applySchema } from "./schema.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_takedown_verb";
const TENANT = "takedown-corp";
const DSN_ENV = "KSOR_TAKEDOWN_TEST_DSN";
const ACTOR = "human:ciso";

const DOCS = {
  "policies/old-threshold.md": profileDoc({
    title: "Old threshold",
    body: "The purchase threshold was fifty thousand until it was superseded.",
  }),
  "policies/current.md": profileDoc({
    title: "Current threshold",
    body: "The purchase threshold is one hundred thousand as of this year.",
  }),
};

describe.runIf(adminDsn !== "")("ksor takedown (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;
  let dsn: string;
  const roots: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  let restore: (() => void) | null = null;

  /** A fresh record on disk. `database` false emits the level-0 instance with no `database:` block. */
  const record = (database: boolean): string => {
    const root = mkdtempSync(join(tmpdir(), "ksor-takedown-"));
    roots.push(root);
    writeRecord(root, {
      name: TENANT,
      docs: DOCS,
      policy: policyText([], [ACTOR]),
      instance: database
        ? `---\nformat: 2\nname: ${TENANT}\ntitle: ${TENANT}\ndescription: The takedown record.\ndatabase:\n  dsn_env: ${DSN_ENV}\nembedding:\n  provider: fake\n---\n\nAnswer only from the record.\n`
        : instanceText(TENANT, TENANT, false),
    });
    return root;
  };

  const ledgerOf = (root: string): ReturnType<typeof parseLedger> =>
    parseLedger(readFileSync(join(root, ".ksor", "takedowns.yaml"), "utf8"), "l");

  /** The ledger's ids, insisting it parses — a test that silently read `[]` would assert nothing. */
  const idsOf = (root: string): readonly string[] => {
    const parsed = ledgerOf(root);
    if (!parsed.ok) throw new Error(`the ledger did not parse: ${JSON.stringify(parsed.refusals)}`);
    return parsed.ledger.ids;
  };

  const run = async (root: string, ...args: string[]): Promise<number> => {
    out.length = 0;
    err.length = 0;
    return runContentCli(["takedown", "--instance", join(root, "instance.md"), ...args]);
  };

  const rows = async (): Promise<
    { stable_id: string; scope: string; ledger_id: string | null; revoked_at: Date | null }[]
  > => {
    const r = await pool.query(
      "SELECT stable_id, scope, ledger_id, revoked_at FROM takedown_denylist" +
        " WHERE tenant_id = $1 AND corpus_id = $1 ORDER BY stable_id",
      [TENANT],
    );
    return r.rows;
  };
  const clearRows = (): Promise<unknown> =>
    runIngest(pool, TENANT, (c) =>
      c.query("DELETE FROM takedown_denylist WHERE tenant_id = $1", [TENANT]),
    );

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    dsn = url.toString();
    pool = contentPool(dsn, 4);
    await applySchema(pool, 1536);
    await grantIngest(pool, TENANT);
    await runIngest(pool, TENANT, (c) =>
      c.query("INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 1)", [
        TENANT,
      ]),
    );

    // The CLI writes to the real streams; capture them so a refusal's FIRST
    // line can be asserted (product principle 4) rather than merely its code.
    const so = process.stdout.write.bind(process.stdout);
    const se = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((c: string) => (
      out.push(String(c)),
      true
    )) as typeof process.stdout.write;
    process.stderr.write = ((c: string) => (
      err.push(String(c)),
      true
    )) as typeof process.stderr.write;
    restore = (): void => {
      process.stdout.write = so;
      process.stderr.write = se;
    };
  }, 180_000);

  afterEach(async () => {
    delete process.env[DSN_ENV];
    await clearRows();
  });

  afterAll(async () => {
    restore?.();
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("no database: the ledger entry is the whole act, and it is enough", async () => {
    const root = record(false);
    const code = await run(
      root,
      "--actor",
      ACTOR,
      "--reason",
      "superseded figure",
      "knowledge/policies/old-threshold",
    );
    expect(code, out.join("") + err.join("")).toBe(0);
    const parsed = ledgerOf(root);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.ledger.entries).toHaveLength(1);
    expect(parsed.ledger.entries[0]).toMatchObject({
      kind: "denial",
      stableId: "knowledge/policies/old-threshold",
      scope: "node",
      // the file is there, so the verb records that it SAW it
      expected: "present",
      by: ACTOR,
      reason: "superseded figure",
    });
    expect(out.join(""), "the operator is told to commit it").toContain("commit it");
  });

  it("a declared database and its DSN: the entry, then the row", async () => {
    const root = record(true);
    process.env[DSN_ENV] = dsn;
    const code = await run(
      root,
      "--actor",
      ACTOR,
      "--reason",
      "legal",
      "knowledge/policies/current",
    );
    expect(code, out.join("") + err.join("")).toBe(0);
    expect(await rows()).toMatchObject([
      { stable_id: "knowledge/policies/current", scope: "node", revoked_at: null },
    ]);
    const parsed = ledgerOf(root);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // the row names the ENTRY that wrote it — the boot gate refuses a row that does not
    expect((await rows())[0]?.ledger_id).toBe(parsed.ledger.ids[0]);
  });

  it("a declared database and NO DSN: refused by slug, and nothing is written", async () => {
    const root = record(true);
    const code = await run(
      root,
      "--actor",
      ACTOR,
      "--reason",
      "legal",
      "knowledge/policies/current",
    );
    expect(code).toBe(1);
    expect(err.join("").split("\n")[0]).toMatch(/^ksor-takedown-dsn-missing:/);
    expect(err.join(""), "both ways out are named").toContain("--file-only");
    expect(
      () => readFileSync(join(root, ".ksor", "takedowns.yaml"), "utf8"),
      "the refusal came BEFORE the entry",
    ).toThrow();
  });

  it("--file-only records the entry deliberately and leaves the row to --apply", async () => {
    const root = record(true);
    process.env[DSN_ENV] = dsn;
    expect(
      await run(
        root,
        "--actor",
        ACTOR,
        "--reason",
        "legal",
        "--file-only",
        "knowledge/policies/current",
      ),
    ).toBe(0);
    expect(await rows(), "no row yet").toEqual([]);
    // --apply needs no actor: every entry carries its own
    expect(await run(root, "--apply"), out.join("") + err.join("")).toBe(0);
    expect(await rows()).toHaveLength(1);
    // and it is idempotent — the same ledger folds to the same state
    expect(await run(root, "--apply")).toBe(0);
    expect(out.join("")).toContain("already applied");
    expect(await rows()).toHaveLength(1);
  });

  it("refuses an unauthorised actor BEFORE any DSN is resolved", async () => {
    const root = record(true);
    // The DSN is deliberately unset: if the refusal came after it was resolved
    // this would exit 3 naming the variable, which is what it used to do.
    const code = await run(
      root,
      "--actor",
      "human:intern",
      "--reason",
      "legal",
      "knowledge/policies/current",
    );
    expect(code, "a refusal, not an environment failure").toBe(1);
    expect(err.join("").split("\n")[0]).toMatch(/^ksor-takedown-unauthorised:/);
    expect(err.join("")).toContain(ACTOR);
  });

  it("refuses an unnamed actor, and a shape that is not an actor", async () => {
    const root = record(true);
    expect(await run(root, "--reason", "legal", "knowledge/policies/current")).toBe(1);
    expect(err.join("").split("\n")[0]).toMatch(/^ksor-takedown-unattributed:/);
    expect(
      await run(root, "--actor", "ops@example.com", "--reason", "x", "knowledge/policies/current"),
    ).toBe(1);
    expect(err.join("").split("\n")[0]).toMatch(/^ksor-actor-form:/);
  });

  it("the missing actor is reported FIRST, even when the record has other problems", async () => {
    // The two halves of the actor check are ordered deliberately: `--actor` is
    // an argument, so its absence is knowable with no file open. Reading the
    // policy first would report a record with no `.ksor/governance.yaml` as
    // `ksor-policy-missing` and never mention the flag the operator forgot.
    const root = record(false);
    rmSync(join(root, ".ksor", "governance.yaml"));
    expect(await run(root, "--reason", "legal", "knowledge/policies/current")).toBe(1);
    expect(err.join("").split("\n")[0]).toMatch(/^ksor-takedown-unattributed:/);
    // …and WITH an actor, the missing policy is what refuses.
    expect(
      await run(root, "--actor", ACTOR, "--reason", "legal", "knowledge/policies/current"),
    ).toBe(1);
    expect(err.join("").split("\n")[0]).toMatch(/^ksor-policy-missing:/);
  });

  it("--revoke lifts the denial by naming its entry, and a re-denial denies again", async () => {
    const root = record(true);
    process.env[DSN_ENV] = dsn;
    expect(
      await run(root, "--actor", ACTOR, "--reason", "legal", "knowledge/policies/current"),
    ).toBe(0);
    const denialId = idsOf(root)[0]!;

    expect(await run(root, "--actor", ACTOR, "--revoke", denialId, "--reason", "cleared")).toBe(0);
    const lifted = await rows();
    expect(lifted, "the row is MARKED, never deleted — the ledger holds the history").toHaveLength(
      1,
    );
    expect(lifted[0]?.revoked_at, "and it is no longer in force").not.toBeNull();

    expect(
      await run(root, "--actor", ACTOR, "--reason", "again", "knowledge/policies/current"),
    ).toBe(0);
    const again = await rows();
    expect(again[0]?.revoked_at, "the re-denial clears the revocation").toBeNull();
    const parsed = ledgerOf(root);
    expect(parsed.ok && parsed.ledger.entries.map((e) => e.kind)).toEqual([
      "denial",
      "revocation",
      "denial",
    ]);
    expect(again[0]?.ledger_id, "and the row names the LATEST denial").toBe(
      parsed.ok ? parsed.ledger.ids[2] : null,
    );
  });

  it("--removed records that a denied document was deleted, and moves no row", async () => {
    const root = record(true);
    process.env[DSN_ENV] = dsn;
    expect(
      await run(root, "--actor", ACTOR, "--reason", "legal", "knowledge/policies/current"),
    ).toBe(0);
    const denialId = idsOf(root)[0]!;
    const before = await rows();
    expect(await run(root, "--actor", ACTOR, "--removed", denialId, "--reason", "deleted")).toBe(0);
    const parsed = ledgerOf(root);
    expect(parsed.ok && parsed.ledger.entries[1]).toMatchObject({
      kind: "amendment",
      amends: denialId,
    });
    expect(await rows(), "an amendment is about the FILE, not the row").toEqual(before);
  });

  it("refuses a revocation naming no entry, rather than writing one that dangles", async () => {
    const root = record(true);
    process.env[DSN_ENV] = dsn;
    expect(await run(root, "--actor", ACTOR, "--revoke", "not-an-id")).toBe(1);
    expect(err.join("").split("\n")[0]).toMatch(/^ksor-takedown-unknown-entry:/);
  });

  it("`expected` is what the verb SAW: `removed` when the file is already gone", async () => {
    const root = record(false);
    rmSync(join(root, "knowledge", "policies", "old-threshold.md"));
    expect(
      await run(
        root,
        "--actor",
        ACTOR,
        "--reason",
        "already deleted",
        "knowledge/policies/old-threshold",
      ),
    ).toBe(0);
    const parsed = ledgerOf(root);
    expect(parsed.ok && parsed.ledger.entries[0]).toMatchObject({ expected: "removed" });
  });

  it("a subtree denial names the directory's section anchor, and the ledger reader agrees", async () => {
    const root = record(false);
    expect(
      await run(
        root,
        "--actor",
        ACTOR,
        "--reason",
        "the whole folder",
        "--scope",
        "subtree",
        "knowledge/policies",
      ),
    ).toBe(0);
    const parsed = ledgerOf(root);
    expect(parsed.ok && parsed.ledger.entries[0]).toMatchObject({
      scope: "subtree",
      stableId: "knowledge/policies#section",
      expected: "present",
    });
  });

  it("appends: an existing ledger keeps every byte it had", async () => {
    const root = record(false);
    expect(await run(root, "--actor", ACTOR, "--reason", "one", "knowledge/policies/current")).toBe(
      0,
    );
    const first = readFileSync(join(root, ".ksor", "takedowns.yaml"), "utf8");
    expect(
      await run(root, "--actor", ACTOR, "--reason", "two", "knowledge/policies/old-threshold"),
    ).toBe(0);
    const second = readFileSync(join(root, ".ksor", "takedowns.yaml"), "utf8");
    expect(second.startsWith(first)).toBe(true);
  });

  it("refuses a ledger someone edited by hand, before adding to it", async () => {
    const root = record(false);
    writeFileSync(
      join(root, ".ksor", "takedowns.yaml"),
      "- id: x\n  revokes: nothing\n  by: human:ciso\n  at: 2026-08-25T10:00:00Z\n",
    );
    expect(await run(root, "--actor", ACTOR, "--reason", "x", "knowledge/policies/current")).toBe(
      1,
    );
    expect(err.join("").split("\n")[0]).toMatch(/^ksor-ledger-invalid:/);
  });

  it("--list and --ledger read, and need no actor", async () => {
    const root = record(true);
    process.env[DSN_ENV] = dsn;
    expect(
      await run(root, "--actor", ACTOR, "--reason", "legal", "knowledge/policies/current"),
    ).toBe(0);
    expect(await run(root, "--list")).toBe(0);
    expect(out.join("")).toContain("knowledge/policies/current");
    expect(await run(root, "--ledger")).toBe(0);
    expect(out.join(""), "the §7 act names its actor").toContain(ACTOR);
  });

  it("refuses two acts in one invocation, and an invocation naming none", async () => {
    const root = record(false);
    expect(await run(root)).toBe(1);
    expect(err.join("").split("\n")[0]).toMatch(/^ksor-takedown-unspecified:/);
    expect(await run(root, "--actor", ACTOR, "--reason", "x", "--apply", "knowledge/x")).toBe(1);
    expect(err.join("").split("\n")[0]).toMatch(/^ksor-takedown-ambiguous:/);
  });
});

describe.runIf(adminDsn === "")("ksor takedown (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
