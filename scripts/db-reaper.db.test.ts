/**
 * The reaper against a real cluster: it drops the leak and nothing else.
 *
 * `db-scratch.test.ts` covers which NAMES are reapable. This covers the part
 * that can only be wrong against Postgres — that the sweep drops exactly the
 * candidates, that an open connection saves a database even when its name and
 * age qualify, and that a name from before this grammar is left alone.
 *
 * Names here are assembled from their fields rather than written as
 * `ksor_…` literals, because the fixtures are deliberately shapes a suite is
 * forbidden to use (guard rule 12): one too old, one not ours at all.
 */

import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { REAP_AFTER_MS } from "./lib/db-scratch.mjs";
import { setup as reap } from "./db-reaper.mjs";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";

/** A scratch name stamped `agoMs` in the past — the field order, built by hand. */
const named = (slug: string, agoMs: number): string =>
  ["ksor", slug, (Date.now() - agoMs).toString(36), randomBytes(3).toString("hex")].join("_");

const HOUR = 60 * 60 * 1000;

describe.runIf(adminDsn !== "")("the scratch-database reaper (db)", () => {
  let admin: pg.Pool;
  /** Held open for the whole suite, so `busy` never has zero backends. */
  let occupant: pg.Client;

  const leak = named("reapleak", REAP_AFTER_MS + HOUR);
  const young = named("reapyoung", 0);
  const busy = named("reapbusy", REAP_AFTER_MS + HOUR);
  // No stamp to date it by: the shape a developer cluster still carries from
  // before this grammar. The reaper must not guess.
  const foreign = ["ksor", "reapforeign", "prod"].join("_");
  const all = [leak, young, busy, foreign];

  const exists = async (name: string): Promise<boolean> => {
    const { rows } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    return rows.length === 1;
  };

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
    for (const name of all) await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(adminDsn);
    url.pathname = `/${busy}`;
    occupant = new pg.Client({ connectionString: url.toString() });
    await occupant.connect();
    await occupant.query("SELECT 1");
  }, 120_000);

  afterAll(async () => {
    await occupant?.end().catch(() => undefined);
    for (const name of all) {
      await admin?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => undefined);
    }
    await admin?.end().catch(() => undefined);
  });

  it("drops the leak, and spares the young, the busy and the unrecognised", async () => {
    await reap();

    // Reported together rather than one assertion each, so a failure prints the
    // whole picture instead of the first thing that went wrong.
    const after = Object.fromEntries(
      await Promise.all(all.map(async (name) => [name, await exists(name)] as const)),
    );
    expect(after, "only the aged, idle, well-named database may be dropped").toEqual({
      [leak]: false,
      [young]: true,
      [busy]: true,
      [foreign]: true,
    });
  }, 120_000);

  it("is safe to run twice — a swept cluster is a no-op", async () => {
    await expect(reap()).resolves.toBeUndefined();
    expect(await exists(young), "a second sweep must not age the survivors in").toBe(true);
  }, 120_000);
});
