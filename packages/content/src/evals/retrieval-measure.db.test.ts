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

import { randomBytes } from "node:crypto";
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
import { RETRIEVAL_BASELINE } from "./baseline.js";
import { GATE_PREDICATE_DIGEST } from "../lib/search.js";
import { HANDBOOK_GOLD, HANDBOOK_OOC, NAV_NEGATIVE_SLUG, type GoldKind } from "./handbook-gold.js";
import type { ContentInstance } from "../instance.js";
import type { ServiceContext } from "../service.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const apiKey = process.env["GEMINI_API_KEY"] ?? "";
/** A real embedding space, or the measurement measures nothing. */
const canMeasure = adminDsn !== "" && apiKey !== "";
const DB = `ksor_retrieval_measure_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
const TENANT = "handbook-eval";
const KS = [1, 3, 5] as const;

/** The handbook fixture is a full record: instance, policy, concepts, generated index, lock. */
const RECORD_ROOT = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "handbook");

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
      title: TENANT,
      description: "An eval record.",
      toolchain: null,
      embeddingProvider: "gemini",
      embeddingModel: "gemini-embedding-001",
      embeddingDim: 1536,
    } as ContentInstance;

    await buildGeneration(pool, instance, {
      provider,
      recordRoot: RECORD_ROOT,
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
    // Against the recorded line, so a change arrives as a DELTA rather than as
    // a fresh number with nothing to compare it to.
    const b = RETRIEVAL_BASELINE;
    const delta = (now: number, was: number): string =>
      now === was ? "=" : now > was ? `+${now - was}` : `${now - was}`;
    lines.push(
      "",
      `  vs baseline ${b.measuredAt} (${b.embedding}):`,
      `    short-substantive @1  ${at(byKind("short-substantive"), 1)}/${b.shortSubstantiveTotal}` +
        `   baseline ${b.shortSubstantiveAt1}   ${delta(at(byKind("short-substantive"), 1), b.shortSubstantiveAt1)}`,
      `    long-prose        @1  ${at(byKind("long-prose"), 1)}/${b.longProseTotal}` +
        `   baseline ${b.longProseAt1}   ${delta(at(byKind("long-prose"), 1), b.longProseAt1)}`,
      `    nav negative          ${scored.filter((s) => s.hitNav).length}` +
        `      baseline ${b.navNegativeHits}   ${delta(scored.filter((s) => s.hitNav).length, b.navNegativeHits)}`,
      `  baseline note: ${b.note}`,
    );
    if (b.predicateDigest !== GATE_PREDICATE_DIGEST) {
      // Reported, not gated: the floors are the guarantee and they still hold
      // or they do not. What a reader must not do is compare these numbers to
      // the recorded ones as if they described the same candidate set.
      lines.push(
        "",
        `  PREDICATE MOVED: baseline measured through ${b.predicateDigest}, this run through ` +
          `${GATE_PREDICATE_DIGEST} — the candidate set is not the one the line was taken on. ` +
          "Re-record the baseline with this run's numbers and say what changed.",
      );
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

  it("short substantive facts are reachable — the #55 fix, held", () => {
    // This assertion USED to read "NOT reachable", pinning the defect: all nine
    // of these questions returned nothing, against a corpus that answers every
    // one of them. It flipped when `classify()` started deciding navigation by
    // shape instead of by length, which is what it was written to do — the
    // change arrived as a reviewed diff with numbers rather than as a silent
    // shift in what the record can answer.
    const short = scored.filter((s) => s.kind === "short-substantive");
    const unreachable = short.filter((s) => s.rank === null);
    expect(
      unreachable.map((s) => s.q),
      "a short substantive fact stopped being reachable — #55 is regressing",
    ).toEqual([]);
  });

  it("the nav negative is never the answer — correct, not merely permissive", () => {
    // The guard that separates a fixed classifier from a broken one. Admitting
    // everything would make every recall number above look better and make the
    // product worse: the index page is a list of links and must never be what a
    // content question retrieves.
    const leaked = scored.filter((s) => s.hitNav);
    expect(
      leaked.map((s) => s.q),
      "the link-list index page was returned as an answer to a content question",
    ).toEqual([]);
  });

  it("does not fall below the recorded baseline", () => {
    // Floors may RISE — record the rise in baseline.ts when they do. They may
    // not fall silently: a retrieval change that costs reach is a decision, and
    // this is where it has to be taken rather than noticed later.
    const at1 = (kind: GoldKind): number =>
      scored.filter((s) => s.kind === kind && s.rank !== null && s.rank <= 1).length;
    expect(
      at1("short-substantive"),
      `short-substantive success@1 fell below the ${RETRIEVAL_BASELINE.measuredAt} baseline`,
    ).toBeGreaterThanOrEqual(RETRIEVAL_BASELINE.shortSubstantiveAt1);
    expect(
      at1("long-prose"),
      `the long-prose control fell below the ${RETRIEVAL_BASELINE.measuredAt} baseline`,
    ).toBeGreaterThanOrEqual(RETRIEVAL_BASELINE.longProseAt1);
    // The ceiling, which is what keeps "better recall" honest.
    expect(
      scored.filter((s) => s.hitNav).length,
      "more gold questions returned the link-list page than the baseline allows",
    ).toBeLessThanOrEqual(RETRIEVAL_BASELINE.navNegativeHits);
  });
});
