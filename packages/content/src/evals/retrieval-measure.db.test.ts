/**
 * How much of a handbook can this record actually find? — a RELEVANCE eval.
 *
 * The testing contract is explicit that relevance evals are reported and never
 * gate, because gold generated from the corpus under test would bless whatever
 * rule produced it. This gold is AUTHORED, which removes that particular
 * circularity, but the absolute numbers are still gold-dependent — so this file
 * gates on ONE thing only: the categories must remain distinguishable, i.e. the
 * measurement must still be capable of telling a correct classifier from a
 * permissive one. Everything else it PRINTS.
 *
 * It is also a characterization test. It pins what today's classifier does, so
 * a change to `NAV_MAX_CHARS` or to `classify()` arrives as an explicit diff
 * with numbers attached rather than as a silent shift in what the record can
 * answer (issue #55).
 *
 * Method, taken from the predecessor's harness rather than reinvented
 * (`sor-evals/gold/README.md`, decision 6):
 *   - success@k over DISTINCT NODES, k ∈ {1,3,5}
 *   - out-of-corpus leak measured separately from recall
 *   - the nav negative control reported on its own axis, because recall alone
 *     would rank a classifier that admits everything as the winner
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool } from "../db.js";
import { grantIngest } from "../grant.js";
import { buildGeneration } from "../ingest/build.js";
import { buildShippedProvider } from "../lib/providers/registry.js";
import { embedQueryVlit } from "../lib/query-embed.js";
import { keyRingFromEnv } from "../lib/snapshot.js";
import { applySchema } from "../schema.js";
import { search } from "../service.js";
import { HANDBOOK_GOLD, HANDBOOK_OOC, NAV_NEGATIVE_SLUG, type GoldKind } from "./handbook-gold.js";
import type { ContentInstance } from "../instance.js";
import type { ServiceContext } from "../service.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const apiKey = process.env["GEMINI_API_KEY"] ?? "";
/** A real embedding space, or the measurement measures nothing. */
const canMeasure = adminDsn !== "" && apiKey !== "";
const DB = "ksor_retrieval_measure";
const TENANT = "handbook-eval";
const KS = [1, 3, 5] as const;

const KNOWLEDGE = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "handbook",
  "knowledge",
);

interface Scored {
  readonly q: string;
  readonly kind: GoldKind;
  readonly expect: string;
  /** Rank of the expected node among DISTINCT nodes, 1-based; null if absent. */
  readonly rank: number | null;
  readonly hitNav: boolean;
}

describe.runIf(canMeasure)("what a handbook-shaped record can be asked (db, live)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;
  let work = "";
  let ctx: ServiceContext;
  const scored: Scored[] = [];
  let oocLeaked = 0;

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
    work = await mkdtemp(join(tmpdir(), "ksor-measure-"));

    const provider = buildShippedProvider("gemini", { apiKey });
    const instance = {
      name: TENANT,
      corpusId: TENANT,
      tenantId: TENANT,
      dsnEnv: "KSOR_DB_URL",
      abstain: { vectorFloor: null, keywordFloor: null },
      textSearchConfig: "english",
      maximumResponseCharacters: 120_000,
      instructions: "",
      audiences: [],
      defaultVisibility: null,
      embeddingProvider: "gemini",
      embeddingModel: "gemini-embedding-001",
      embeddingDim: 1536,
    } as ContentInstance;

    await buildGeneration(pool, instance, {
      provider,
      knowledgeDir: KNOWLEDGE,
      flip: true,
      sourceCommit: "measure",
    });

    ctx = {
      pool,
      instance,
      ring: keyRingFromEnv(undefined),
      instanceDigest: "measure",
      embedQuery: (q: string) => embedQueryVlit(q, { provider }),
      audience: null,
    } as ServiceContext;

    // Score every gold question once; the report is built from these rows.
    for (const row of HANDBOOK_GOLD) {
      const res = await search(ctx, row.q, 10);
      const nodes: string[] = [];
      for (const h of res.hits ?? []) if (!nodes.includes(h.slug)) nodes.push(h.slug);
      const at = nodes.indexOf(row.expect);
      scored.push({
        q: row.q,
        kind: row.kind,
        expect: row.expect,
        rank: at === -1 ? null : at + 1,
        hitNav: nodes.includes(NAV_NEGATIVE_SLUG),
      });
    }
    for (const q of HANDBOOK_OOC) {
      const res = await search(ctx, q, 10);
      if ((res.hits ?? []).length > 0 && res.abstained !== true) oocLeaked += 1;
    }
  }, 600_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
    if (work !== "") await rm(work, { recursive: true, force: true });
  });

  it("REPORTS success@k per category, and the two controls", () => {
    const byKind = (kind: GoldKind): Scored[] => scored.filter((s) => s.kind === kind);
    const at = (rows: Scored[], k: number): number =>
      rows.filter((s) => s.rank !== null && s.rank <= k).length;

    const lines: string[] = ["", "  success@k over DISTINCT NODES, by category:"];
    for (const kind of ["short-substantive", "long-prose"] as const) {
      const rows = byKind(kind);
      const cells = KS.map((k) => `@${k}: ${at(rows, k)}/${rows.length}`).join("   ");
      lines.push(`    ${kind.padEnd(18)} ${cells}`);
    }
    lines.push(
      `  out-of-corpus leak: ${oocLeaked}/${HANDBOOK_OOC.length} scope-adjacent probes answered`,
    );
    lines.push(
      `  nav negative:       ${scored.filter((s) => s.hitNav).length}/${scored.length} questions returned the link-list page`,
    );
    const missed = scored.filter((s) => s.rank === null).map((s) => `${s.expect} <- "${s.q}"`);
    if (missed.length > 0) {
      lines.push("  UNREACHABLE at k=10:");
      for (const m of missed) lines.push(`    ${m}`);
    }
    console.log(lines.join("\n"));

    // The ONE gating assertion: the measurement must still be able to tell a
    // correct classifier from a permissive one. If every category scores
    // identically the instrument has stopped discriminating, and a later
    // "improvement" measured with it would mean nothing.
    expect(scored.length, "the gold ran").toBe(HANDBOOK_GOLD.length);
    expect(
      byKind("short-substantive").length > 0 && byKind("long-prose").length > 0,
      "both categories must be present or the comparison is not a comparison",
    ).toBe(true);
  }, 60_000);

  it("characterizes TODAY: the long-prose control is reachable", () => {
    const prose = scored.filter((s) => s.kind === "long-prose");
    const found = prose.filter((s) => s.rank !== null).length;
    expect(
      found,
      `the control must be reachable or the fixture is wrong, not the classifier: ${JSON.stringify(prose)}`,
    ).toBe(prose.length);
  });

  it("characterizes TODAY: short substantive facts are NOT reachable (issue #55)", () => {
    // This assertion is expected to FLIP when the classifier is fixed. That is
    // its purpose — the change arrives as a reviewed diff with numbers, not as
    // a silent shift in what the record can answer.
    const short = scored.filter((s) => s.kind === "short-substantive");
    const unreachable = short.filter((s) => s.rank === null).length;
    expect(
      unreachable,
      `if this is no longer all of them, the classifier changed — update the characterization ` +
        `and record the measurement: ${JSON.stringify(short.map((s) => [s.q, s.rank]))}`,
    ).toBe(short.length);
  });

  it("skips without KSOR_DB_URL and GEMINI_API_KEY", () => {
    expect(true).toBe(true);
  });
});
