/**
 * `ksor migrate` against a record that DECLARES a database and whose denylist
 * rows are really there — the population the upgrade runbook addresses, since
 * a record only ever grew denylist rows by climbing to the served rung.
 *
 * The integration tier covers the DSN-absent branch. It cannot cover this one:
 * reading the rows needs a real Postgres, and the bug that shipped lived
 * entirely in the read path — migrate handed the *not-yet-migrated* instance
 * to the kernel's format-2-only reader, so every served record was refused
 * before a single query ran, with a refusal that blamed the database and told
 * the operator to run the command that had just refused.
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyLedger,
  applySchema,
  contentPool,
  grantIngest,
  parseInstance,
  runIngest,
} from "@panaversity/ksor-content";
import { parseLedger } from "@panaversity/ksor-content/record";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";

import { runMigrate } from "./migrate/index.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
/**
 * Unique per RUN, not merely per checkout. The incident this name was first
 * written for is real and worth keeping: this suite used to drop its database
 * `WITH (FORCE)` before creating it, which terminated another checkout's
 * connections mid-INSERT with `terminating connection due to administrator
 * command` — observed live on a shared cluster. Deriving the name from the
 * admin database narrowed that to one checkout per cluster; the run stamp
 * closes it, because two runs from the SAME checkout collided just as hard
 * (issue #166). The pre-emptive drop is gone with it: a name nothing has ever
 * used cannot have a leftover to clear.
 */
const DB = `ksor_migrate_denials_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
const TENANT = "acme";
const DSN_ENV = "KSOR_MIGRATE_TEST_DSN";
const ACTOR = "human:mjs";
const AT = "2026-08-01T09:00:00.000Z";

const templatesDir = fileURLToPath(new URL("../templates/scaffold", import.meta.url));

describe.runIf(adminDsn !== "")("ksor migrate reads a declared database (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;
  const roots: string[] = [];

  const write = (root: string, rel: string, text: string): void => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };

  /** A PRE-PROFILE record (`format: 1`) that declares the database it was served from. */
  const record = (): string => {
    const root = mkdtempSync(path.join(tmpdir(), "ksor-migrate-db-"));
    roots.push(root);
    write(
      root,
      "instance.md",
      `---\nformat: 1\nname: ${TENANT}\ndatabase:\n  dsn_env: ${DSN_ENV}\n---\n\n# Acme\n\nOne sentence of scope.\n`,
    );
    write(
      root,
      "knowledge/a.md",
      "---\ntitle: A\ndescription: A doc.\nstatus: draft\n---\n\nBody.\n",
    );
    write(
      root,
      "knowledge/old.md",
      "---\ntitle: Old\ndescription: An old doc.\nstatus: draft\n---\n\nBody.\n",
    );
    return root;
  };

  const migrate = async (
    root: string,
    ...args: string[]
  ): Promise<{ code: number; out: string; err: string }> => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runMigrate(
      args,
      root,
      { out: (t) => void out.push(t), err: (t) => void err.push(t) },
      { version: "0.0.0-test", templatesDir },
    );
    return { code, out: out.join(""), err: err.join("") };
  };

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    process.env[DSN_ENV] = url.toString();
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, 1536);
    await grantIngest(pool, TENANT);
    await runIngest(pool, TENANT, async (c) => {
      await c.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 1)",
        [TENANT],
      );
      await c.query(
        "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, scope, reason, created_at)" +
          " VALUES ($1, $1, $2, 'node', $3, $4)",
        [TENANT, "knowledge/old", "published by mistake", AT],
      );
      await c.query(
        "INSERT INTO retrieval_log (tenant_id, corpus_id, actor, action, detail)" +
          " VALUES ($1, $1, $2, 'takedown_applied', $3)",
        [TENANT, "human:ciso", JSON.stringify({ stable_id: "knowledge/old" })],
      );
    });
  }, 180_000);

  afterAll(async () => {
    delete process.env[DSN_ENV];
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("migrates a pre-profile record whose denylist rows are in the database", async () => {
    const root = record();
    const r = await migrate(root, "--write", "--actor", ACTOR, "--generated-at", AT);
    expect(r.code, r.err).toBe(0);
    expect(r.err).toContain("read 1 denylist row(s)");

    const parsed = parseLedger(
      readFileSync(path.join(root, ".ksor", "takedowns.yaml"), "utf8"),
      ".ksor/takedowns.yaml",
    );
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.ledger.entries).toMatchObject([
      {
        kind: "denial",
        stableId: "knowledge/old",
        scope: "node",
        by: "human:ciso",
        reason: "published by mistake",
      },
    ]);
    // The instance it read is the one it rewrote, in the same run.
    expect(readFileSync(path.join(root, "instance.md"), "utf8")).toContain("format: 2");
  });

  it("refuses a subtree row naming a document as ONE well-formed refusal", async () => {
    // Every refusal this path can raise is a what/why/fix of its own now.
    // Nesting one inside another's `why:` printed two `why:` lines at two
    // different indents, which is how the format refusal shipped unreadable.
    await runIngest(pool, TENANT, (c) =>
      c.query(
        "UPDATE takedown_denylist SET scope = 'subtree' WHERE tenant_id = $1 AND stable_id = $2",
        [TENANT, "knowledge/old"],
      ),
    );
    const root = record();
    const r = await migrate(root, "--actor", ACTOR, "--generated-at", AT);
    await runIngest(pool, TENANT, (c) =>
      c.query(
        "UPDATE takedown_denylist SET scope = 'node' WHERE tenant_id = $1 AND stable_id = $2",
        [TENANT, "knowledge/old"],
      ),
    );
    expect(r.code).toBe(1);
    expect(r.err).toContain("error: ksor-migrate-underivable");
    expect(r.err).toContain("names a document, not a container");
    // One why:, one fix: — the shape `formatRefusal` renders, not a nest.
    expect(r.err.match(/why:/g) ?? [], r.err).toHaveLength(1);
    expect(r.err.match(/fix:/g) ?? [], r.err).toHaveLength(1);
  });
});

