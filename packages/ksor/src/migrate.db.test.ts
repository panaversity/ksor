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
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applySchema, contentPool, grantIngest, runIngest } from "@panaversity/ksor-content";
import { parseLedger } from "@panaversity/ksor-content/record";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";

import { runMigrate } from "./migrate/index.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
/**
 * Suffixed with the ADMIN database's own name, so two checkouts of this
 * repository pointed at one cluster do not share a scratch database. A fixed
 * name is not merely untidy here: this suite drops its database `WITH (FORCE)`
 * between runs, which terminates the other checkout's connections mid-INSERT
 * with `terminating connection due to administrator command` — observed live
 * on a shared cluster.
 */
const DB = `ksor_migrate_denials_${(adminDsn === "" ? "x" : new URL(adminDsn).pathname.slice(1)).replace(/[^a-z0-9_]/gi, "_")}`;
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
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
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
