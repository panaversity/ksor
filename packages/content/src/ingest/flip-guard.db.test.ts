/**
 * The pre-flip guards, through the COMMAND — the path an adopter runs.
 *
 * `ingest.db.test.ts` (5) covers the shrink guard by calling `buildGeneration`
 * with `flip: true`. That kept passing while the guard stopped working: `ksor
 * ingest --flip` now builds with `flip: false` and flips itself afterwards, so
 * the governance gate can run against the new generation BEFORE it becomes the
 * active one — and the shrink check, which lived inside the build's flip
 * branch, was stepped straight over. A record that lost 80% of its documents
 * published without a word (found live 2026-08-21, auditing 0.0.10).
 *
 * So this drives `runContentCli` itself. A guard that only one of two flip
 * paths performs is not a guard, and the tier that proves it has to install the
 * same path the adopter does.
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runContentCli } from "../commands.js";
import { contentPool } from "../db.js";
import { grantIngest } from "../grant.js";
import { applySchema } from "../schema.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_flip_guard";

let work = "";
let dsn = "";
let pool: pg.Pool;
let admin: pg.Pool;
let out: string[] = [];

const note = (i: number): string =>
  `---\ntitle: Note ${i}\nstatus: approved\n---\n\n# Note ${i}\n\nA guard-fixture note, number ${i}, written past the navigation floor so it is\nindexed as prose rather than skipped as structure.\n`;

/** Write a knowledge tree with `count` documents, and return its path. */
async function corpusOf(name: string, count: number): Promise<string> {
  const dir = join(work, name, "knowledge");
  await mkdir(dir, { recursive: true });
  for (let i = 1; i <= count; i += 1) await writeFile(join(dir, `note-${i}.md`), note(i), "utf8");
  return dir;
}

async function ingest(knowledge: string, flip: boolean): Promise<number> {
  out = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string): boolean => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    return await runContentCli([
      "ingest",
      "--instance",
      join(work, "instance.md"),
      "--knowledge",
      knowledge,
      ...(flip ? ["--flip"] : []),
    ]);
  } finally {
    process.stdout.write = write;
  }
}

const active = async (): Promise<number> =>
  Number(
    (await pool.query("SELECT active_generation FROM corpora WHERE tenant_id = 'guard'")).rows[0]
      ?.active_generation ?? 0,
  );

describe.runIf(adminDsn !== "")("ksor ingest --flip refuses what serving would (db)", () => {
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
    await grantIngest(pool, "guard");

    work = await mkdtemp(join(tmpdir(), "ksor-flip-guard-"));
    await writeFile(
      join(work, "instance.md"),
      `---\nformat: 1\nname: guard\ndatabase:\n  dsn_env: KSOR_FLIP_GUARD_DSN\nembedding:\n  provider: fake\n---\n\n# Guard\n\nThis record exists to drive the ingest command's pre-flip guards.\n`,
      "utf8",
    );
    process.env["KSOR_FLIP_GUARD_DSN"] = dsn;
  }, 300_000);

  afterAll(async () => {
    delete process.env["KSOR_FLIP_GUARD_DSN"];
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
    if (work !== "") await rm(work, { recursive: true, force: true });
  });

  it("publishes a first generation, and prints the pre-flip delta it decided on", async () => {
    expect(await ingest(await corpusOf("full", 10), true)).toBe(0);
    expect(await active()).toBe(1);
    // The delta line is the guard's own evidence. It vanished entirely when the
    // guard was bypassed, which is how the bypass was visible at all.
    expect(out.join(""), "the command must SAY what it compared").toMatch(/pre-flip delta vs gen/);
  });

  it("REFUSES to activate a generation that lost most of the record", async () => {
    const code = await ingest(await corpusOf("shrunk", 2), true);
    const text = out.join("");
    expect(code, `exit code; output was:\n${text}`).toBe(1);
    expect(await active(), "the previous generation must keep serving").toBe(1);
  });

  it("activates the same shrunken corpus when the drop is declared deliberate", async () => {
    process.env["KSOR_ALLOW_SHRINK"] = "1";
    try {
      expect(await ingest(await corpusOf("shrunk2", 2), true)).toBe(0);
      expect(await active()).toBeGreaterThan(1);
    } finally {
      delete process.env["KSOR_ALLOW_SHRINK"];
    }
  });

  it("never refuses a build that was not asked to activate", async () => {
    const before = await active();
    expect(await ingest(await corpusOf("nano", 1), false)).toBe(0);
    expect(await active(), "no flip was requested, so nothing moved").toBe(before);
  });
});