/**
 * The rows migrate REPOINTS, and the record it left unable to publish.
 *
 * A denial anchored on a reserved index follows the prose migrate moves out
 * from under it (`ledger-out.ts: repoint`) — and the `takedown_denylist` row it
 * came from still names the OLD path. Nothing in the ledger accounts for that
 * row, so `ksor ingest` refuses `ksor-takedown-unledgered`, `ksor serve`
 * refuses to boot, and the remedy both of them print — `ksor migrate --write` —
 * answered "nothing to migrate", because transcription was one-time. The stock
 * scaffold ships `knowledge/surfaces/index.md`, so any adopter who had ever
 * withdrawn a section upgraded into a record that could be neither published
 * nor served (reproduced live through the CLI against a real database,
 * 2026-08-26).
 */
describe.runIf(adminDsn !== "")("ksor migrate accounts for every denylist row (db)", () => {
  const DB2 = `ksor_migrate_repoint_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const DSN_ENV2 = "KSOR_MIGRATE_REPOINT_DSN";
  const DENIER = "human:ciso";
  const DENIED_AT = "2026-07-01T09:00:00Z";
  const OLD_ID = "knowledge/surfaces/index";
  const NEW_ID = "knowledge/surfaces/overview";
  let pool2: pg.Pool;
  let admin2: pg.Pool;
  const roots: string[] = [];

  const write = (root: string, rel: string, text: string): void => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };
  const read = (root: string, rel: string): string => readFileSync(path.join(root, rel), "utf8");

  const migrate = async (
    root: string,
    ...args: string[]
  ): Promise<{ code: number; out: string; err: string }> => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runMigrate(
      args,
      root,
      { out: (t) => void out.push(t), err: (t) => void err.push(t) },
      { version: "0.0.0-test", templatesDir },
    );
    return { code, out: out.join(""), err: err.join("") };
  };

  const INSTANCE_1 = `---\nformat: 1\nname: ${TENANT}\ndatabase:\n  dsn_env: ${DSN_ENV2}\nembedding:\n  provider: gemini\n  model: gemini-embedding-001\n  dim: 1536\n---\n\n# Acme\n\nOne sentence of scope.\n`;

  /** Applies the record's own ledger the way `ksor ingest` does, and reports what it left unaccounted. */
  const applyRecordLedger = async (
    root: string,
  ): Promise<{ unledgered: readonly string[]; rows: Record<string, unknown>[] }> => {
    const instance = parseInstance(path.join(root, "instance.md"));
    const parsed = parseLedger(read(root, ".ksor/takedowns.yaml"), ".ksor/takedowns.yaml");
    if (!parsed.ok) throw new Error(`ledger: ${JSON.stringify(parsed.refusals)}`);
    return await runIngest(pool2, TENANT, async (client) => {
      const report = await applyLedger(client, instance, parsed.ledger);
      const rows = await client.query(
        "SELECT stable_id, scope, ledger_id, expected FROM takedown_denylist" +
          " WHERE tenant_id = $1 ORDER BY stable_id",
        [TENANT],
      );
      return { unledgered: report.unledgered, rows: rows.rows as Record<string, unknown>[] };
    });
  };

  const denyRow = async (): Promise<void> => {
    await runIngest(pool2, TENANT, async (c) => {
      await c.query("DELETE FROM takedown_denylist WHERE tenant_id = $1", [TENANT]);
      await c.query(
        "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, scope, reason, created_at)" +
          " VALUES ($1, $1, $2, 'node', $3, $4)",
        [TENANT, OLD_ID, "withdrawn by legal", DENIED_AT],
      );
      await c.query(
        "INSERT INTO retrieval_log (tenant_id, corpus_id, actor, action, detail)" +
          " VALUES ($1, $1, $2, 'takedown_applied', $3)",
        [TENANT, DENIER, JSON.stringify({ stable_id: OLD_ID })],
      );
    });
  };

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin2 = new Pool({ connectionString: adminDsn });
    await admin2.query(`CREATE DATABASE ${DB2}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB2}`;
    process.env[DSN_ENV2] = url.toString();
    pool2 = contentPool(url.toString(), 4);
    await applySchema(pool2, 1536);
    await grantIngest(pool2, TENANT);
    await runIngest(pool2, TENANT, (c) =>
      c.query("INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 0)", [
        TENANT,
      ]),
    );
  }, 180_000);

  afterAll(async () => {
    delete process.env[DSN_ENV2];
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    await pool2?.end().catch(() => undefined);
    await admin2?.query(`DROP DATABASE IF EXISTS ${DB2} WITH (FORCE)`).catch(() => undefined);
    await admin2?.end().catch(() => undefined);
  });

  it("records the row it repointed as well as the concept the hold followed", async () => {
    await denyRow();
    const root = mkdtempSync(path.join(tmpdir(), "ksor-migrate-repoint-"));
    roots.push(root);
    write(root, "instance.md", INSTANCE_1);
    write(
      root,
      "knowledge/surfaces/index.md",
      "---\ntitle: Surfaces\ndescription: How surfaces work.\nstatus: draft\n---\n\nThe record publishes to two surfaces.\n",
    );

    const r = await migrate(root, "--write", "--actor", ACTOR, "--generated-at", AT);
    expect(r.code, r.err).toBe(0);

    const parsed = parseLedger(read(root, ".ksor/takedowns.yaml"), ".ksor/takedowns.yaml");
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (!parsed.ok) return;
    // The hold follows the prose; the ROW the hold came from is still recorded,
    // as the removed path it names.
    expect(
      parsed.ledger.entries.map((e) =>
        e.kind === "denial" ? [e.stableId, e.expected, e.by] : [e.kind],
      ),
    ).toEqual([
      [OLD_ID, "removed", DENIER],
      [NEW_ID, "present", DENIER],
    ]);

    const applied = await applyRecordLedger(root);
    expect(applied.unledgered, "ksor ingest would refuse ksor-takedown-unledgered").toEqual([]);
    expect(applied.rows.map((row) => [row["stable_id"], row["expected"]])).toEqual([
      [OLD_ID, "removed"],
      [NEW_ID, "present"],
    ]);
  });

  /**
   * The population that already ran the broken version: a ledger carrying only
   * the repointed entry, the original row still unaccounted, and the reserved
   * name back in the tree as the GENERATED index `ksor build` writes. The
   * printed remedy has to clear that state, and appending is the only thing an
   * append-only file permits.
   */
  it("appends the rows an existing ledger does not account for, and never rewrites it", async () => {
    await denyRow();
    const root = mkdtempSync(path.join(tmpdir(), "ksor-migrate-repair-"));
    roots.push(root);
    write(
      root,
      "instance.md",
      `---\nformat: 2\nname: ${TENANT}\ntitle: Acme\ndescription: One sentence of scope.\ndatabase:\n  dsn_env: ${DSN_ENV2}\nembedding:\n  provider: gemini\n  model: gemini-embedding-001\n  dim: 1536\n---\n\nOne sentence of scope.\n`,
    );
    write(
      root,
      "knowledge/surfaces/overview.md",
      `---\ntype: Document\ntitle: Surfaces\ndescription: How surfaces work.\nstatus: draft\ngenerated: {by: ksor-migrate/0.0.0-test, at: ${AT}}\nksor:\n  audience: [public]\n---\n\nThe record publishes to two surfaces.\n`,
    );
    write(root, "knowledge/surfaces/index.md", "# Surfaces\n\n* [Surfaces](overview.md)\n");
    write(root, "knowledge/index.md", "# Acme\n\n* [Surfaces](surfaces/index.md)\n");
    const ledgerBefore = [
      "# The takedown ledger — append-only, written by `ksor takedown` (record spec §5).",
      "# These entries were transcribed from the database's denylist by `ksor migrate`.",
      `- id: "${DENIED_AT}-151d58"`,
      `  stable_id: "${NEW_ID}"`,
      "  scope: node",
      "  expected: present",
      `  by: "${DENIER}"`,
      `  at: "${DENIED_AT}"`,
      '  reason: "withdrawn by legal"',
      "",
    ].join("\n");
    write(root, ".ksor/takedowns.yaml", ledgerBefore);
    write(
      root,
      ".ksor/governance.yaml",
      `version: "0.1"\napproval_authorities: [{actors: [${ACTOR}]}]\ntakedown_authorities: {actors: [${ACTOR}, ${DENIER}]}\n`,
    );

    const r = await migrate(root, "--write", "--actor", ACTOR, "--generated-at", AT);
    expect(r.code, `${r.out}\n${r.err}`).toBe(0);
    expect(r.out, "the printed remedy must not be a no-op").not.toContain("nothing to migrate");

    const after = read(root, ".ksor/takedowns.yaml");
    expect(after.startsWith(ledgerBefore), `append-only:\n${after}`).toBe(true);
    expect(after).toContain(OLD_ID);

    const applied = await applyRecordLedger(root);
    expect(applied.unledgered, "the remedy did not clear the state it names").toEqual([]);
  });
});
